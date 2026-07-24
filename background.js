/**
 * eBay Copy Assistant — Background Service Worker.
 *
 * Owns Gemini request state, report persistence, validated tab creation,
 * and cross-origin description fetching.
 */

importScripts("config.js", "request-store.js", "report-store.js");

/* global chrome, ECA, ECAReportStore, ECARequestStore */

function isAllowedDescriptionUrl(rawUrl) {
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== "http:" && url.protocol !== "https:") return false;
		return ECA.DESC_FETCH_HOST_SUFFIXES.some(
			(suffix) =>
				url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix),
		);
	} catch {
		return false;
	}
}

function isAllowedGeminiUrl(rawUrl) {
	try {
		const url = new URL(rawUrl);
		return url.protocol === "https:" && url.hostname === ECA.GEMINI_HOST;
	} catch {
		return false;
	}
}

function isEbayItemSender(sender) {
	try {
		const url = new URL(sender.url);
		return (
			url.protocol === "https:" &&
			/(^|\.)ebay\./.test(url.hostname) &&
			ECA.ITEM_ID_RE.test(url.pathname)
		);
	} catch {
		return false;
	}
}

function isGeminiSender(sender) {
	try {
		const url = new URL(sender.url);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			Number.isInteger(sender.tab?.id)
		);
	} catch {
		return false;
	}
}

async function fetchDescription(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ECA.DESC_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			credentials: "omit",
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return { success: true, html: await response.text() };
	} catch (error) {
		return { success: false, error: error.message };
	} finally {
		clearTimeout(timer);
	}
}

async function handleMessage(message, sender) {
	if (message.type === ECA.MESSAGE.START) {
		if (!isEbayItemSender(sender)) {
			return { success: false, error: "Disallowed sender" };
		}
		if (!/^\d+$/.test(message.itemId) || typeof message.prompt !== "string") {
			return { success: false, error: "Invalid request" };
		}
		if (
			message.prompt.length > ECA.MAX_PROMPT_CHARS ||
			!isAllowedGeminiUrl(message.url)
		) {
			return { success: false, error: "Invalid prompt or Gemini URL" };
		}
		const tab = await chrome.tabs.create({ url: message.url });
		await ECARequestStore.create(tab.id, {
			itemId: message.itemId,
			prompt: message.prompt,
		});
		return { success: true, tabId: tab.id };
	}
	if (message.type === ECA.MESSAGE.CLAIM) {
		if (!isGeminiSender(sender)) {
			return { success: false, error: "Disallowed sender" };
		}
		return {
			success: true,
			request: await ECARequestStore.get(sender.tab.id),
		};
	}
	if (message.type === ECA.MESSAGE.ACK_INSERTED) {
		if (!isGeminiSender(sender)) {
			return { success: false, error: "Disallowed sender" };
		}
		return {
			success: Boolean(await ECARequestStore.markInserted(sender.tab.id)),
		};
	}
	if (message.type === ECA.MESSAGE.SAVE_REPORT) {
		if (!isGeminiSender(sender) || !isAllowedGeminiUrl(message.url)) {
			return { success: false, error: "Invalid report" };
		}
		const request = await ECARequestStore.get(sender.tab.id);
		if (request?.state !== "waiting_for_chat") {
			return { success: false, error: "No active request" };
		}
		await ECAReportStore.save(request.itemId, message.url);
		await ECARequestStore.remove(sender.tab.id);
		return { success: true };
	}
	if (message.type === ECA.MESSAGE.FETCH_DESCRIPTION) {
		if (!isAllowedDescriptionUrl(message.url)) {
			return { success: false, error: "Disallowed fetch URL" };
		}
		return fetchDescription(message.url);
	}
	return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessage(message, sender)
		.then(sendResponse)
		.catch((error) => sendResponse({ success: false, error: error.message }));
	return true;
});

chrome.tabs.onRemoved.addListener((tabId) => ECARequestStore.remove(tabId));
chrome.alarms.onAlarm.addListener((alarm) => {
	const tabId = ECARequestStore.tabIdFromAlarm(alarm.name);
	if (tabId !== null) return ECARequestStore.remove(tabId);
});

chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason !== "install") return;
	const existing = await chrome.storage.sync.get(["preamble", "geminiUrl"]);
	const defaults = {};
	if (!existing.preamble) defaults.preamble = ECA.DEFAULT_PREAMBLE;
	if (!existing.geminiUrl) defaults.geminiUrl = ECA.DEFAULT_GEMINI_URL;
	if (Object.keys(defaults).length > 0) {
		await chrome.storage.sync.set(defaults);
	}
});
