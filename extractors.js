/**
 * eBay Copy Assistant — Data Extraction & Prompt Formatting.
 *
 * Pure DOM-parsing functions. Depends on ECA global (config.js).
 * Loaded as a content script before ui.js and content.js.
 */

/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: global functions loaded by extension */

// ── Helpers ──────────────────────────────────────────────────

function queryFirst(selectors) {
	const list = Array.isArray(selectors) ? selectors : [selectors];
	for (const sel of list) {
		const el = document.querySelector(sel);
		if (el) return el;
	}
	return null;
}

function longestSpanText(container) {
	let best = "";
	for (const span of container.querySelectorAll(".ux-textspans")) {
		const text = span.textContent?.trim() || "";
		if (ECA.READ_MORE_RE.test(text)) continue;
		if (text.length > best.length) best = text;
	}
	return best;
}

// ── Extractors ───────────────────────────────────────────────

function extractItemId() {
	const match = window.location.href.match(ECA.ITEM_ID_RE);
	return match ? match[1] : null;
}

function extractTitle() {
	const el = queryFirst(ECA.SELECTORS.title);
	return el?.textContent?.trim() || "";
}

function extractAuctionData() {
	const S = ECA.SELECTORS;
	const isAuction =
		!!document.querySelector(S.bidButton) ||
		!!document.querySelector(S.viewBids);
	const hasBinBtn = !!document.querySelector(S.binButton);

	let type = "Buy It Now";
	if (isAuction && hasBinBtn) {
		type = "Auction with Buy It Now";
	} else if (isAuction) {
		type = "Auction";
	}

	const defaultPriceEl = queryFirst(S.pricePrimary);

	let bidPrice = "";
	let binPrice = "";

	if (isAuction) {
		bidPrice = defaultPriceEl?.textContent?.trim() || "";
		const binPriceEl = document.querySelector(S.binPrice);
		if (binPriceEl) {
			binPrice = binPriceEl.textContent.trim();
		}
	} else {
		binPrice = defaultPriceEl?.textContent?.trim() || "";
	}

	return { type, bidPrice, binPrice };
}

function extractCondition() {
	const S = ECA.SELECTORS;

	// Strategy 1: Item Specifics "Condition" row
	const specRows = document.querySelectorAll(S.specRows);
	for (const row of specRows) {
		const label = row.querySelector(S.specLabel)?.textContent?.trim();
		if (label === "Condition") {
			const valuesEl = row.querySelector(S.specValuesContainer);
			if (valuesEl) return longestSpanText(valuesEl);
			break;
		}
	}

	// Strategy 2: Standalone condition element
	const container = queryFirst(S.conditionContainer);
	return container ? longestSpanText(container) : "";
}

function extractItemSpecifics() {
	const S = ECA.SELECTORS;
	const specs = [];
	const rows = document.querySelectorAll(S.specRows);
	for (const row of rows) {
		const label = row.querySelector(S.specLabel)?.textContent?.trim();
		if (!label || label === "Condition") continue;

		const valueEls = row.querySelectorAll(S.specValues);
		const value = Array.from(valueEls)
			.map((el) => el.textContent.trim())
			.filter((t) => t && !ECA.READ_MORE_RE.test(t))
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
	const S = ECA.SELECTORS;
	const nameEl = queryFirst(S.sellerName);
	const feedbackEls = document.querySelectorAll(S.sellerFeedback);
	return {
		name: nameEl?.textContent?.trim() || "",
		feedback: Array.from(feedbackEls)
			.map((el) => el.textContent.trim())
			.filter(Boolean)
			.join(", "),
	};
}

function extractSellerReviews() {
	const S = ECA.SELECTORS;
	const reviews = [];

	// eBay renders feedback cards twice (visible + hidden duplicate).
	const visibleCards = Array.from(
		document.querySelectorAll(S.reviewCards),
	).filter((card) => card.offsetWidth > 0 && card.offsetHeight > 0);

	for (const card of visibleCards) {
		if (reviews.length >= 10) break;

		const comment =
			card.querySelector(S.reviewComment)?.textContent?.trim() || "";
		if (!comment) continue;

		const user =
			card
				.querySelector(S.reviewUser)
				?.textContent?.replace(/- Feedback left by buyer\./i, "")
				?.trim() || "";
		const time = card.querySelector(S.reviewTime)?.textContent?.trim() || "";
		const item = card.querySelector(S.reviewItem)?.textContent?.trim() || "";

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
	const S = ECA.SELECTORS;

	// Strategy 1: Try iframe first (most common on eBay)
	const iframe = document.querySelector(S.descIframe);
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

	// Strategy 2: Direct description container
	for (const sel of S.descContainers) {
		const el = document.querySelector(sel);
		if (el) {
			const text = el.textContent?.trim() || "";
			if (text.length > 60) return text;
		}
	}

	return "";
}

// ── Prompt Formatting ────────────────────────────────────────

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
