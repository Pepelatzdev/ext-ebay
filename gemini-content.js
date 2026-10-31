/**
 * eBay Copy Assistant — Gemini-side request orchestration.
 *
 * Claims only the request bound to this tab, verifies insertion through the
 * editor adapter, ACKs it, and asks the service worker to persist the chat URL.
 */

/* global chrome, ECA, ECAGeminiEditor, ECAGeminiAttachments, ECAPhotoTransfer */
(() => {
	function status(text, type = "info") {
		let element = document.getElementById("eca-gemini-status");
		if (!element) {
			element = document.createElement("div");
			element.id = "eca-gemini-status";
			element.style.cssText =
				"position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:8px;background:#202124;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 2px 10px #0004";
			document.body.appendChild(element);
		}
		element.dataset.state = type;
		element.textContent = text;
	}

	function statusAction(label, handler) {
		const element = document.getElementById("eca-gemini-status");
		if (!element) return;
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.style.cssText =
			"display:block;margin-top:8px;padding:4px 8px;border:0;border-radius:4px;cursor:pointer";
		button.addEventListener("click", handler, { once: true });
		element.appendChild(button);
	}

	async function send(type, extra = {}) {
		return chrome.runtime.sendMessage({ type, ...extra });
	}

	async function attachSelectedPhotos(request, retryPhotoIds = null) {
		if (!request.photos?.length) return { success: true, completed: [] };
		status("Adding photos…");
		const prepared = await send(
			retryPhotoIds ? ECA.MESSAGE.RETRY_PHOTOS : ECA.MESSAGE.PREPARE_PHOTOS,
			retryPhotoIds
				? { requestId: request.requestId, photoIds: retryPhotoIds }
				: { requestId: request.requestId },
		);
		if (!prepared?.success) {
			status("Photo preparation failed", "error");
			return {
				success: false,
				failed: request.photos.map((photo) => photo.photoId),
			};
		}
		const failed = [...(prepared.failed || []).map((photo) => photo.photoId)];
		let completed = 0;
		const batch = [];
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
			if (!size || size !== photo.size) {
				failed.push(photo.photoId);
				continue;
			}
			const extension = {
				"image/jpeg": "jpg",
				"image/png": "png",
				"image/webp": "webp",
				"image/gif": "gif",
				"image/avif": "avif",
			}[photo.mimeType];
			if (!extension) {
				failed.push(photo.photoId);
				continue;
			}
			const file = new File([bytes], `${photo.photoId}.${extension}`, {
				type: photo.mimeType,
			});
			batch.push({ photo, file });
		}
		if (batch.length) {
			const attached = await ECAGeminiAttachments.attachFiles(
				request.editor,
				batch.map(({ file }) => file),
			);
			if (!attached.ok) {
				// A partial batch cannot be retried safely without duplicating previews.
				status(
					"Could not confirm all photos. Check Gemini attachments before sending manually.",
					"error",
				);
				return { success: false, failed: [], uncertain: true };
			}
			for (const { photo } of batch) {
				await send(ECA.MESSAGE.PHOTO_READY, {
					requestId: request.requestId,
					photoId: photo.photoId,
				});
				completed += 1;
			}
			status(`Added ${completed} photos`);
		}
		if (failed.length) status(`Some photos failed (${failed.length})`, "error");
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

	async function waitAndSave(request, autoSend = false) {
		if (autoSend) {
			if (await ECAGeminiEditor.submitPrompt(request.editor)) {
				status("Message sent", "success");
			} else {
				status(
					"Could not send automatically. Send the message in Gemini.",
					"error",
				);
			}
		} else {
			status(
				"Check the message and send it in Gemini. Waiting for the report link.",
			);
		}
		const chatUrl = await waitForChatUrl(request.targetUrl);
		if (chatUrl) {
			const saved = await send(ECA.MESSAGE.SAVE_REPORT, { url: chatUrl });
			status(
				saved?.success ? "Report link saved" : "Could not save report link",
				saved?.success ? "success" : "error",
			);
		}
	}

	function showPhotoRecovery(request, failed, autoSend) {
		status(
			`Some photos failed (${failed.length}). Check the text and attachments before continuing.`,
			"error",
		);
		statusAction("Retry failed photos", async () => {
			// Remove both controls while retrying so Continue cannot race with it.
			const retry = await attachSelectedPhotos(request, failed);
			if (retry.uncertain) return;
			if (retry.success) await waitAndSave(request, autoSend);
			else showPhotoRecovery(request, retry.failed, autoSend);
		});
		statusAction("Continue without failed photos", async () => {
			status("Continuing without failed photos…");
			const continued = await send(ECA.MESSAGE.CONTINUE_WITH_FAILED_PHOTOS, {
				requestId: request.requestId,
			});
			if (continued?.success) await waitAndSave(request, autoSend);
			else showPhotoRecovery(request, failed, autoSend);
		});
	}

	async function run() {
		const editor = await ECAGeminiEditor.waitForEditor();
		if (!editor) return;
		status("Preparing Gemini request…");
		const claimed = await send(ECA.MESSAGE.CLAIM);
		const request = claimed?.request;
		if (!claimed?.success || !request) return;
		request.editor = editor;
		const autoSend = request.state === "pending";
		if (request.state === "failed_partial") {
			showPhotoRecovery(request, request.failedPhotoIds || [], false);
			return;
		}

		if (request.state === "pending") {
			status("Inserting text…");
			if (!ECAGeminiEditor.insertPrompt(editor, request.prompt)) return;
			const ack = await send(
				ECA.MESSAGE.ACK_INSERTED,
				request.requestId ? { requestId: request.requestId } : {},
			);
			if (!ack?.success) return;
			request.state = request.photos?.length ? "attaching" : "waiting_for_chat";
			status("Text inserted");
		}
		if (request.photos?.length && request.state === "attaching") {
			request.editor = editor;
			const attachments = await attachSelectedPhotos(request);
			if (!attachments.success) {
				if (attachments.uncertain) return;
				showPhotoRecovery(request, attachments.failed, autoSend);
				return;
			}
		}
		await waitAndSave(request, autoSend);
	}

	run().catch((error) => {
		if (!String(error?.message).includes("Extension context invalidated")) {
			console.warn("eBay Copy Assistant: Gemini flow failed", error);
		}
	});
})();
