/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECARequestModel = (() => {
	function create(policy) {
		function create(
			tabId,
			{
				itemId,
				prompt,
				targetUrl,
				photos = [],
				createdAt,
				requestId = `${tabId}-${createdAt}`,
			},
		) {
			const request = photos.length
				? {
						requestId,
						itemId,
						prompt,
						targetUrl,
						photos,
						completedPhotoIds: [],
						failedPhotoIds: [],
						createdAt,
						state: "pending",
					}
				: { itemId, prompt, targetUrl, createdAt, state: "pending" };

			return request;
		}
		function inserted(request, now) {
			if (request?.state !== "pending") return null;
			const updated = request.photos?.length
				? {
						...request,
						prompt: undefined,
						preparedAt: now,
						state: "attaching",
					}
				: {
						itemId: request.itemId,
						targetUrl: request.targetUrl,
						createdAt: request.createdAt,
						state: "waiting_for_chat",
					};
			delete updated.prompt;

			return updated;
		}
		function deadline(request) {
			return (
				(request.preparedAt || request.createdAt) +
				(request.preparedAt
					? policy.PREPARED_REQUEST_TTL_MS
					: policy.PENDING_PROMPT_TTL_MS)
			);
		}
		function expired(request, now) {
			const reference = request.preparedAt || request.createdAt;
			return (
				!Number.isFinite(request.createdAt) ||
				now < request.createdAt ||
				!Number.isFinite(reference) ||
				now < reference ||
				now >= deadline(request)
			);
		}
		function photoReady(request, photoId) {
			const completedPhotoIds = [
				...new Set([...request.completedPhotoIds, photoId]),
			];
			const state = request.failedPhotoIds.length
				? "failed_partial"
				: completedPhotoIds.length === request.photos.length
					? "waiting_for_chat"
					: "attaching";
			return { completedPhotoIds, state };
		}
		function retryResult(request, retryIds, failures) {
			const failed = request.failedPhotoIds.filter((id) => !retryIds.has(id));
			failed.push(...failures.map((photo) => photo.photoId));
			return {
				failedPhotoIds: [...new Set(failed)],
				state: failed.length
					? "failed_partial"
					: new Set(request.completedPhotoIds).size === request.photos.length
						? "waiting_for_chat"
						: "attaching",
			};
		}
		return { create, inserted, deadline, expired, photoReady, retryResult };
	}
	return { create };
})();
