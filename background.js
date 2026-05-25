const DEFAULT_PREAMBLE =
	"Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:";

chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason === "install") {
		chrome.storage.sync.set({ preamble: DEFAULT_PREAMBLE });
	}
});

// Handle fetch requests from content scripts (bypasses CORS)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "OPEN_GEMINI_TAB" && message.url) {
		chrome.tabs.create({ url: message.url });
		sendResponse({ success: true });
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
