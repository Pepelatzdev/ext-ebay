/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAChatObserver = (() => {
	function create({ location, isReportUrl }) {
		function comparableUrl(rawUrl) {
			try {
				const url = new URL(rawUrl);
				return `${url.origin}${url.pathname}`;
			} catch {
				return null;
			}
		}

		function waitForChatUrl(initialUrl = location.href) {
			const initial = comparableUrl(initialUrl);
			return new Promise((resolve) => {
				let attempts = 0;
				const timer = setInterval(() => {
					attempts++;
					const current = comparableUrl(location.href);
					if (current !== initial && isReportUrl(location.href)) {
						clearInterval(timer);
						resolve(location.href);
					} else if (attempts >= 300) {
						clearInterval(timer);
						resolve(null);
					}
				}, 1000);
			});
		}

		return { waitForChatUrl };
	}
	return { create };
})();
