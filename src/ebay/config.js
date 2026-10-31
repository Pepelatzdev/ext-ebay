/* biome-ignore-all lint/correctness/noUnusedVariables: eBay adapter configuration */
var ECAEbayConfig = {
	MIN_DESCRIPTION_LENGTH: 60,
	// ── CSS class names ───────────────────────────────────────
	CONTAINER_ID: "ebay-copy-assistant-container",
	PHOTO_PICKER_ID: "ebay-copy-assistant-photo-picker",
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
			'[data-testid="x-price-primary"] .ux-textspans',
			'[itemprop="price"]',
		],
		binPrice: ".x-bin-price div.x-price-primary > span.ux-textspans",
		bidButton: "#bidBtn_btn",
		viewBids: 'a[href*="viewbids"]',
		binButton: "#binBtn_btn_1",
		specRows:
			'.ux-layout-section-evo__item--table-view .ux-labels-values, [data-testid="ux-layout-section-evo__item"] > .ux-layout-section-evo__col',
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
			".x-sellercard-atf__info__about-seller .ux-textspans--SECONDARY, .x-sellercard-atf .ux-textspans--PSEUDOLINK",
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
