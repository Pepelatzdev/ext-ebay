/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECADescriptionFetcher = (() => {
	function create({ fetch: fetchImpl, timeoutMs }) {
		async function fetchDescription(url) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetchImpl(url, {
					credentials: "omit",
					signal: controller.signal,
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return { success: true, html: await response.text() };
			} catch (error) {
				return { success: false, error: error.message };
			} finally {
				clearTimeout(timer);
			}
		}

		return fetchDescription;
	}
	return { create };
})();
