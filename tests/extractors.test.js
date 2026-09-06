import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configCode = readFileSync(resolve(__dirname, "../config.js"), "utf8");
const extractorsCode = readFileSync(
	resolve(__dirname, "../extractors.js"),
	"utf8",
);

/**
 * Evaluate config.js + extractors.js in the global scope before each test.
 * Both files use `var` / `function` declarations that hoist to globalThis.
 */
beforeEach(() => {
	document.body.innerHTML = "";

	// Provide a stub for chrome.runtime.sendMessage (used by extractDescription)
	globalThis.chrome = { runtime: { sendMessage: vi.fn() } };

	// biome-ignore lint/security/noGlobalEval: intentional – loads non-module scripts into the test global
	// biome-ignore lint/complexity/noCommaOperator: indirect eval
	(0, eval)(configCode);
	// biome-ignore lint/security/noGlobalEval: intentional
	// biome-ignore lint/complexity/noCommaOperator: indirect eval
	(0, eval)(extractorsCode);
});

// ── extractItemId ────────────────────────────────────────────

describe("extractItemId", () => {
	function setUrl(url) {
		Object.defineProperty(window, "location", {
			value: { href: url },
			writable: true,
			configurable: true,
		});
	}

	it("extracts a numeric item ID from a standard eBay URL", () => {
		setUrl("https://www.ebay.com/itm/123456789012");
		expect(extractItemId()).toBe("123456789012");
	});

	it("extracts item ID when URL has query params", () => {
		setUrl("https://www.ebay.com/itm/111222333444?hash=item1");
		expect(extractItemId()).toBe("111222333444");
	});

	it("extracts item ID from eBay international domains", () => {
		setUrl("https://www.ebay.co.uk/itm/999888777666");
		expect(extractItemId()).toBe("999888777666");
	});

	it("returns null for non-item eBay pages", () => {
		setUrl("https://www.ebay.com/sch/i.html?_nkw=laptop");
		expect(extractItemId()).toBeNull();
	});

	it("returns null for completely unrelated URLs", () => {
		setUrl("https://example.com/page");
		expect(extractItemId()).toBeNull();
	});
});

// ── longestSpanText ──────────────────────────────────────────

describe("longestSpanText", () => {
	it("returns the longest .ux-textspans text content", () => {
		document.body.innerHTML = `
			<div id="container">
				<span class="ux-textspans">Short</span>
				<span class="ux-textspans">Much longer text here</span>
				<span class="ux-textspans">Mid length</span>
			</div>
		`;
		const container = document.getElementById("container");
		expect(longestSpanText(container)).toBe("Much longer text here");
	});

	it("skips spans matching READ_MORE_RE", () => {
		document.body.innerHTML = `
			<div id="container">
				<span class="ux-textspans">Read more about this item</span>
				<span class="ux-textspans">Actual value</span>
			</div>
		`;
		const container = document.getElementById("container");
		expect(longestSpanText(container)).toBe("Actual value");
	});

	it("skips 'See all' spans", () => {
		document.body.innerHTML = `
			<div id="container">
				<span class="ux-textspans">See all details and specifications</span>
				<span class="ux-textspans">OK</span>
			</div>
		`;
		const container = document.getElementById("container");
		expect(longestSpanText(container)).toBe("OK");
	});

	it("returns empty string when container has no matching spans", () => {
		document.body.innerHTML = '<div id="container"></div>';
		const container = document.getElementById("container");
		expect(longestSpanText(container)).toBe("");
	});
});

// ── extractTitle ─────────────────────────────────────────────

describe("extractTitle", () => {
	it("extracts title from .x-item-title__mainTitle .ux-textspans", () => {
		document.body.innerHTML = `
			<div class="x-item-title__mainTitle">
				<span class="ux-textspans">  Vintage Camera Lens  </span>
			</div>
		`;
		expect(extractTitle()).toBe("Vintage Camera Lens");
	});

	it("extracts title from h1.x-item-title__mainTitle", () => {
		document.body.innerHTML =
			'<h1 class="x-item-title__mainTitle">  Rare Book Collection  </h1>';
		expect(extractTitle()).toBe("Rare Book Collection");
	});

	it('extracts title from h1[itemprop="name"]', () => {
		document.body.innerHTML = '<h1 itemprop="name">Widget Pro 3000</h1>';
		expect(extractTitle()).toBe("Widget Pro 3000");
	});

	it("returns empty string when no title element is present", () => {
		document.body.innerHTML = "<div>No title here</div>";
		expect(extractTitle()).toBe("");
	});
});

// ── extractAuctionData ───────────────────────────────────────

describe("extractAuctionData", () => {
	it('returns "Buy It Now" with binPrice for standard BIN listing', () => {
		document.body.innerHTML = `
			<div class="x-price-primary">
				<span class="ux-textspans">US $49.99</span>
			</div>
		`;
		const result = extractAuctionData();
		expect(result.type).toBe("Buy It Now");
		expect(result.bidPrice).toBe("");
		expect(result.binPrice).toBe("US $49.99");
	});

	it("extracts price from current eBay data-testid markup", () => {
		document.body.innerHTML = `
			<div data-testid="x-price-primary">
				<span class="x-price-primary__price"><span class="ux-textspans">EUR 113,01</span></span>
			</div>
		`;
		expect(extractAuctionData().binPrice).toBe("EUR 113,01");
	});

	it('returns "Auction" with bidPrice when bid button present', () => {
		document.body.innerHTML = `
			<button id="bidBtn_btn">Place bid</button>
			<div class="x-price-primary">
				<span class="ux-textspans">US $10.00</span>
			</div>
		`;
		const result = extractAuctionData();
		expect(result.type).toBe("Auction");
		expect(result.bidPrice).toBe("US $10.00");
		expect(result.binPrice).toBe("");
	});

	it('returns "Auction" when viewBids link present', () => {
		document.body.innerHTML = `
			<a href="/itm/123?viewbids=true">5 bids</a>
			<div class="x-price-primary">
				<span class="ux-textspans">US $25.00</span>
			</div>
		`;
		const result = extractAuctionData();
		expect(result.type).toBe("Auction");
		expect(result.bidPrice).toBe("US $25.00");
	});

	it('returns "Auction with Buy It Now" when both buttons present', () => {
		document.body.innerHTML = `
			<button id="bidBtn_btn">Place bid</button>
			<button id="binBtn_btn_1">Buy It Now</button>
			<div class="x-price-primary">
				<span class="ux-textspans">US $5.00</span>
			</div>
			<div class="x-bin-price">
				<div class="x-price-primary">
					<span class="ux-textspans">US $30.00</span>
				</div>
			</div>
		`;
		const result = extractAuctionData();
		expect(result.type).toBe("Auction with Buy It Now");
		expect(result.bidPrice).toBe("US $5.00");
		expect(result.binPrice).toBe("US $30.00");
	});

	it("handles missing price elements gracefully", () => {
		document.body.innerHTML = "<div>No price here</div>";
		const result = extractAuctionData();
		expect(result.type).toBe("Buy It Now");
		expect(result.bidPrice).toBe("");
		expect(result.binPrice).toBe("");
	});
});

// ── formatPrompt ─────────────────────────────────────────────

describe("formatPrompt", () => {
	function setUrl(url) {
		Object.defineProperty(window, "location", {
			value: { href: url },
			writable: true,
			configurable: true,
		});
	}

	const FULL_DATA = {
		title: "Vintage Camera",
		type: "Buy It Now",
		bidPrice: "",
		binPrice: "US $99.99",
		shipping: "Free shipping",
		condition: "Used – Good",
		returns: "30-day returns",
		seller: { name: "cam_seller_42", feedback: "99.8% positive" },
		reviews: ["Great seller!", "Fast shipping"],
		specs: [
			{ label: "Brand", value: "Canon" },
			{ label: "Model", value: "AE-1" },
		],
		description: "A classic 35mm film camera in excellent condition.",
	};

	beforeEach(() => {
		setUrl("https://www.ebay.com/itm/123456789");
	});

	it("includes preamble, title, URL, and listing type", () => {
		const prompt = formatPrompt("Analyze this:", FULL_DATA);
		expect(prompt).toContain("Analyze this:");
		expect(prompt).toContain("**Product:** Vintage Camera");
		expect(prompt).toContain("**URL:** https://www.ebay.com/itm/123456789");
		expect(prompt).toContain("**Listing Type:** Buy It Now");
	});

	it("includes price fields", () => {
		const prompt = formatPrompt("Check:", FULL_DATA);
		expect(prompt).toContain("**Buy It Now Price:** US $99.99");
		expect(prompt).not.toContain("**Current Bid:**");
	});

	it("includes bid price when present", () => {
		const data = { ...FULL_DATA, bidPrice: "US $50.00" };
		const prompt = formatPrompt("Check:", data);
		expect(prompt).toContain("**Current Bid:** US $50.00");
	});

	it("includes shipping, condition, and returns", () => {
		const prompt = formatPrompt("P:", FULL_DATA);
		expect(prompt).toContain("**Shipping:** Free shipping");
		expect(prompt).toContain("**Condition:** Used – Good");
		expect(prompt).toContain("**Returns:** 30-day returns");
	});

	it("includes seller info with feedback", () => {
		const prompt = formatPrompt("P:", FULL_DATA);
		expect(prompt).toContain("**Seller:** cam_seller_42 (99.8% positive)");
	});

	it("includes seller name without feedback when feedback is empty", () => {
		const data = {
			...FULL_DATA,
			seller: { name: "seller_x", feedback: "" },
		};
		const prompt = formatPrompt("P:", data);
		expect(prompt).toContain("**Seller:** seller_x");
		expect(prompt).not.toContain("**Seller:** seller_x (");
	});

	it("includes seller reviews", () => {
		const prompt = formatPrompt("P:", FULL_DATA);
		expect(prompt).toContain("**Seller Reviews:**");
		expect(prompt).toContain('- "Great seller!"');
		expect(prompt).toContain('- "Fast shipping"');
	});

	it("includes item specifics", () => {
		const prompt = formatPrompt("P:", FULL_DATA);
		expect(prompt).toContain("**Item Specifics:**");
		expect(prompt).toContain("- Brand: Canon");
		expect(prompt).toContain("- Model: AE-1");
	});

	it("includes description", () => {
		const prompt = formatPrompt("P:", FULL_DATA);
		expect(prompt).toContain("**Description:**");
		expect(prompt).toContain(
			"A classic 35mm film camera in excellent condition.",
		);
	});

	it("omits optional sections when data is empty/missing", () => {
		const minimalData = {
			title: "",
			type: "Buy It Now",
			bidPrice: "",
			binPrice: "",
			shipping: "",
			condition: "",
			returns: "",
			seller: { name: "", feedback: "" },
			reviews: [],
			specs: [],
			description: "",
		};
		const prompt = formatPrompt("Evaluate:", minimalData);
		expect(prompt).toContain("Evaluate:");
		expect(prompt).toContain("**Listing Type:** Buy It Now");
		expect(prompt).not.toContain("**Product:**");
		expect(prompt).not.toContain("**Current Bid:**");
		expect(prompt).not.toContain("**Buy It Now Price:**");
		expect(prompt).not.toContain("**Shipping:**");
		expect(prompt).not.toContain("**Condition:**");
		expect(prompt).not.toContain("**Returns:**");
		expect(prompt).not.toContain("**Seller:**");
		expect(prompt).not.toContain("**Seller Reviews:**");
		expect(prompt).not.toContain("**Item Specifics:**");
		expect(prompt).not.toContain("**Description:**");
	});
});

// ── extractCondition ─────────────────────────────────────────

describe("extractCondition", () => {
	it("extracts condition from Item Specifics table", () => {
		document.body.innerHTML = `
			<div class="ux-layout-section-evo__item--table-view">
				<div class="ux-labels-values">
					<div class="ux-labels-values__labels">
						<span class="ux-textspans">Condition</span>
					</div>
					<div class="ux-labels-values__values">
						<span class="ux-textspans">Used</span>
						<span class="ux-textspans">Pre-owned, fully functional</span>
					</div>
				</div>
			</div>
		`;
		expect(extractCondition()).toBe("Pre-owned, fully functional");
	});

	it("falls back to standalone condition element", () => {
		document.body.innerHTML = `
			<div class="x-item-condition-text">
				<span class="ux-textspans">New with tags</span>
			</div>
		`;
		expect(extractCondition()).toBe("New with tags");
	});

	it("returns empty string when no condition info exists", () => {
		document.body.innerHTML = "<div>No condition</div>";
		expect(extractCondition()).toBe("");
	});

	it("extracts German item specifics from the current definition-list markup", () => {
		document.body.innerHTML = `
			<dl data-testid="ux-layout-section-evo__item">
				<div class="ux-layout-section-evo__col">
					<dt class="ux-labels-values__labels"><span class="ux-textspans">Artikelzustand</span></dt>
					<dd class="ux-labels-values__values"><span class="ux-textspans">Neu: Sonstige</span></dd>
				</div>
				<div class="ux-layout-section-evo__col">
					<dt class="ux-labels-values__labels"><span class="ux-textspans">Marke</span></dt>
					<dd class="ux-labels-values__values"><span class="ux-textspans">Beispiel</span></dd>
				</div>
			</dl>
		`;
		expect(extractCondition()).toBe("Neu: Sonstige");
		expect(extractItemSpecifics()).toEqual([
			{ label: "Marke", value: "Beispiel" },
		]);
	});
});

// ── extractItemSpecifics ─────────────────────────────────────

describe("extractItemSpecifics", () => {
	it("extracts label-value pairs, skipping Condition", () => {
		document.body.innerHTML = `
			<div class="ux-layout-section-evo__item--table-view">
				<div class="ux-labels-values">
					<div class="ux-labels-values__labels">
						<span class="ux-textspans">Condition</span>
					</div>
					<div class="ux-labels-values__values">
						<span class="ux-textspans">Used</span>
					</div>
				</div>
				<div class="ux-labels-values">
					<div class="ux-labels-values__labels">
						<span class="ux-textspans">Brand</span>
					</div>
					<div class="ux-labels-values__values">
						<span class="ux-textspans">Sony</span>
					</div>
				</div>
				<div class="ux-labels-values">
					<div class="ux-labels-values__labels">
						<span class="ux-textspans">Model</span>
					</div>
					<div class="ux-labels-values__values">
						<span class="ux-textspans">WH-1000XM4</span>
					</div>
				</div>
			</div>
		`;
		const specs = extractItemSpecifics();
		expect(specs).toEqual([
			{ label: "Brand", value: "Sony" },
			{ label: "Model", value: "WH-1000XM4" },
		]);
	});

	it("filters out Read more spans in values", () => {
		document.body.innerHTML = `
			<div class="ux-layout-section-evo__item--table-view">
				<div class="ux-labels-values">
					<div class="ux-labels-values__labels">
						<span class="ux-textspans">Type</span>
					</div>
					<div class="ux-labels-values__values">
						<span class="ux-textspans">Headphones</span>
						<span class="ux-textspans">Read more</span>
					</div>
				</div>
			</div>
		`;
		const specs = extractItemSpecifics();
		expect(specs).toEqual([{ label: "Type", value: "Headphones" }]);
	});

	it("returns empty array when no specs exist", () => {
		document.body.innerHTML = "<div>Nothing here</div>";
		expect(extractItemSpecifics()).toEqual([]);
	});
});

// ── extractShipping / extractReturns ─────────────────────────

describe("extractShipping", () => {
	it("extracts shipping info from label-values", () => {
		document.body.innerHTML = `
			<div class="ux-labels-values--shipping">
				<div class="ux-labels-values__values">
					<span class="ux-textspans">Free</span>
					<span class="ux-textspans">Standard Shipping</span>
				</div>
			</div>
		`;
		expect(extractShipping()).toBe("Free · Standard Shipping");
	});
});

describe("extractReturns", () => {
	it("extracts returns info from label-values", () => {
		document.body.innerHTML = `
			<div class="ux-labels-values--returns">
				<div class="ux-labels-values__values">
					<span class="ux-textspans">30 day returns</span>
					<span class="ux-textspans">Buyer pays shipping</span>
				</div>
			</div>
		`;
		expect(extractReturns()).toBe("30 day returns · Buyer pays shipping");
	});
});

// ── extractSellerInfo ────────────────────────────────────────

describe("extractSellerInfo", () => {
	it("extracts seller name and feedback", () => {
		document.body.innerHTML = `
			<div class="x-sellercard-atf__info__about-seller">
				<span class="ux-textspans">top_seller_99</span>
				<span class="ux-textspans ux-textspans--SECONDARY">99.5% positive feedback</span>
				<span class="ux-textspans ux-textspans--SECONDARY">(1234)</span>
			</div>
		`;
		const info = extractSellerInfo();
		expect(info.name).toBe("top_seller_99");
		expect(info.feedback).toBe("99.5% positive feedback, (1234)");
	});

	it("returns empty strings when no seller info exists", () => {
		document.body.innerHTML = "<div>No seller</div>";
		const info = extractSellerInfo();
		expect(info.name).toBe("");
		expect(info.feedback).toBe("");
	});
});

describe("Gemini request limits", () => {
	it("defines the approved TTL and prompt limits", () => {
		expect(ECA.PENDING_PROMPT_TTL_MS).toBe(5 * 60 * 1000);
		expect(ECA.MAX_DESCRIPTION_CHARS).toBe(100_000);
		expect(ECA.MAX_PROMPT_CHARS).toBe(120_000);
		expect(ECA.MESSAGE.START).toBe("START_GEMINI_REQUEST");
	});
});

describe("bounded prompt formatting", () => {
	it("normalizes spaces and repeated blank lines", () => {
		expect(
			normalizePromptText("  First\u00a0 line  \n\n\n  Second   line "),
		).toBe("First line\n\nSecond line");
	});

	it("limits description and adds the required marker", () => {
		const data = {
			title: "Item",
			type: "Buy It Now",
			bidPrice: "",
			binPrice: "",
			shipping: "",
			condition: "",
			returns: "",
			seller: { name: "", feedback: "" },
			reviews: [],
			specs: [],
			description: "x".repeat(100_001),
		};
		const prompt = formatPrompt("Analyze", data);
		expect(prompt.length).toBeLessThanOrEqual(120_000);
		expect(prompt).toContain("[Description truncated]");
	});

	it("never exceeds the full prompt limit", () => {
		const data = {
			title: "x".repeat(130_000),
			type: "Buy It Now",
			bidPrice: "",
			binPrice: "",
			shipping: "",
			condition: "",
			returns: "",
			seller: { name: "", feedback: "" },
			reviews: [],
			specs: [],
			description: "description",
		};
		expect(formatPrompt("Analyze", data).length).toBeLessThanOrEqual(120_000);
	});
});
