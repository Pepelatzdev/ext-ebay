/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAEbayView = (() => {
	function create({
		document,
		config,
		getItemId,
		getReport,
		isReportUrl,
		onAsk,
		logger,
	}) {
		const SVG_PATH = {
			success: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
			error:
				"M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z",
			sparkle:
				"M12 2c.4 0 .7.3.9.7l2.2 5.2 5.2 2.2c.4.2.7.5.7.9s-.3.7-.7.9l-5.2 2.2-2.2 5.2c-.2.4-.5.7-.9.7s-.7-.3-.9-.7l-2.2-5.2-5.2-2.2c-.4-.2-.7-.5-.7-.9s.3-.7.7-.9l5.2-2.2 2.2-5.2c.2-.4.5-.7.9-.7z",
			report:
				"M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
		};

		// ── UI Helpers ───────────────────────────────────────────────

		let feedbackTimer = null;

		function createIcon(name) {
			const namespace = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(namespace, "svg");
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("fill", "currentColor");
			svg.setAttribute("focusable", "false");
			svg.setAttribute("aria-hidden", "true");
			const path = document.createElementNS(namespace, "path");
			path.setAttribute("d", SVG_PATH[name]);
			svg.appendChild(path);
			return svg;
		}

		function createButtonContent(icon, label) {
			const content = document.createElement("span");
			content.className = "ebay-copy-action__content";
			const text = document.createElement("span");
			text.className = "ebay-copy-action__text";
			text.textContent = label;
			content.append(createIcon(icon), text);
			return content;
		}

		function setButtonContent(button, icon, label) {
			button.replaceChildren(createButtonContent(icon, label));
		}

		function setBusy(button, busy) {
			button.disabled = busy;
			button.setAttribute("aria-disabled", String(busy));
			button.setAttribute("aria-busy", String(busy));
		}

		function showFeedback(targetBtn, type) {
			if (feedbackTimer) clearTimeout(feedbackTimer);
			if (!targetBtn) return;

			const originalContent = targetBtn.firstElementChild.cloneNode(true);
			setButtonContent(targetBtn, type, config.FEEDBACK_LABEL[type]);
			targetBtn.classList.add(`ebay-copy--${type}`);

			feedbackTimer = setTimeout(() => {
				targetBtn.replaceChildren(originalContent);
				targetBtn.classList.remove(`ebay-copy--${type}`);
				setBusy(targetBtn, false);
				feedbackTimer = null;
			}, config.FEEDBACK_DELAY[type]);
		}

		// ── Main Render ──────────────────────────────────────────────

		async function renderUI() {
			try {
				const itemId = getItemId();
				if (!itemId) return;

				document.getElementById(config.CONTAINER_ID)?.remove();

				const container = document.createElement("div");
				container.id = config.CONTAINER_ID;
				container.className = "ebay-copy-container";

				const chatUrl = await getReport(itemId);

				if (chatUrl && isReportUrl(chatUrl)) {
					renderReportReady(container, chatUrl, itemId);
				} else {
					renderAskButton(container, itemId);
				}

				document.body.appendChild(container);
			} catch (e) {
				if (e.message?.includes("Extension context invalidated")) {
					logger.log(
						"eBay Copy Assistant: Extension context invalidated. Page reload required.",
					);
					document.getElementById(config.CONTAINER_ID)?.remove();
				} else {
					logger.error("eBay Copy Assistant: Error rendering UI", e);
				}
			}
		}

		// ── Saved Report Actions ─────────────────────────────────────

		function renderReportReady(container, chatUrl, itemId) {
			const resetBtn = document.createElement("button");
			resetBtn.id = config.RESET_BTN_ID;
			resetBtn.type = "button";
			resetBtn.className = "ebay-copy-action ebay-copy-action--secondary";
			resetBtn.setAttribute("aria-live", "polite");
			setButtonContent(resetBtn, "sparkle", "Ask again");

			const link = document.createElement("a");
			link.className = "ebay-copy-action ebay-copy-action--primary";
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.href = chatUrl;
			setButtonContent(link, "report", "Show report");

			container.replaceChildren(resetBtn, link);
			resetBtn.addEventListener("click", () => requestGemini(resetBtn, itemId));
		}

		// ── Ask Gemini Button ────────────────────────────────────────

		function renderAskButton(container, itemId) {
			const btn = document.createElement("button");
			btn.id = config.BTN_ID;
			btn.type = "button";
			btn.title = "Ask Gemini";
			btn.className = "ebay-copy-action ebay-copy-action--primary";
			btn.setAttribute("aria-live", "polite");
			setButtonContent(btn, "sparkle", "Ask Gemini");

			container.replaceChildren(btn);
			btn.addEventListener("click", () => requestGemini(btn, itemId));
		}

		async function requestGemini(btn, itemId) {
			setBusy(btn, true);
			try {
				const result = await onAsk(itemId);
				if (result.cancelled) {
					setBusy(btn, false);
					return;
				}
				showFeedback(btn, "success");
			} catch (error) {
				if (String(error?.message).includes("Extension context invalidated")) {
					if (feedbackTimer) clearTimeout(feedbackTimer);
					feedbackTimer = null;
					setButtonContent(btn, "error", "Reload this eBay page");
					btn.title =
						"The extension was updated or reloaded. Refresh this eBay page, then ask Gemini again.";
					btn.classList.add("ebay-copy--error");
					setBusy(btn, false);
					btn.disabled = true;
					btn.setAttribute("aria-disabled", "true");
					return;
				}
				logger.error("eBay Copy Assistant: Failed to ask Gemini", error);
				showFeedback(btn, "error");
			}
		}

		return { renderUI };
	}
	return { create };
})();
