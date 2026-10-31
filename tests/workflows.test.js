// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { api } from "./helpers/scripts.js";

const create = api(["src/application/start-ebay.js"], "ECAStartEbay.create");
function setup(selection = { confirmed: true, selectedPhotoIds: ["b"] }) {
	const log = [];
	const reader = Object.fromEntries(
		[
			["extractTitle", "Camera"],
			["extractAuctionData", { type: "Buy It Now", binPrice: "$5" }],
			["extractCondition", "Used"],
			["extractItemSpecifics", []],
			["extractShipping", "Free"],
			["extractReturns", "None"],
			["extractSellerInfo", { name: "seller" }],
			["extractSellerReviews", []],
			["extractDescription", "Description"],
		].map(([name, value]) => [name, vi.fn(() => value)]),
	);
	const dependencies = {
		policy: {
			PHOTO_LIMIT: 10,
			MESSAGE: { START: "START" },
			DEFAULT_GEMINI_URL: "https://gemini.google.com/app",
		},
		reader,
		collectPhotos: () => ({ photos: [{ photoId: "a" }, { photoId: "b" }] }),
		pickPhotos: vi.fn(async () => selection),
		getSettings: vi.fn(async () => ({
			preamble: "Analyze",
			geminiUrl: "https://gemini.google.com/gem/id",
		})),
		formatPrompt: vi.fn(() => "Prompt"),
		pageUrl: () => "https://www.ebay.com/itm/123",
		copy: vi.fn(async () => {
			log.push("copy");
		}),
		send: vi.fn(async () => {
			log.push("send");
			return { success: true };
		}),
		logger: { warn: vi.fn() },
	};
	return { dependencies, log, start: create(dependencies) };
}

describe("eBay request workflow", () => {
	it("does no side effects when the user cancels photo selection", async () => {
		const { start, dependencies } = setup({
			confirmed: false,
			selectedPhotoIds: [],
		});
		expect(await start("123")).toEqual({ cancelled: true });
		expect(dependencies.reader.extractDescription).not.toHaveBeenCalled();
		expect(dependencies.getSettings).not.toHaveBeenCalled();
		expect(dependencies.copy).not.toHaveBeenCalled();
		expect(dependencies.send).not.toHaveBeenCalled();
	});
	it("uses injected settings and sends only selected photos after copying", async () => {
		const { start, dependencies, log } = setup();
		expect(await start("123")).toEqual({ cancelled: false });
		expect(log).toEqual(["copy", "send"]);
		expect(dependencies.formatPrompt).toHaveBeenCalledWith(
			"Analyze",
			expect.objectContaining({ title: "Camera", description: "Description" }),
			"https://www.ebay.com/itm/123",
		);
		expect(dependencies.send).toHaveBeenCalledWith("START", {
			itemId: "123",
			prompt: "Prompt",
			url: "https://gemini.google.com/gem/id",
			photos: [{ photoId: "b" }],
		});
	});
	it("continues when clipboard access fails", async () => {
		const { start, dependencies } = setup();
		dependencies.copy.mockRejectedValue(new Error("Clipboard denied"));
		await start("123");
		expect(dependencies.logger.warn).toHaveBeenCalledOnce();
		expect(dependencies.send).toHaveBeenCalledOnce();
	});
	it("propagates a failed privileged request to the UI", async () => {
		const { start, dependencies } = setup();
		dependencies.send.mockResolvedValue({
			success: false,
			error: "Invalid request",
		});
		await expect(start("123")).rejects.toThrow("Invalid request");
	});
});
