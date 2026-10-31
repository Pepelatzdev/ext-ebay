/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAGeminiFlow = (() => {
	function create({
		policy: ECA,
		editorAdapter,
		attachments,
		files,
		send,
		status,
		statusAction,
		waitForChatUrl,
	}) {
		async function attachSelectedPhotos(request, editor, retryPhotoIds = null) {
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
				const file = await files.reconstruct(photo, request.requestId);
				if (!file) {
					failed.push(photo.photoId);
					continue;
				}
				batch.push({ photo, file });
			}
			if (batch.length) {
				const attached = await attachments.attachFiles(
					editor,
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
			if (failed.length)
				status(`Some photos failed (${failed.length})`, "error");
			return { success: failed.length === 0, failed };
		}

		async function waitAndSave(request, editor, autoSend = false) {
			if (autoSend) {
				if (await editorAdapter.submitPrompt(editor)) {
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

		function showPhotoRecovery(request, editor, failed, autoSend) {
			status(
				`Some photos failed (${failed.length}). Check the text and attachments before continuing.`,
				"error",
			);
			statusAction("Retry failed photos", async () => {
				// Remove both controls while retrying so Continue cannot race with it.
				const retry = await attachSelectedPhotos(request, editor, failed);
				if (retry.uncertain) return;
				if (retry.success) await waitAndSave(request, editor, autoSend);
				else showPhotoRecovery(request, editor, retry.failed, autoSend);
			});
			statusAction("Continue without failed photos", async () => {
				status("Continuing without failed photos…");
				const continued = await send(ECA.MESSAGE.CONTINUE_WITH_FAILED_PHOTOS, {
					requestId: request.requestId,
				});
				if (continued?.success) await waitAndSave(request, editor, autoSend);
				else showPhotoRecovery(request, editor, failed, autoSend);
			});
		}

		async function run() {
			let editor = await editorAdapter.waitForEditor();
			if (!editor) return;
			status("Preparing Gemini request…");
			const claimed = await send(ECA.MESSAGE.CLAIM);
			const request = claimed?.request;
			if (!claimed?.success || !request) return;
			const autoSend = request.state === "pending";
			if (request.state === "failed_partial") {
				showPhotoRecovery(request, editor, request.failedPhotoIds || [], false);
				return;
			}

			if (request.state === "pending") {
				status("Inserting text…");
				if (!(await editorAdapter.insertPrompt(editor, request.prompt))) {
					status(
						"Gemini has a different draft, or could not confirm the text. Replace the draft with this eBay request to continue.",
						"error",
					);
					statusAction("Replace draft and continue", async () => {
						status("Replacing Gemini draft…");
						const currentEditor = editorAdapter.findEditor?.() || editor;
						if (
							await editorAdapter.insertPrompt(
								currentEditor,
								request.prompt,
								2000,
								true,
							)
						) {
							await run();
						} else {
							status(
								"Could not confirm the replacement. Check the draft and start a new request from eBay.",
								"error",
							);
						}
					});
					return;
				}
				editor = editorAdapter.findEditor?.() || editor;
				const ack = await send(
					ECA.MESSAGE.ACK_INSERTED,
					request.requestId ? { requestId: request.requestId } : {},
				);
				if (!ack?.success) {
					status(
						"Text inserted, but the request could not be confirmed. Start a new request from eBay.",
						"error",
					);
					return;
				}
				request.state = request.photos?.length
					? "attaching"
					: "waiting_for_chat";
				status("Text inserted");
			}
			if (request.photos?.length && request.state === "attaching") {
				const photoResult = await attachSelectedPhotos(request, editor);
				if (!photoResult.success) {
					if (photoResult.uncertain) return;
					showPhotoRecovery(request, editor, photoResult.failed, autoSend);
					return;
				}
			}
			await waitAndSave(request, editor, autoSend);
		}

		return { run };
	}
	return { create };
})();
