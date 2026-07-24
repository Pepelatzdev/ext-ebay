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
	it("renders Ask Gemini directly under body without watch-list markup", async () => {
		const querySpy = vi.spyOn(document, "querySelector");
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById(
			"ebay-copy-assistant-container",
		);
		expect(container?.parentElement).toBe(document.body);
		expect(container?.textContent).toContain("Ask Gemini");
		expect(querySpy).not.toHaveBeenCalledWith("#vi-atl-lnk-99");
		expect(querySpy).not.toHaveBeenCalledWith("#watchBtn_btn_1");
	});

	it("renders Show report and Ask again for a safe chat URL", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012:
				"https://gemini.google.com/gem/example/chat-example",
		});
		const { renderUI } = loadUi();
		await renderUI();

		const link = document.querySelector(
			"#ebay-copy-assistant-container a",
		);
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

		const container = document.getElementById(
			"ebay-copy-assistant-container",
		);
		expect(container?.textContent).toContain("Ask Gemini");
		expect(container?.querySelector("a")).toBeNull();
	});
});
