import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("src/domain/policy.js"), "utf8");
const ebayConfig = readFileSync(resolve("src/ebay/config.js"), "utf8");
const pickerCode = readFileSync(resolve("src/ebay/photo-picker.js"), "utf8");
const picker = new Function(
	`${code}\n${ebayConfig}\n${pickerCode}; return ECAPhotoPicker.create({ document, policy: ECA, config: ECAEbayConfig });`,
)();

describe("photo picker", () => {
	it("selects the first ten photos and reports the limit", async () => {
		const photos = Array.from({ length: 12 }, (_, index) => ({
			photoId: `photo-${index}`,
			thumbnailUrl: `https://i.ebayimg.com/${index}.jpg`,
		}));
		const promise = picker.open({ title: "Item", photos });
		expect(
			document.querySelector(".eca-photo-picker__warning").textContent,
		).toContain("10");
		expect(document.querySelectorAll("input:checked")).toHaveLength(10);
		document.querySelector(".eca-photo-picker__continue").click();
		await expect(promise).resolves.toMatchObject({
			confirmed: true,
			selectedPhotoIds: expect.any(Array),
		});
	});

	it("supports a text-only continuation", async () => {
		const promise = picker.open({ title: "Item", photos: [] });
		document.querySelector(".eca-photo-picker__continue").click();
		await expect(promise).resolves.toEqual({
			confirmed: true,
			selectedPhotoIds: [],
		});
	});
});
