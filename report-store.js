/* global chrome */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAReportStore = (() => {
	const MAX_HISTORY = 400;

	async function save(itemId, chatUrl) {
		const data = await chrome.storage.sync.get(["chatHistoryOrder"]);
		const order = (data.chatHistoryOrder || []).filter((id) => id !== itemId);
		order.push(itemId);
		const toRemove = [];
		while (order.length > MAX_HISTORY) toRemove.push(`chat_${order.shift()}`);
		await chrome.storage.sync.set({
			[`chat_${itemId}`]: chatUrl,
			chatHistoryOrder: order,
		});
		if (toRemove.length > 0) await chrome.storage.sync.remove(toRemove);
	}

	return { save };
})();
