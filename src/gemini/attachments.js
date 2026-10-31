/* biome-ignore-all lint/correctness/noUnusedVariables: Gemini content-script global */
var ECAGeminiAttachments = (() => {
	const IMAGE_SELECTOR =
		'img[data-test-id="uploaded-img"], img.preview-image, img.gem-attachment-style-img';

	function waitForAttachment(
		root,
		previous,
		timeoutMs = 15_000,
		expectedCount = 1,
	) {
		return new Promise((resolve) => {
			let readySince = null;
			const observer = new MutationObserver(check);
			const poll = setInterval(check, 100);
			const timer = setTimeout(() => finish(false), timeoutMs);
			function finish(value) {
				observer.disconnect();
				clearTimeout(timer);
				clearInterval(poll);
				root.removeEventListener("load", check, true);
				resolve(value);
			}
			function check() {
				const ready =
					Array.from(root.querySelectorAll(IMAGE_SELECTOR)).filter(
						(image) =>
							!previous.has(image) &&
							image.getAttribute("src") &&
							image.complete &&
							image.naturalWidth > 0 &&
							image.naturalHeight > 0,
					).length >= expectedCount;
				const sendButton = root.querySelector(
					'button.send-button, button[data-test-id="send-button"], button[aria-label="Send message"], button[aria-label="Надіслати повідомлення"]',
				);
				if (
					root.isConnected &&
					ready &&
					(!sendButton ||
						(!sendButton.disabled &&
							sendButton.getAttribute("aria-disabled") !== "true")) &&
					!root.querySelector('[role="progressbar"], [aria-busy="true"]')
				) {
					readySince ??= Date.now();
					if (Date.now() - readySince >= 1000) finish(true);
				} else {
					readySince = null;
				}
			}
			observer.observe(root, {
				childList: true,
				subtree: true,
				attributes: true,
			});
			root.addEventListener("load", check, true);
			check();
		});
	}

	async function attachFiles(editor, files, options = {}) {
		const root = editor.closest("input-container") || editor.parentElement;
		if (!root || !files.length || files.some((file) => !file.size))
			return { ok: false, status: "failed", photoId: null };
		const previous = new Set(root.querySelectorAll(IMAGE_SELECTOR));
		const dataTransfer = new DataTransfer();
		for (const file of files) dataTransfer.items.add(file);
		editor.focus();
		editor.dispatchEvent(
			new ClipboardEvent("paste", {
				bubbles: true,
				cancelable: true,
				composed: true,
				clipboardData: dataTransfer,
			}),
		);
		const accepted = await (options.waitForAttachment || waitForAttachment)(
			root,
			previous,
			30_000,
			files.length,
		);
		return accepted
			? { ok: true, status: "attached", photoId: null }
			: {
					ok: false,
					status: "failed",
					photoId: null,
					error: "Gemini did not confirm the attachment",
				};
	}

	async function attachFile(editor, file, identity, options = {}) {
		return {
			...(await attachFiles(editor, [file], options)),
			photoId: identity,
		};
	}

	return { attachFile, attachFiles, waitForAttachment };
})();
