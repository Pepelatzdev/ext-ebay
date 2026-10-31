/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECARequestRepository = (() => {
	function create(session) {
		const key = (tabId) => `geminiRequest:${tabId}`;
		return {
			async read(tabId) {
				return (await session.get(key(tabId)))[key(tabId)];
			},
			write(tabId, request) {
				return session.set({ [key(tabId)]: request });
			},
			remove(tabId) {
				return session.remove(key(tabId));
			},
		};
	}
	return { create };
})();
