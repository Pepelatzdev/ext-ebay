const SVG = {
	copy: '<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 36 36" version="1.1" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><path d="M29.5,7h-19A1.5,1.5,0,0,0,9,8.5v24A1.5,1.5,0,0,0,10.5,34h19A1.5,1.5,0,0,0,31,32.5V8.5A1.5,1.5,0,0,0,29.5,7ZM29,32H11V9H29Z"></path><path d="M26,3.5A1.5,1.5,0,0,0,24.5,2H5.5A1.5,1.5,0,0,0,4,3.5v24A1.5,1.5,0,0,0,5.5,29H6V4H26Z"></path></svg>',
	success:
		'<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>',
	error:
		'<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>',
	sparkle:
		'<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 6px; vertical-align: middle;"><path d="M12 2c.4 0 .7.3.9.7l2.2 5.2 5.2 2.2c.4.2.7.5.7.9s-.3.7-.7.9l-5.2 2.2-2.2 5.2c-.2.4-.5.7-.9.7s-.7-.3-.9-.7l-2.2-5.2-5.2-2.2c-.4-.2-.7-.5-.7-.9s.3-.7.7-.9l5.2-2.2 2.2-5.2c.2-.4.5-.7.9-.7z"/></svg>',
	report:
		'<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="width: 18px; height: 18px; margin-right: 6px; vertical-align: middle;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
};

(() => {
	// Prevent double injection
	if (document.getElementById("ebay-copy-assistant-container")) return;

	const DEFAULT_PREAMBLE =
		"Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:";
	const DEFAULT_GEMINI_URL = "https://gemini.google.com/gem/cb9c9074ac8d";
	const FLOATING_CLASS = "ebay-copy--floating";
	const READ_MORE_RE = /^(Read more|See all)/i;

	// ============================================================
	// UI: Elements and Functions
	// ============================================================

	const FEEDBACK_DELAY = { success: 2000, error: 2500 };
	const FEEDBACK_LABEL = { success: "Copied!", error: "Error" };
	let feedbackTimer = null;

	function btnHTML(icon, label) {
		return `<span class="ux-call-to-action__cell-with-icon">${icon}<span class="ux-call-to-action__text">${label}</span></span>`;
	}

	function showFeedback(targetBtn, type) {
		if (feedbackTimer) clearTimeout(feedbackTimer);
		if (!targetBtn) return;
		const isFloating = targetBtn.classList.contains(FLOATING_CLASS);

		targetBtn.innerHTML = isFloating
			? SVG[type]
			: btnHTML(SVG[type], FEEDBACK_LABEL[type]);
		targetBtn.classList.add(`ebay-copy--${type}`);

		feedbackTimer = setTimeout(() => {
			targetBtn.innerHTML = isFloating
				? SVG.sparkle
				: btnHTML(SVG.sparkle, "Ask Gemini");
			targetBtn.classList.remove(`ebay-copy--${type}`);
			feedbackTimer = null;
		}, FEEDBACK_DELAY[type]);
	}

	// ============================================================
	// Data Extraction Functions
	// ============================================================

	function extractTitle() {
		const el =
			document.querySelector(".x-item-title__mainTitle .ux-textspans") ||
			document.querySelector("h1.x-item-title__mainTitle") ||
			document.querySelector('h1[itemprop="name"]') ||
			document.querySelector(".x-item-title h1");
		return el?.textContent?.trim() || "";
	}

	function extractAuctionData() {
		const isAuction =
			!!document.querySelector("#bidBtn_btn") ||
			!!document.querySelector('a[href*="viewbids"]');
		const hasBinBtn = !!document.querySelector("#binBtn_btn_1");

		let type = "Buy It Now";
		if (isAuction && hasBinBtn) {
			type = "Auction with Buy It Now";
		} else if (isAuction) {
			type = "Auction";
		}

		const defaultPriceEl =
			document.querySelector("div.x-price-primary > span.ux-textspans") ||
			document.querySelector('[itemprop="price"]');

		let bidPrice = "";
		let binPrice = "";

		if (isAuction) {
			bidPrice = defaultPriceEl?.textContent?.trim() || "";
			const binPriceEl = document.querySelector(
				".x-bin-price div.x-price-primary > span.ux-textspans",
			);
			if (binPriceEl) {
				binPrice = binPriceEl.textContent.trim();
			}
		} else {
			binPrice = defaultPriceEl?.textContent?.trim() || "";
		}

		return { type, bidPrice, binPrice };
	}

	function longestSpanText(container) {
		let best = "";
		for (const span of container.querySelectorAll(".ux-textspans")) {
			const text = span.textContent?.trim() || "";
			if (READ_MORE_RE.test(text)) continue;
			if (text.length > best.length) best = text;
		}
		return best;
	}

	function extractCondition() {
		// Strategy 1: Item Specifics "Condition" row (has full expandable text)
		const specRows = document.querySelectorAll(
			".ux-layout-section-evo__item--table-view .ux-labels-values",
		);
		for (const row of specRows) {
			const label = row
				.querySelector(".ux-labels-values__labels .ux-textspans")
				?.textContent?.trim();
			if (label === "Condition") {
				const valuesEl = row.querySelector(".ux-labels-values__values");
				if (valuesEl) return longestSpanText(valuesEl);
				break;
			}
		}

		// Strategy 2: Standalone condition element (top of page)
		const container =
			document.querySelector(".x-item-condition-text") ||
			document.querySelector('[data-testid*="condition"]');
		return container ? longestSpanText(container) : "";
	}

	function extractItemSpecifics() {
		const specs = [];
		const rows = document.querySelectorAll(
			".ux-layout-section-evo__item--table-view .ux-labels-values",
		);
		for (const row of rows) {
			const label = row
				.querySelector(".ux-labels-values__labels .ux-textspans")
				?.textContent?.trim();
			if (!label || label === "Condition") continue; // Condition extracted separately

			const valueEls = row.querySelectorAll(
				".ux-labels-values__values .ux-textspans",
			);
			const value = Array.from(valueEls)
				.map((el) => el.textContent.trim())
				.filter((t) => t && !READ_MORE_RE.test(t))
				.join(", ");
			if (value) specs.push({ label, value });
		}
		return specs;
	}

	function extractLabelValues(modifier) {
		return Array.from(
			document.querySelectorAll(
				`.ux-labels-values--${modifier} .ux-labels-values__values .ux-textspans`,
			),
		)
			.map((el) => el.textContent.trim())
			.filter(Boolean)
			.join(" · ");
	}

	function extractShipping() {
		return extractLabelValues("shipping");
	}
	function extractReturns() {
		return extractLabelValues("returns");
	}

	function extractSellerInfo() {
		const nameEl =
			document.querySelector(
				".x-sellercard-atf__info__about-seller .ux-textspans",
			) || document.querySelector('[data-testid*="seller"] a.ux-textspans');
		const feedbackEls = document.querySelectorAll(
			".x-sellercard-atf__info__about-seller .ux-textspans--SECONDARY",
		);
		return {
			name: nameEl?.textContent?.trim() || "",
			feedback: Array.from(feedbackEls)
				.map((el) => el.textContent.trim())
				.filter(Boolean)
				.join(", "),
		};
	}

	function extractSellerReviews() {
		const reviews = [];

		// eBay renders feedback cards twice (visible + hidden duplicate).
		// Use .fdbk-container for individual cards and filter by visibility.
		const visibleCards = Array.from(
			document.querySelectorAll(".fdbk-container"),
		).filter((card) => card.offsetWidth > 0 && card.offsetHeight > 0);

		for (const card of visibleCards) {
			if (reviews.length >= 10) break;

			const comment =
				card
					.querySelector(".fdbk-container__details__comment")
					?.textContent?.trim() || "";
			if (!comment) continue;

			const user =
				card
					.querySelector(".fdbk-container__details__info__username")
					?.textContent?.replace(/- Feedback left by buyer\./i, "")
					?.trim() || "";
			const time =
				card
					.querySelector(".fdbk-container__details__info__divide__time")
					?.textContent?.trim() || "";
			const item =
				card
					.querySelector(".fdbk-container__details__item-link")
					?.textContent?.trim() || "";

			let review = "";
			if (user) review += `[${user}]`;
			if (time) review += ` (${time})`;
			review += `: ${comment}`;
			if (item) review += ` — ${item}`;

			reviews.push(review.trim());
		}

		return reviews;
	}

	async function extractDescription() {
		// Strategy 1: Try iframe first (most common on eBay — description is in #desc_ifr)
		const iframe = document.querySelector(
			'iframe#desc_ifr, iframe[src*="ebaydesc"], iframe[src*="vi/description"]',
		);
		if (iframe) {
			// Try same-origin access first
			try {
				const iframeDoc =
					iframe.contentDocument || iframe.contentWindow?.document;
				if (iframeDoc?.body?.textContent?.trim()) {
					return iframeDoc.body.textContent.trim();
				}
			} catch (_) {
				// Cross-origin — expected for ebaydesc.com
			}

			// Fetch via background service worker (bypasses CORS)
			if (iframe.src) {
				try {
					const response = await chrome.runtime.sendMessage({
						type: "FETCH_DESCRIPTION",
						url: iframe.src,
					});
					if (response?.success && response.html) {
						const parser = new DOMParser();
						const doc = parser.parseFromString(response.html, "text/html");
						for (const el of doc.querySelectorAll("script, style, link"))
							el.remove();
						const text = doc.body?.textContent?.trim() || "";
						if (text) return text;
					}
				} catch (_) {
					// Message passing failed — try other strategies
				}
			}
		}

		// Strategy 2: Direct description container (some listings render inline)
		const descSelectors = [
			'[data-testid="x-item-description-child"]',
			".d-item-description",
			".x-item-description",
			"#desc_div",
			'[data-testid="d-item-description"]',
		];
		for (const sel of descSelectors) {
			const el = document.querySelector(sel);
			if (el) {
				// Skip if only contains the section heading (~30 chars)
				const text = el.textContent?.trim() || "";
				if (text.length > 60) return text;
			}
		}

		return "";
	}

	// ============================================================
	// Prompt Formatting
	// ============================================================

	function formatPrompt(preamble, data) {
		const lines = [`${preamble}\n\n---\n`];

		if (data.title) lines.push(`**Product:** ${data.title}`);
		lines.push(`**URL:** ${window.location.href}`);
		lines.push(`**Listing Type:** ${data.type}`);
		if (data.bidPrice) lines.push(`**Current Bid:** ${data.bidPrice}`);
		if (data.binPrice) lines.push(`**Buy It Now Price:** ${data.binPrice}`);
		if (data.shipping) lines.push(`**Shipping:** ${data.shipping}`);
		if (data.condition) lines.push(`**Condition:** ${data.condition}`);
		if (data.returns) lines.push(`**Returns:** ${data.returns}`);

		if (data.seller.name) {
			const feedback = data.seller.feedback ? ` (${data.seller.feedback})` : "";
			lines.push(`\n**Seller:** ${data.seller.name}${feedback}`);
		}

		if (data.reviews.length > 0) {
			lines.push("\n**Seller Reviews:**");
			for (const r of data.reviews) lines.push(`- "${r}"`);
		}

		if (data.specs.length > 0) {
			lines.push("\n**Item Specifics:**");
			for (const s of data.specs) lines.push(`- ${s.label}: ${s.value}`);
		}

		if (data.description) {
			lines.push(`\n**Description:**\n${data.description}`);
		}

		return lines.join("\n").trim();
	}

	// ============================================================
	// Dynamic UI Rendering and Handlers
	// ============================================================

	function extractItemId() {
		const match = window.location.href.match(/\/itm\/(\d+)/);
		return match ? match[1] : null;
	}

	async function renderUI() {
		const itemId = extractItemId();
		if (!itemId) return;

		// Remove existing container if any
		const existingContainer = document.getElementById(
			"ebay-copy-assistant-container",
		);
		if (existingContainer) {
			existingContainer.remove();
		}

		const container = document.createElement("div");
		container.id = "ebay-copy-assistant-container";
		container.style.marginTop = "8px";
		container.style.width = "100%";

		const result = await chrome.storage.sync.get([`chat_${itemId}`]);
		const chatUrl = result[`chat_${itemId}`];

		const watchContainer =
			document.querySelector("#vi-atl-lnk-99") ||
			document
				.querySelector("#watchBtn_btn_1")
				?.closest(".add-to-watch-list, .x-watchheart");

		if (chatUrl) {
			// Render Report Ready box
			container.className = "ebay-copy-report-box";
			container.style.background = "#f7f7f7";
			container.style.border = "1px solid #e5e5e5";
			container.style.borderRadius = "8px";
			container.style.padding = "16px";
			container.style.fontFamily = "inherit";
			container.style.boxSizing = "border-box";

			container.innerHTML = `
				<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
					<div style="display: flex; align-items: center; color: #191919; font-weight: 600; font-size: 14px; gap: 6px;">
						${SVG.report}
						<span>Gemini Report Ready</span>
					</div>
					<button id="ebay-gemini-reset-btn" style="background: none; border: none; color: #0053a0; font-size: 12px; cursor: pointer; text-decoration: underline; font-weight: 500; padding: 0;">Ask again</button>
				</div>
				<a href="${chatUrl}" target="_blank" class="ux-call-to-action fake-btn fake-btn--fluid fake-btn--large fake-btn--primary" style="display: block; text-align: center; text-decoration: none; box-sizing: border-box; margin-top: 8px;">View Report</a>
			`;

			if (watchContainer?.parentNode) {
				watchContainer.parentNode.insertBefore(
					container,
					watchContainer.nextSibling,
				);
			} else {
				document.body.appendChild(container);
			}

			// Add event listener to reset button
			document
				.getElementById("ebay-gemini-reset-btn")
				.addEventListener("click", async () => {
					await chrome.storage.sync.remove([`chat_${itemId}`]);

					// Clean up the item from the FIFO order array
					const syncData = await chrome.storage.sync.get(["chatHistoryOrder"]);
					let order = syncData.chatHistoryOrder || [];
					order = order.filter((id) => id !== itemId);
					await chrome.storage.sync.set({ chatHistoryOrder: order });

					renderUI();
				});
		} else {
			// Render Ask Gemini button
			const btn = document.createElement("a");
			btn.id = "ebay-copy-assistant-btn";
			btn.href = "javascript:void(0);";
			btn.role = "button";
			btn.title = "Ask Gemini";

			if (watchContainer?.parentNode) {
				btn.className =
					"ux-call-to-action fake-btn fake-btn--fluid fake-btn--large fake-btn--secondary ebay-copy-btn";
				btn.style.width = "100%";
				btn.innerHTML = btnHTML(SVG.sparkle, "Ask Gemini");
				container.appendChild(btn);
				watchContainer.parentNode.insertBefore(
					container,
					watchContainer.nextSibling,
				);
			} else {
				// Fallback: floating button
				btn.className = FLOATING_CLASS;
				btn.innerHTML = SVG.sparkle;
				container.appendChild(btn);
				document.body.appendChild(container);
			}

			btn.addEventListener("click", async () => {
				try {
					btn.style.pointerEvents = "none";

					const data = {
						title: extractTitle(),
						...extractAuctionData(),
						condition: extractCondition(),
						specs: extractItemSpecifics(),
						shipping: extractShipping(),
						returns: extractReturns(),
						seller: extractSellerInfo(),
						reviews: extractSellerReviews(),
						description: await extractDescription(),
					};

					const { preamble } = await chrome.storage.sync.get({
						preamble: DEFAULT_PREAMBLE,
					});
					const { geminiUrl } = await chrome.storage.sync.get({
						geminiUrl: DEFAULT_GEMINI_URL,
					});

					const promptText = formatPrompt(preamble, data);
					await navigator.clipboard.writeText(promptText);
					await chrome.storage.local.set({
						pendingPrompt: promptText,
						activePromptItemId: itemId,
					});

					chrome.runtime.sendMessage({
						type: "OPEN_GEMINI_TAB",
						url: geminiUrl || DEFAULT_GEMINI_URL,
					});

					showFeedback(btn, "success");
				} catch (err) {
					console.error("eBay Copy Assistant: Failed to copy", err);
					showFeedback(btn, "error");
				} finally {
					btn.style.pointerEvents = "auto";
				}
			});
		}
	}

	// Initialize UI
	renderUI();

	// Listen for window focus to refresh UI status dynamically
	window.addEventListener("focus", () => {
		renderUI();
	});
})();
