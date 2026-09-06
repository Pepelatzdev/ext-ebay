/* global chrome, ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECARequestStore = (() => {
	const KEY_PREFIX = "geminiRequest:";
	const ALARM_PREFIX = "eca-request:";
	const key = (tabId) => `${KEY_PREFIX}${tabId}`;
	const alarm = (tabId) => `${ALARM_PREFIX}${tabId}`;

	async function create(
		tabId,
		{ itemId, prompt, targetUrl, createdAt = Date.now() },
	) {
		const request = { itemId, prompt, targetUrl, createdAt, state: "pending" };
		await chrome.storage.session.set({ [key(tabId)]: request });
		chrome.alarms.create(alarm(tabId), {
			when: createdAt + ECA.PENDING_PROMPT_TTL_MS,
		});
		return request;
	}

	async function get(tabId) {
		return (await chrome.storage.session.get(key(tabId)))[key(tabId)];
	}

	async function markInserted(tabId) {
		const request = await get(tabId);
		if (request?.state !== "pending") return null;
		const updated = {
			itemId: request.itemId,
			targetUrl: request.targetUrl,
			createdAt: request.createdAt,
			state: "waiting_for_chat",
		};
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

	return { create, get, markInserted, remove, tabIdFromAlarm };
})();
