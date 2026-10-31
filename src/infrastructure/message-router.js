/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAMessageRouter = (() => {
	function create({ policy, validation, actions }) {
		const routes = new Map([
			[
				policy.MESSAGE.START,
				{ action: actions.start, validate: validation.validateStart },
			],
			[
				policy.MESSAGE.FETCH_DESCRIPTION,
				{
					action: actions.fetchDescription,
					validate: validation.validateDescription,
				},
			],
		]);
		for (const [type, action] of [
			[policy.MESSAGE.CLAIM, actions.claim],
			[policy.MESSAGE.ACK_INSERTED, actions.ackInserted],
			[policy.MESSAGE.PREPARE_PHOTOS, actions.preparePhotos],
			[policy.MESSAGE.GET_PHOTO_CHUNK, actions.getPhotoChunk],
			[policy.MESSAGE.RETRY_PHOTOS, actions.retryPhotos],
			[
				policy.MESSAGE.CONTINUE_WITH_FAILED_PHOTOS,
				actions.continueWithFailedPhotos,
			],
			[policy.MESSAGE.PHOTO_READY, actions.photoReady],
			[policy.MESSAGE.SAVE_REPORT, actions.saveReport],
		]) {
			routes.set(type, {
				action,
				validate: (message, sender) =>
					validation.validateGemini(message, sender, type),
			});
		}
		return async function handleMessage(message, sender) {
			const route = routes.get(message?.type);
			if (!route) return null;
			const result = route.validate(message, sender);
			if (!result.ok) return { success: false, error: result.error };
			return route.action(message, sender);
		};
	}
	return { create };
})();
