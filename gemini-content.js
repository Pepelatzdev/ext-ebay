/**
 * eBay Copy Assistant — Gemini-side request orchestration.
 *
 * Claims only the request bound to this tab, verifies insertion through the
 * editor adapter, ACKs it, and asks the service worker to persist the chat URL.
 */

/* global chrome, ECA, ECAGeminiEditor, ECAGeminiAttachments */
(() => {
	async function send(type, extra = {}) {
		return chrome.runtime.sendMessage({ type, ...extra });
	}

	async function attachSelectedPhotos(request) {
		if (!request.photos?.length) return { success: true, completed: [] };
		const prepared = await send(ECA.MESSAGE.PREPARE_PHOTOS, {
			requestId: request.requestId,
		});
		if (!prepared?.success)
			return {
				success: false,
				failed: request.photos.map((photo) => photo.photoId),
			};
		const failed = [...(prepared.failed || []).map((photo) => photo.photoId)];
		for (const photo of prepared.photos || []) {
			const parts = [];
			for (let chunkIndex = 0; ; chunkIndex += 1) {
				const chunk = await send(ECA.MESSAGE.GET_PHOTO_CHUNK, {
					requestId: request.requestId,
					photoId: photo.photoId,
					chunkIndex,
				});
				if (!chunk?.success) {
					failed.push(photo.photoId);
					break;
				}
				parts.push(ECAPhotoTransfer.fromBase64(chunk.data));
				if (chunk.last) break;
			}
			if (failed.includes(photo.photoId)) continue;
			const size = parts.reduce((total, part) => total + part.length, 0);
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const part of parts) {
				bytes.set(part, offset);
				offset += part.length;
			}
			const file = new File([bytes], `${photo.photoId}.image`, {
				type: photo.mimeType,
			});
			const attached = await ECAGeminiAttachments.attachFile(
				request.editor,
				file,
				photo.photoId,
			);
			if (!attached.ok) {
				failed.push(photo.photoId);
				continue;
			}
			await send(ECA.MESSAGE.PHOTO_READY, {
				requestId: request.requestId,
				photoId: photo.photoId,
			});
		}
		return { success: failed.length === 0, failed };
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
			const ack = await send(
				ECA.MESSAGE.ACK_INSERTED,
				request.requestId ? { requestId: request.requestId } : {},
			);
			if (!ack?.success) return;
		}
		if (request.photos?.length) {
			request.editor = editor;
			const attachments = await attachSelectedPhotos(request);
			if (!attachments.success) return;
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
