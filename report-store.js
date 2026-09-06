/* global chrome, TextEncoder */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAReportStore = (() => {
	const MAX_REPORTS = 200;
	const TARGET_BYTES = 80 * 1024;
	const ORDER_KEY = "chatHistoryOrder";
	const reportKey = (itemId) => `chat_${itemId}`;

	function estimateEntries(data) {
		const encoder = new TextEncoder();
		return Object.entries(data).reduce(
			(total, [key, value]) =>
				total +
				encoder.encode(key).length +
				encoder.encode(JSON.stringify(value)).length,
			0,
		);
	}

	function normalizedOrder(data, currentItemId) {
		const seen = new Set();
		const ordered = [];
		const storedOrder = Array.isArray(data[ORDER_KEY]) ? data[ORDER_KEY] : [];
		for (const id of storedOrder) {
			if (id === currentItemId || seen.has(id) || !data[reportKey(id)]) {
				continue;
			}
			seen.add(id);
			ordered.push(id);
		}
		const orphaned = Object.keys(data)
			.filter((key) => key.startsWith("chat_") && key !== ORDER_KEY)
			.map((key) => key.slice("chat_".length))
			.filter((id) => id !== currentItemId && !seen.has(id))
			.sort();
		return [...orphaned, ...ordered, currentItemId];
	}

	function prepare(data, itemId, chatUrl, extraPrune = 0) {
		const next = { ...data, [reportKey(itemId)]: chatUrl };
		const order = normalizedOrder(next, itemId);
		const removed = [];
		while (order.length > MAX_REPORTS) removed.push(order.shift());
		while (extraPrune > 0 && order.length > 1) {
			removed.push(order.shift());
			extraPrune--;
		}
		next[ORDER_KEY] = order;
		for (const id of removed) delete next[reportKey(id)];
		while (estimateEntries(next) > TARGET_BYTES && order.length > 1) {
			const id = order.shift();
			removed.push(id);
			delete next[reportKey(id)];
		}
		return { next, order, removed: [...new Set(removed)] };
	}

	async function applyPrepared(original, prepared, itemId, chatUrl) {
		const removeKeys = prepared.removed
			.map(reportKey)
			.filter((key) => key !== reportKey(itemId) && key in original);
		if (removeKeys.length > 0) {
			await chrome.storage.sync.remove(removeKeys);
		}
		await chrome.storage.sync.set({
			[reportKey(itemId)]: chatUrl,
			[ORDER_KEY]: prepared.order,
		});
	}

	let saveQueue = Promise.resolve();

	async function performSave(itemId, chatUrl) {
		const original = await chrome.storage.sync.get(null);
		let prepared = prepare(original, itemId, chatUrl);
		try {
			await applyPrepared(original, prepared, itemId, chatUrl);
		} catch (error) {
			if (!/quota/i.test(error.message)) throw error;
			prepared = prepare(original, itemId, chatUrl, 1);
			await applyPrepared(original, prepared, itemId, chatUrl);
		}
		const used = await chrome.storage.sync.getBytesInUse(null);
		if (used > TARGET_BYTES) {
			throw new Error(`Sync storage remains above target: ${used}`);
		}
	}

	function save(itemId, chatUrl) {
		const operation = saveQueue.then(() => performSave(itemId, chatUrl));
		saveQueue = operation.catch(() => {});
		return operation;
	}

	return {
		MAX_REPORTS,
		TARGET_BYTES,
		estimateEntries,
		normalizedOrder,
		prepare,
		save,
	};
})();
