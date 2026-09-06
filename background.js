/**
 * eBay Copy Assistant — Background Service Worker.
 *
 * Owns Gemini request state, report persistence, validated tab creation,
 * and cross-origin description fetching.
 */

importScripts(
	"config.js",
	"message-validation.js",
	"request-store.js",
	"report-store.js",
);

/* global chrome, ECA, ECAMessageValidation, ECAReportStore, ECARequestStore */

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
	if (message?.type === ECA.MESSAGE.START) {
		const validation = ECAMessageValidation.validateStart(message, sender);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		const tab = await chrome.tabs.create({ url: message.url });
		await ECARequestStore.create(tab.id, {
			itemId: message.itemId,
			prompt: message.prompt,
			targetUrl: message.url,
		});
		return { success: true, tabId: tab.id };
	}
	if (message?.type === ECA.MESSAGE.CLAIM) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.CLAIM,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		return {
			success: true,
			request: await ECARequestStore.get(sender.tab.id),
		};
	}
	if (message?.type === ECA.MESSAGE.ACK_INSERTED) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.ACK_INSERTED,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		return {
			success: Boolean(await ECARequestStore.markInserted(sender.tab.id)),
		};
	}
	if (message?.type === ECA.MESSAGE.SAVE_REPORT) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.SAVE_REPORT,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		const request = await ECARequestStore.get(sender.tab.id);
		if (request?.state !== "waiting_for_chat") {
			return { success: false, error: "No active request" };
		}
		await ECAReportStore.save(request.itemId, message.url);
		await ECARequestStore.remove(sender.tab.id);
		return { success: true };
	}
	if (message?.type === ECA.MESSAGE.FETCH_DESCRIPTION) {
		const validation = ECAMessageValidation.validateDescription(
			message,
			sender,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
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
