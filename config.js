/**
 * Shared configuration for eBay Copy Assistant.
 * Loaded before all other scripts (content scripts, background, options).
 *
 * Uses `var` intentionally — content scripts listed in manifest.json share
 * the same isolated-world scope, and `var` hoists to that global scope,
 * making ECA accessible from extractors.js, ui.js, and content.js.
 */

/* eslint-disable no-var */
/* biome-ignore-all lint/correctness/noUnusedVariables: global config object */
var ECA = {
	// ── Defaults ──────────────────────────────────────────────
	DEFAULT_PREAMBLE:
		"Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:",
	DEFAULT_GEMINI_URL: "https://gemini.google.com/gem/cb9c9074ac8d",

	// ── Security ──────────────────────────────────────────────
	GEMINI_HOST: "gemini.google.com",
	// Hard cap on description fetch to keep the service worker from being
	// killed mid-flight on slow networks.
	DESC_FETCH_TIMEOUT_MS: 10000,
	// A Gemini request expires if its target tab does not consume it in time.
	PENDING_PROMPT_TTL_MS: 5 * 60 * 1000,
	MAX_DESCRIPTION_CHARS: 100_000,
	MAX_PROMPT_CHARS: 120_000,
	MESSAGE: {
		START: "START_GEMINI_REQUEST",
		CLAIM: "CLAIM_GEMINI_REQUEST",
		ACK_INSERTED: "ACK_PROMPT_INSERTED",
		SAVE_REPORT: "SAVE_GEMINI_REPORT",
		FETCH_DESCRIPTION: "FETCH_DESCRIPTION",
	},
	// Minimum length for a description container to be accepted as fallback text.
	MIN_DESCRIPTION_LENGTH: 60,

	// ── CSS class names ───────────────────────────────────────
	CONTAINER_ID: "ebay-copy-assistant-container",
	BTN_ID: "ebay-copy-assistant-btn",
	RESET_BTN_ID: "ebay-gemini-reset-btn",

	// ── Timing ────────────────────────────────────────────────
	FEEDBACK_DELAY: { success: 2000, error: 2500 },
	FEEDBACK_LABEL: { success: "Gemini opened", error: "Error" },

	// ── Patterns ──────────────────────────────────────────────
	READ_MORE_RE: /^(Read more|See all)/i,
	ITEM_ID_RE: /\/itm\/(\d+)/,

	// ── eBay DOM Selectors ────────────────────────────────────
	// Extracted so that eBay redesigns only require updating this map.
	SELECTORS: {
		title: [
			".x-item-title__mainTitle .ux-textspans",
			"h1.x-item-title__mainTitle",
			'h1[itemprop="name"]',
			".x-item-title h1",
		],
		pricePrimary: [
			"div.x-price-primary > span.ux-textspans",
			'[itemprop="price"]',
		],
		binPrice: ".x-bin-price div.x-price-primary > span.ux-textspans",
		bidButton: "#bidBtn_btn",
		viewBids: 'a[href*="viewbids"]',
		binButton: "#binBtn_btn_1",
		specRows: ".ux-layout-section-evo__item--table-view .ux-labels-values",
		specLabel: ".ux-labels-values__labels .ux-textspans",
		specValues: ".ux-labels-values__values .ux-textspans",
		specValuesContainer: ".ux-labels-values__values",
		conditionContainer: [
			".x-item-condition-text",
			'[data-testid*="condition"]',
		],
		sellerName: [
			".x-sellercard-atf__info__about-seller .ux-textspans",
			'[data-testid*="seller"] a.ux-textspans',
		],
		sellerFeedback:
			".x-sellercard-atf__info__about-seller .ux-textspans--SECONDARY",
		reviewCards: ".fdbk-container",
		reviewComment: ".fdbk-container__details__comment",
		reviewUser: ".fdbk-container__details__info__username",
		reviewTime: ".fdbk-container__details__info__divide__time",
		reviewItem: ".fdbk-container__details__item-link",
		descIframe:
			'iframe#desc_ifr, iframe[src*="ebaydesc"], iframe[src*="vi/description"]',
		descContainers: [
			'[data-testid="x-item-description-child"]',
			".d-item-description",
			".x-item-description",
			"#desc_div",
			'[data-testid="d-item-description"]',
		],
	},
};

ECA.isGeminiGemUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			/^\/gem\/[^/]+\/?$/.test(url.pathname)
		);
	} catch {
		return false;
	}
};

ECA.isGeminiReportUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			(/^\/gem\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
				/^\/(app|chat|chats)\/(?!new\/?$)[^/]+\/?$/.test(url.pathname))
		);
	} catch {
		return false;
	}
};
