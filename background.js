/**
 * eBay Copy Assistant — Background Service Worker.
 *
 * Handles:
 *   - Default storage initialization on install
 *   - Cross-origin description fetching (bypasses CORS, allow-listed hosts)
 *   - Opening Gemini tabs with host validation
 */

importScripts("config.js");

/* global ECA */

function isAllowedDescriptionUrl(rawUrl) {
	try {
		const u = new URL(rawUrl);
		if (u.protocol !== "http:" && u.protocol !== "https:") return false;
		return ECA.DESC_FETCH_HOST_SUFFIXES.some(
			(suffix) => u.hostname === suffix.slice(1) || u.hostname.endsWith(suffix),
		);
	} catch {
		return false;
	}
}

function isAllowedGeminiUrl(rawUrl) {
	try {
		const u = new URL(rawUrl);
		if (u.protocol !== "https:") return false;
		return u.hostname === ECA.GEMINI_HOST;
	} catch {
		return false;
	}
}

chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === "install") {
		chrome.storage.sync.set({ preamble: ECA.DEFAULT_PREAMBLE });
	}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OPEN_GEMINI_TAB" && message.url) {
		if (!isAllowedGeminiUrl(message.url)) {
			sendResponse({ success: false, error: "Disallowed Gemini URL" });
			return false;
		}
		chrome.tabs.create({ url: message.url }, () => {
			const err = chrome.runtime.lastError;
			sendResponse(
				err ? { success: false, error: err.message } : { success: true },
			);
		});
		return true;
	}

	if (message.type === "FETCH_DESCRIPTION" && message.url) {
		if (!isAllowedDescriptionUrl(message.url)) {
			sendResponse({ success: false, error: "Disallowed fetch URL" });
			return false;
		}

		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(),
			ECA.DESC_FETCH_TIMEOUT_MS,
		);

		fetch(message.url, { credentials: "omit", signal: controller.signal })
			.then((resp) => {
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return resp.text();
			})
			.then((html) => {
				sendResponse({ success: true, html });
			})
			.catch((err) => {
				sendResponse({ success: false, error: err.message });
			})
			.finally(() => clearTimeout(timer));

		return true; // Keep message channel open for async response
	}
});
