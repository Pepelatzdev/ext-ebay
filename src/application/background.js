/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECABackgroundActions = (() => {
	function create({
		requests,
		reports,
		tabs,
		downloader,
		codec,
		attachmentCache,
		model,
		loadDescription,
	}) {
		async function start(message) {
			const tab = await tabs.create({ url: message.url });
			const request = await requests.create(tab.id, {
				itemId: message.itemId,
				prompt: message.prompt,
				targetUrl: message.url,
				photos: message.photos || [],
			});
			return { success: true, tabId: tab.id, requestId: request.requestId };
		}
		async function claim(_message, sender) {
			return {
				success: true,
				request: await requests.get(sender.tab.id),
			};
		}
		async function ackInserted(_message, sender) {
			return {
				success: Boolean(await requests.markInserted(sender.tab.id)),
			};
		}
		async function preparePhotos(message, sender) {
			const request = await requests.get(sender.tab.id);
			if (
				!request ||
				request.requestId !== message.requestId ||
				request.state !== "attaching"
			) {
				return { success: false, error: "No active photo preparation" };
			}
			const result = await downloader.downloadSelected(request.photos);
			const active = await requests.get(sender.tab.id);
			if (!active || active.requestId !== request.requestId) {
				return { success: false, error: "Photo request expired or closed" };
			}
			for (const photo of result.succeeded)
				attachmentCache.set(`${message.requestId}:${photo.photoId}`, photo);
			const updated = await requests.update(sender.tab.id, {
				failedPhotoIds: result.failed.map((photo) => photo.photoId),
				state:
					result.succeeded.length === request.photos.length
						? "attaching"
						: "failed_partial",
			});
			if (!updated) {
				for (const photo of result.succeeded)
					attachmentCache.delete(`${request.requestId}:${photo.photoId}`);
				return { success: false, error: "Photo request expired or closed" };
			}
			return {
				success: true,
				requestId: updated.requestId,
				photos: result.succeeded.map(({ photoId, mimeType, size }) => ({
					photoId,
					mimeType,
					size,
				})),
				failed: result.failed,
			};
		}
		async function getPhotoChunk(message, sender) {
			const request = await requests.get(sender.tab.id);
			const cached = attachmentCache.get(
				`${message.requestId}:${message.photoId}`,
			);
			if (!request || request.requestId !== message.requestId || !cached)
				return { success: false, error: "Photo not available" };
			const chunks = codec.chunks(cached.bytes);
			if (!chunks[message.chunkIndex])
				return { success: false, error: "Photo chunk not found" };
			return {
				success: true,
				requestId: message.requestId,
				photoId: message.photoId,
				chunkIndex: message.chunkIndex,
				data: chunks[message.chunkIndex],
				last: message.chunkIndex === chunks.length - 1,
			};
		}
		async function retryPhotos(message, sender) {
			const request = await requests.get(sender.tab.id);
			const retryIds = new Set(message.photoIds);
			if (
				!request ||
				request.requestId !== message.requestId ||
				request.state !== "failed_partial" ||
				!retryIds.size ||
				[...retryIds].some(
					(photoId) => !request.failedPhotoIds.includes(photoId),
				)
			) {
				return { success: false, error: "Invalid photo retry" };
			}
			const photos = request.photos.filter((photo) =>
				retryIds.has(photo.photoId),
			);
			const result = await downloader.downloadSelected(photos);
			const active = await requests.get(sender.tab.id);
			if (!active || active.requestId !== request.requestId) {
				return { success: false, error: "Photo request expired or closed" };
			}
			for (const photo of result.succeeded)
				attachmentCache.set(`${message.requestId}:${photo.photoId}`, photo);
			const updated = await requests.update(
				sender.tab.id,
				model.retryResult(request, retryIds, result.failed),
			);
			if (!updated) {
				for (const photo of result.succeeded)
					attachmentCache.delete(`${request.requestId}:${photo.photoId}`);
				return { success: false, error: "Photo request expired or closed" };
			}
			return {
				success: true,
				requestId: updated.requestId,
				photos: result.succeeded.map(({ photoId, mimeType, size }) => ({
					photoId,
					mimeType,
					size,
				})),
				failed: result.failed,
			};
		}
		async function continueWithFailedPhotos(message, sender) {
			const request = await requests.get(sender.tab.id);
			if (
				!request ||
				request.requestId !== message.requestId ||
				request.state !== "failed_partial"
			) {
				return { success: false, error: "No partial photo request" };
			}
			const updated = await requests.update(sender.tab.id, {
				state: "waiting_for_chat",
			});
			return { success: true, state: updated.state };
		}
		async function photoReady(message, sender) {
			const request = await requests.get(sender.tab.id);
			if (
				!request ||
				request.requestId !== message.requestId ||
				!request.photos.some((photo) => photo.photoId === message.photoId)
			)
				return { success: false, error: "Invalid photo acknowledgement" };
			const { completedPhotoIds: completed, state } = model.photoReady(
				request,
				message.photoId,
			);
			attachmentCache.delete(`${message.requestId}:${message.photoId}`);
			await requests.update(sender.tab.id, {
				completedPhotoIds: completed,
				state,
			});
			return { success: true, completedPhotoIds: completed, state };
		}
		async function saveReport(message, sender) {
			const request = await requests.get(sender.tab.id);
			if (request?.state !== "waiting_for_chat") {
				return { success: false, error: "No active request" };
			}
			await reports.save(request.itemId, message.url);
			await requests.remove(sender.tab.id);
			return { success: true };
		}
		async function fetchDescription(message) {
			return loadDescription(message.url);
		}
		return {
			start,
			claim,
			ackInserted,
			preparePhotos,
			getPhotoChunk,
			retryPhotos,
			continueWithFailedPhotos,
			photoReady,
			saveReport,
			fetchDescription,
		};
	}
	return { create };
})();
