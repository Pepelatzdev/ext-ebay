/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAReportStore = (() => {
	function create({ sync, policy }) {
		const { TARGET_BYTES, ORDER_KEY, reportKey, prepare } = policy;
		async function applyPrepared(original, prepared, itemId, chatUrl) {
			const removeKeys = prepared.removed
				.map(reportKey)
				.filter((key) => key !== reportKey(itemId) && key in original);
			if (removeKeys.length > 0) {
				await sync.remove(removeKeys);
			}
			await sync.set({
				[reportKey(itemId)]: chatUrl,
				[ORDER_KEY]: prepared.order,
			});
		}

		let saveQueue = Promise.resolve();

		async function performSave(itemId, chatUrl) {
			const original = await sync.get(null);
			let prepared = prepare(original, itemId, chatUrl);
			try {
				await applyPrepared(original, prepared, itemId, chatUrl);
			} catch (error) {
				if (!/quota/i.test(error.message)) throw error;
				prepared = prepare(original, itemId, chatUrl, 1);
				await applyPrepared(original, prepared, itemId, chatUrl);
			}
			const used = await sync.getBytesInUse(null);
			if (used > TARGET_BYTES) {
				throw new Error(`Sync storage remains above target: ${used}`);
			}
		}

		function save(itemId, chatUrl) {
			const operation = saveQueue.then(() => performSave(itemId, chatUrl));
			saveQueue = operation.catch(() => {});
			return operation;
		}

		return { save };
	}
	return { create };
})();
