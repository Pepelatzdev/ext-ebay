/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: Gemini content-script global */
var ECAGeminiAttachments = (() => {
	function selectors() {
		return [
			'img[alt*="attachment" i]',
			'[aria-label*="attachment" i]',
			'[data-test-id*="attachment" i]',
		];
	}

	function hasAttachment() {
		return selectors().some((selector) => document.querySelector(selector));
	}

	function waitForAttachment(timeoutMs = 15_000) {
		if (hasAttachment()) return Promise.resolve(true);
		return new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				if (!hasAttachment()) return;
				observer.disconnect();
				clearTimeout(timer);
				resolve(true);
			});
			const timer = setTimeout(() => {
				observer.disconnect();
				resolve(false);
			}, timeoutMs);
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
				attributes: true,
			});
		});
	}

	async function attachFile(editor, file, identity, options = {}) {
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
		editor.focus();
		editor.dispatchEvent(
			new ClipboardEvent("paste", {
				bubbles: true,
				clipboardData: dataTransfer,
			}),
		);
		const accepted = await (options.waitForAttachment || waitForAttachment)();
		return accepted
			? { ok: true, status: "attached", photoId: identity }
			: {
					ok: false,
					status: "failed",
					photoId: identity,
					error: "Gemini did not confirm the attachment",
				};
	}

	return { attachFile, waitForAttachment };
})();
