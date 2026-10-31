/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECARequests = (() => {
	function create({ repository, alarms, model, now }) {
		let removalHandler = () => {};
		const alarm = (tabId) => `eca-request:${tabId}`;
		async function create(tabId, input) {
			const { requestId = `${tabId}-${now()}`, createdAt = now() } = input;
			const request = model.create(tabId, { ...input, requestId, createdAt });
			await repository.write(tabId, request);
			alarms.create(alarm(tabId), { when: model.deadline(request) });
			return request;
		}
		async function remove(tabId) {
			const request = await repository.read(tabId);
			removalHandler(request);
			await repository.remove(tabId);
			await alarms.clear(alarm(tabId));
		}
		async function get(tabId) {
			const request = await repository.read(tabId);
			if (!request) return undefined;
			if (model.expired(request, now())) {
				await remove(tabId);
				return undefined;
			}
			return request;
		}
		async function markInserted(tabId) {
			const updated = model.inserted(await get(tabId), now());
			if (!updated) return null;
			await repository.write(tabId, updated);
			alarms.create(alarm(tabId), { when: model.deadline(updated) });
			return updated;
		}
		async function update(tabId, changes) {
			const request = await get(tabId);
			if (!request) return null;
			const updated = { ...request, ...changes };
			await repository.write(tabId, updated);
			return updated;
		}
		function tabIdFromAlarm(name) {
			const prefix = "eca-request:";
			if (!name.startsWith(prefix)) return null;
			const tabId = Number(name.slice(prefix.length));
			return Number.isInteger(tabId) ? tabId : null;
		}
		return {
			create,
			get,
			markInserted,
			update,
			remove,
			tabIdFromAlarm,
			onRemoved(handler) {
				removalHandler = handler;
			},
		};
	}
	return { create };
})();
