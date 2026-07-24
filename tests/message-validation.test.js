import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("message-validation.js"), "utf8");
const validation = new Function("ECA", `${code}; return ECAMessageValidation;`)(
	{
		GEMINI_HOST: "gemini.google.com",
		MAX_PROMPT_CHARS: 120_000,
		MESSAGE: {
			START: "START_GEMINI_REQUEST",
			CLAIM: "CLAIM_GEMINI_REQUEST",
			ACK_INSERTED: "ACK_PROMPT_INSERTED",
			SAVE_REPORT: "SAVE_GEMINI_REPORT",
		},
	},
);

describe("message validation", () => {
	it("accepts a supported HTTPS eBay item sender", () => {
		expect(
			validation.validateStart(
				{
					type: "START_GEMINI_REQUEST",
					itemId: "123",
					prompt: "Prompt",
					url: "https://gemini.google.com/gem/id",
				},
				{ url: "https://www.ebay.co.uk/itm/123", tab: { id: 1 } },
			),
		).toEqual({ ok: true });
	});

	it.each([
		"http://www.ebay.com/itm/123",
		"https://evil-ebay.com/itm/123",
		"https://www.ebay.com/itm/999",
	])("rejects invalid eBay sender %s", (url) => {
		expect(
			validation.validateStart(
				{
					type: "START_GEMINI_REQUEST",
					itemId: "123",
					prompt: "Prompt",
					url: "https://gemini.google.com/gem/id",
				},
				{ url, tab: { id: 1 } },
			),
		).toMatchObject({ ok: false });
	});

	it("rejects HTTP description and non-Gemini report URLs", () => {
		expect(validation.isAllowedDescriptionUrl("http://vi.ebaydesc.com/x")).toBe(
			false,
		);
		expect(validation.isSafeGeminiUrl("https://example.com/app/x")).toBe(false);
	});

	it("requires an integer tab ID for Gemini messages", () => {
		expect(
			validation.isGeminiSender({
				url: "https://gemini.google.com/app",
				tab: {},
			}),
		).toBe(false);
	});

	it("rejects unexpected privileged payload fields", () => {
		expect(
			validation.validateStart(
				{
					type: "START_GEMINI_REQUEST",
					itemId: "123",
					prompt: "Prompt",
					url: "https://gemini.google.com/gem/id",
					tabId: 999,
				},
				{ url: "https://www.ebay.com/itm/123", tab: { id: 1 } },
			),
		).toMatchObject({ ok: false });
	});

	it("validates SAVE_REPORT against the Gemini sender and URL", () => {
		expect(
			validation.validateGemini(
				{
					type: "SAVE_GEMINI_REPORT",
					url: "https://gemini.google.com/app/report",
				},
				{
					url: "https://gemini.google.com/app/report",
					tab: { id: 7 },
				},
				"SAVE_GEMINI_REPORT",
			),
		).toEqual({ ok: true });
	});
});
