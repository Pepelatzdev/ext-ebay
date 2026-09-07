import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("config.js"), "utf8");
const extractorCode = readFileSync(resolve("gallery-extractor.js"), "utf8");
const extractor = new Function(
	`${code}\n${extractorCode}; return ECAGalleryExtractor;`,
)();

function gallery(markup) {
	document.body.innerHTML = `<div aria-label="Image Gallery">${markup}</div>`;
}

describe("gallery extractor", () => {
	it("keeps gallery order and chooses the largest confirmed URL", () => {
		gallery(`
			<img src="https://i.ebayimg.com/thumb-a.jpg" srcset="https://i.ebayimg.com/thumb-a.jpg 320w, https://i.ebayimg.com/large-a.jpg 1600w">
			<img src="https://i.ebayimg.com/large-a.jpg">
			<img data-src="https://i.ebayimg.com/large-b.jpg">
		`);
		const result = extractor.collectGalleryPhotos(
			document,
			"https://www.ebay.com/itm/123",
		);
		expect(result.photos.map((photo) => photo.sourceUrl)).toEqual([
			"https://i.ebayimg.com/large-a.jpg",
			"https://i.ebayimg.com/large-b.jpg",
		]);
	});

	it("rejects non-gallery and unsafe image URLs", () => {
		document.body.innerHTML = `
			<div aria-label="Image Gallery"><img src="https://i.ebayimg.com/a.jpg"></div>
			<div class="seller-description"><img src="https://i.ebayimg.com/seller.jpg"></div>
			<div aria-label="Image Gallery"><img src="http://i.ebayimg.com/http.jpg"><img src="https://evil.example/x.jpg"></div>
		`;
		const result = extractor.collectGalleryPhotos(
			document,
			"https://www.ebay.com/itm/123",
		);
		expect(result.photos).toHaveLength(1);
		expect(result.omitted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: "disallowed-url" }),
			]),
		);
	});

	it("returns an empty text-only-compatible result when gallery is absent", () => {
		document.body.innerHTML =
			'<main><img src="https://i.ebayimg.com/x.jpg"></main>';
		expect(extractor.collectGalleryPhotos(document)).toEqual({
			photos: [],
			omitted: [],
			totalDiscovered: 0,
		});
	});
});
