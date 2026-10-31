/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAGeminiStatus = (() => {
	function create(document) {
		function status(text, type = "info") {
			let element = document.getElementById("eca-gemini-status");
			if (!element) {
				element = document.createElement("div");
				element.id = "eca-gemini-status";
				element.style.cssText =
					"position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:8px;background:#202124;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 2px 10px #0004";
				document.body.appendChild(element);
			}
			element.dataset.state = type;
			element.textContent = text;
		}

		function statusAction(label, handler) {
			const element = document.getElementById("eca-gemini-status");
			if (!element) return;
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = label;
			button.style.cssText =
				"display:block;margin-top:8px;padding:4px 8px;border:0;border-radius:4px;cursor:pointer";
			button.addEventListener("click", handler, { once: true });
			element.appendChild(button);
		}

		return { status, statusAction };
	}
	return { create };
})();
