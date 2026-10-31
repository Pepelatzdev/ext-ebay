/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAChromeClient = (() => {
	function create({ chrome, navigator, policy }) {
		return {
			getSettings() {
				return chrome.storage.sync.get({
					preamble: policy.DEFAULT_PREAMBLE,
					geminiUrl: policy.DEFAULT_GEMINI_URL,
				});
			},
			saveSettings(value) {
				return chrome.storage.sync.set(value);
			},
			async getReport(itemId) {
				const key = `chat_${itemId}`;
				return (await chrome.storage.sync.get([key]))[key];
			},
			send(type, extra = {}) {
				return chrome.runtime.sendMessage({ type, ...extra });
			},
			copy(text) {
				return navigator.clipboard.writeText(text);
			},
			onChanged(handler) {
				chrome.storage.onChanged.addListener(handler);
			},
		};
	}
	return { create };
})();
