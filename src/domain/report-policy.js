/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAReportPolicy = (() => {
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

	return {
		MAX_REPORTS,
		TARGET_BYTES,
		ORDER_KEY,
		reportKey,
		estimateEntries,
		normalizedOrder,
		prepare,
	};
})();
