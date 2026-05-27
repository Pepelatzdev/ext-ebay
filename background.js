/**
 * eBay Copy Assistant — Background Service Worker.
 *
 * Handles:
 *   - Default storage initialization on install
 *   - Cross-origin description fetching (bypasses CORS)
 *   - Opening Gemini tabs with URL validation
 */

importScripts("config.js");

/* global ECA */

chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === "install") {
		chrome.storage.sync.set({ preamble: ECA.DEFAULT_PREAMBLE });
	}
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OPEN_GEMINI_TAB" && message.url) {
		try {
			const url = new URL(message.url);
			if (!url.protocol.startsWith("http")) {
				sendResponse({ success: false, error: "Invalid URL protocol" });
				return false;
			}
			chrome.tabs.create({ url: message.url });
			sendResponse({ success: true });
		} catch (err) {
			sendResponse({ success: false, error: err.message });
		}
		return false;
	}

	if (message.type === "FETCH_DESCRIPTION" && message.url) {
		fetch(message.url, { credentials: "omit" })
			.then((resp) => {
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return resp.text();
			})
			.then((html) => {
				sendResponse({ success: true, html });
			})
			.catch((err) => {
				sendResponse({ success: false, error: err.message });
			});
		return true; // Keep message channel open for async response
	}
});
