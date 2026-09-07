/* global chrome, ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECARequestStore = (() => {
	const KEY_PREFIX = "geminiRequest:";
	const ALARM_PREFIX = "eca-request:";
	const key = (tabId) => `${KEY_PREFIX}${tabId}`;
	const alarm = (tabId) => `${ALARM_PREFIX}${tabId}`;

	async function create(
		tabId,
		{
			requestId = `${tabId}-${Date.now()}`,
			itemId,
			prompt,
			targetUrl,
			photos = [],
			createdAt = Date.now(),
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
		await chrome.storage.session.set({ [key(tabId)]: request });
		chrome.alarms.create(alarm(tabId), {
			when: createdAt + ECA.PENDING_PROMPT_TTL_MS,
		});
		return request;
	}

	async function get(tabId) {
		const request = (await chrome.storage.session.get(key(tabId)))[key(tabId)];
		if (!request) return undefined;
		const ttl = request.preparedAt
			? ECA.PREPARED_REQUEST_TTL_MS
			: ECA.PENDING_PROMPT_TTL_MS;
		const age = Date.now() - request.createdAt;
		const reference = request.preparedAt || request.createdAt;
		const lifetime = Date.now() - reference;
		if (
			!Number.isFinite(request.createdAt) ||
			age < 0 ||
			!Number.isFinite(reference) ||
			lifetime < 0 ||
			lifetime >= ttl
		) {
			await remove(tabId);
			return undefined;
		}
		return request;
	}

	async function markInserted(tabId) {
		const request = await get(tabId);
		if (request?.state !== "pending") return null;
		const updated = request.photos?.length
			? {
					...request,
					prompt: undefined,
					preparedAt: Date.now(),
					state: "attaching",
				}
			: {
					itemId: request.itemId,
					targetUrl: request.targetUrl,
					createdAt: request.createdAt,
					state: "waiting_for_chat",
				};
		delete updated.prompt;
		await chrome.storage.session.set({ [key(tabId)]: updated });
		return updated;
	}

	async function update(tabId, changes) {
		const request = await get(tabId);
		if (!request) return null;
		const updated = { ...request, ...changes };
		await chrome.storage.session.set({ [key(tabId)]: updated });
		return updated;
	}

	async function remove(tabId) {
		await chrome.storage.session.remove(key(tabId));
		await chrome.alarms.clear(alarm(tabId));
	}

	function tabIdFromAlarm(name) {
		if (!name.startsWith(ALARM_PREFIX)) return null;
		const tabId = Number(name.slice(ALARM_PREFIX.length));
		return Number.isInteger(tabId) ? tabId : null;
	}

	return { create, get, markInserted, remove, tabIdFromAlarm, update };
})();
