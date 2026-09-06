/**
 * eBay Copy Assistant — Gemini-side request orchestration.
 *
 * Claims only the request bound to this tab, verifies insertion through the
 * editor adapter, ACKs it, and asks the service worker to persist the chat URL.
 */

/* global chrome, ECA, ECAGeminiEditor */
(() => {
	async function send(type, extra = {}) {
		return chrome.runtime.sendMessage({ type, ...extra });
	}

	function comparableUrl(rawUrl) {
		try {
			const url = new URL(rawUrl);
			return `${url.origin}${url.pathname}`;
		} catch {
			return null;
		}
	}

	function waitForChatUrl(initialUrl = window.location.href) {
		const initial = comparableUrl(initialUrl);
		return new Promise((resolve) => {
			let attempts = 0;
			const timer = setInterval(() => {
				attempts++;
				const current = comparableUrl(window.location.href);
				if (
					current !== initial &&
					ECA.isGeminiReportUrl(window.location.href)
				) {
					clearInterval(timer);
					resolve(window.location.href);
				} else if (attempts >= 300) {
					clearInterval(timer);
					resolve(null);
				}
			}, 1000);
		});
	}

	async function run() {
		const editor = await ECAGeminiEditor.waitForEditor();
		if (!editor) return;
		const claimed = await send(ECA.MESSAGE.CLAIM);
		const request = claimed?.request;
		if (!claimed?.success || !request) return;

		if (request.state === "pending") {
			if (!ECAGeminiEditor.insertPrompt(editor, request.prompt)) return;
			const ack = await send(ECA.MESSAGE.ACK_INSERTED);
			if (!ack?.success) return;
		}

		const chatUrl = await waitForChatUrl(request.targetUrl);
		if (chatUrl) {
			await send(ECA.MESSAGE.SAVE_REPORT, { url: chatUrl });
		}
	}

	run().catch((error) => {
		if (!String(error?.message).includes("Extension context invalidated")) {
			console.warn("eBay Copy Assistant: Gemini flow failed", error);
		}
	});
})();
