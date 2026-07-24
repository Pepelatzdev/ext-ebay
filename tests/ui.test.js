import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const configCode = readFileSync(resolve(testDir, "../config.js"), "utf8");
const extractorsCode = readFileSync(
	resolve(testDir, "../extractors.js"),
	"utf8",
);
const uiCode = readFileSync(resolve(testDir, "../ui.js"), "utf8");
const contentCss = readFileSync(resolve(testDir, "../content.css"), "utf8");

function setUrl(url) {
	Object.defineProperty(window, "location", {
		value: { href: url },
		writable: true,
		configurable: true,
	});
}

function createChrome(initialSync = {}) {
	const syncData = { ...initialSync };
	return {
		runtime: { sendMessage: vi.fn(async () => ({ success: true })) },
		storage: {
			local: { set: vi.fn(async () => {}) },
			sync: {
				get: vi.fn(async (query) => {
					if (Array.isArray(query)) {
						return Object.fromEntries(
							query
								.filter((key) => key in syncData)
								.map((key) => [key, syncData[key]]),
						);
					}
					return { ...query, ...syncData };
				}),
				remove: vi.fn(async (keys) => {
					for (const key of keys) delete syncData[key];
				}),
				set: vi.fn(async (updates) => Object.assign(syncData, updates)),
			},
		},
	};
}

function loadUi() {
	return new Function(
		[configCode, extractorsCode, uiCode, "return { renderUI };"].join("\n"),
	)();
}

beforeEach(() => {
	document.body.innerHTML = "<main>Listing content</main>";
	setUrl("https://www.ebay.com/itm/123456789012");
	globalThis.chrome = createChrome();
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText: vi.fn(async () => {}) },
		configurable: true,
	});
});

describe("floating Gemini actions", () => {
	it("styles the action container as a fixed bottom-right control", async () => {
		const style = document.createElement("style");
		style.textContent = contentCss;
		document.head.appendChild(style);
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById("ebay-copy-assistant-container");
		const computed = getComputedStyle(container);
		expect(computed.position).toBe("fixed");
		expect(computed.flexDirection).toBe("column");
		expect(computed.zIndex).toBe("2147483647");
		expect(contentCss).toContain("@media (max-width: 480px)");
		style.remove();
	});

	it("renders Ask Gemini directly under body without watch-list markup", async () => {
		const querySpy = vi.spyOn(document, "querySelector");
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById("ebay-copy-assistant-container");
		expect(container?.parentElement).toBe(document.body);
		expect(container?.textContent).toContain("Ask Gemini");
		expect(querySpy).not.toHaveBeenCalledWith("#vi-atl-lnk-99");
		expect(querySpy).not.toHaveBeenCalledWith("#watchBtn_btn_1");
	});

	it("renders Show report and Ask again for a safe chat URL", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012: "https://gemini.google.com/gem/example/chat-example",
		});
		const { renderUI } = loadUi();
		await renderUI();

		const link = document.querySelector("#ebay-copy-assistant-container a");
		expect(link?.textContent).toContain("Show report");
		expect(link?.href).toBe(
			"https://gemini.google.com/gem/example/chat-example",
		);
		expect(link?.target).toBe("_blank");
		expect(link?.rel).toBe("noopener noreferrer");
		expect(
			document.getElementById("ebay-gemini-reset-btn")?.textContent,
		).toContain("Ask again");
	});

	it("falls back to Ask Gemini for an unsafe report URL", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012: "https://example.com/not-gemini",
		});
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById("ebay-copy-assistant-container");
		expect(container?.textContent).toContain("Ask Gemini");
		expect(container?.querySelector("a")).toBeNull();
	});

	it("preserves the saved report while starting a new Gemini request", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012: "https://gemini.google.com/gem/example/chat-example",
			chatHistoryOrder: ["older-item", "123456789012"],
		});
		document.body.innerHTML =
			'<h1 itemprop="name">Vintage Camera</h1>' +
			'<div class="x-price-primary">' +
			'<span class="ux-textspans">US $99.99</span></div>';
		const { renderUI } = loadUi();
		await renderUI();

		document.getElementById("ebay-gemini-reset-btn").click();

		await vi.waitFor(() => {
			expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "START_GEMINI_REQUEST",
					itemId: "123456789012",
					prompt: expect.stringContaining("Vintage Camera"),
				}),
			);
		});
		expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
		expect(
			document.querySelector('a[href*="gemini.google.com"]'),
		).not.toBeNull();
		expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
		expect(chrome.storage.local.set).not.toHaveBeenCalled();
	});

	it("exposes and restores the busy state", async () => {
		vi.useFakeTimers();
		try {
			const { renderUI } = loadUi();
			await renderUI();
			const button = document.getElementById("ebay-copy-assistant-btn");
			button.click();
			expect(button.disabled).toBe(true);
			expect(button.getAttribute("aria-busy")).toBe("true");

			for (let index = 0; index < 10; index++) await Promise.resolve();
			await vi.advanceTimersByTimeAsync(2_000);

			expect(button.disabled).toBe(false);
			expect(button.getAttribute("aria-disabled")).toBe("false");
			expect(button.getAttribute("aria-busy")).toBe("false");
		} finally {
			vi.useRealTimers();
		}
	});

	it("builds runtime actions without innerHTML", async () => {
		expect(uiCode).not.toContain(".innerHTML");
		const { renderUI } = loadUi();
		await renderUI();
		const button = document.getElementById("ebay-copy-assistant-btn");
		expect(button.querySelector("svg")).not.toBeNull();
		expect(button.textContent).toContain("Ask Gemini");
	});

	it("defines reduced-motion and disabled styles", () => {
		expect(contentCss).toContain("prefers-reduced-motion: reduce");
		expect(contentCss).toContain(".ebay-copy-action:disabled");
	});

	it("defines scoped high-contrast action colors and protected link states", () => {
		expect(contentCss).toContain("--eca-primary-background: #3665f3");
		expect(contentCss).toContain("--eca-primary-hover-background: #234fc7");
		expect(contentCss).toContain("--eca-primary-foreground: #fff");
		expect(contentCss).toContain("--eca-secondary-background: #fff");
		expect(contentCss).toContain("--eca-secondary-foreground: #191919");
		expect(contentCss).toContain("--eca-secondary-border: #191919");
		expect(contentCss).toContain(".ebay-copy-action--primary:link");
		expect(contentCss).toContain(".ebay-copy-action--primary:visited");
		expect(contentCss).toContain("color: var(--eca-primary-foreground)");
		expect(contentCss).not.toContain(":root");
	});
});
