/* biome-ignore-all lint/correctness/noUnusedVariables: Gemini content-script global */
var ECAGeminiAttachments = (() => {
	const IMAGE_SELECTOR =
		'img[data-test-id="uploaded-img"], img.preview-image, img.gem-attachment-style-img';

	function waitForAttachment(root, previous, timeoutMs = 15_000) {
		return new Promise((resolve) => {
			const observer = new MutationObserver(check);
			const timer = setTimeout(() => finish(false), timeoutMs);
			function finish(value) {
				observer.disconnect();
				clearTimeout(timer);
				root.removeEventListener("load", check, true);
				resolve(value);
			}
			function check() {
				const ready = Array.from(root.querySelectorAll(IMAGE_SELECTOR)).some(
					(image) =>
						!previous.has(image) &&
						image.getAttribute("src") &&
						image.complete &&
						image.naturalWidth > 0 &&
						image.naturalHeight > 0,
				);
				if (
					ready &&
					!root.querySelector('[role="progressbar"], [aria-busy="true"]')
				)
					finish(true);
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

	async function attachFile(editor, file, identity, options = {}) {
		const root = editor.closest("input-container") || editor.parentElement;
		if (!root || !file.size)
			return { ok: false, status: "failed", photoId: identity };
		const previous = new Set(root.querySelectorAll(IMAGE_SELECTOR));
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
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
		);
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
