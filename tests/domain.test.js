// @vitest-environment node
import { describe, expect, it } from "vitest";
import { api } from "./helpers/scripts.js";

const { policy, model, prompt } = api(
	["src/domain/policy.js", "src/domain/request.js", "src/domain/prompt.js"],
	"({ policy: ECA, model: ECARequestModel.create(ECA), prompt: ECAPrompt.create(ECA) })",
);
const photoRequest = () =>
	model.create(42, {
		itemId: "123",
		prompt: "Analyze",
		targetUrl: "https://gemini.google.com/app",
		photos: [{ photoId: "a" }, { photoId: "b" }],
		createdAt: 1000,
		requestId: "r1",
	});

describe("request rules without browser APIs", () => {
	it("drops the prompt on insertion without mutating the pending record", () => {
		const original = photoRequest();
		const inserted = model.inserted(original, 2000);
		expect(original.prompt).toBe("Analyze");
		expect(inserted).not.toHaveProperty("prompt");
		expect(inserted).toMatchObject({
			state: "attaching",
			preparedAt: 2000,
			requestId: "r1",
		});
		expect(model.deadline(inserted)).toBe(
			2000 + policy.PREPARED_REQUEST_TTL_MS,
		);
		expect(model.expired(inserted, model.deadline(inserted) - 1)).toBe(false);
		expect(model.expired(inserted, model.deadline(inserted))).toBe(true);
	});
	it("preserves the original lifetime and shape for text-only requests", () => {
		const original = model.create(42, {
			itemId: "123",
			prompt: "Analyze",
			createdAt: 1000,
		});
		const inserted = model.inserted(original, 2000);
		expect(inserted).toEqual({
			itemId: "123",
			targetUrl: undefined,
			createdAt: 1000,
			state: "waiting_for_chat",
		});
		expect(inserted).not.toHaveProperty("requestId");
		expect(model.deadline(inserted)).toBe(1000 + policy.PENDING_PROMPT_TTL_MS);
		expect(model.inserted(inserted, 3000)).toBeNull();
	});
	it.each([undefined, NaN, "bad", Infinity])(
		"expires invalid timestamps %s",
		(createdAt) => {
			expect(model.expired({ ...photoRequest(), createdAt }, 2000)).toBe(true);
		},
	);
	it("expires records whose timestamps are in the future", () => {
		expect(model.expired(photoRequest(), 999)).toBe(true);
		expect(model.expired({ ...photoRequest(), preparedAt: 3000 }, 2000)).toBe(
			true,
		);
	});
	it("preserves partial failures when a different photo completes", () => {
		const request = { ...photoRequest(), failedPhotoIds: ["b"] };
		const first = model.photoReady(request, "a");
		expect(first).toEqual({
			state: "failed_partial",
			completedPhotoIds: ["a"],
		});
		expect(request.completedPhotoIds).toEqual([]);
		const retry = model.retryResult(
			{ ...request, ...first },
			new Set(["b"]),
			[],
		);
		expect(retry).toEqual({ state: "attaching", failedPhotoIds: [] });
		expect(model.photoReady({ ...request, ...first, ...retry }, "b")).toEqual({
			state: "waiting_for_chat",
			completedPhotoIds: ["a", "b"],
		});
	});
	it("deduplicates photo acknowledgements", () => {
		expect(
			model.photoReady({ ...photoRequest(), completedPhotoIds: ["a"] }, "a"),
		).toEqual({ state: "attaching", completedPhotoIds: ["a"] });
	});
});

describe("prompt rules without a page", () => {
	const data = {
		title: "Camera",
		type: "Buy It Now",
		binPrice: "$5",
		seller: { name: "seller", feedback: "" },
		description: "Description",
	};
	it("uses the supplied listing URL and removes query and hash", () => {
		const text = prompt.formatPrompt(
			"Analyze",
			data,
			"https://www.ebay.de/itm/123?tracking=yes#details",
		);
		expect(text).toContain("**URL:** https://www.ebay.de/itm/123");
		expect(text).not.toContain("tracking");
	});
	it("enforces both description and full prompt limits", () => {
		const text = prompt.formatPrompt(
			"Analyze",
			{ ...data, title: "x".repeat(130_000), description: "y".repeat(100_001) },
			"https://www.ebay.com/itm/123",
		);
		expect(text.length).toBeLessThanOrEqual(policy.MAX_PROMPT_CHARS);
		expect(text).toContain("[Description truncated]");
	});
});
