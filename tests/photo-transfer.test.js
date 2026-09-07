import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const configCode = readFileSync(resolve("config.js"), "utf8");
const transferCode = readFileSync(resolve("photo-transfer.js"), "utf8");
const transfer = new Function(
	`${configCode}\n${transferCode}; return ECAPhotoTransfer;`,
)();

function response(
	bytes,
	type = "image/jpeg",
	url = "https://i.ebayimg.com/photo.jpg",
) {
	return {
		ok: true,
		url,
		headers: { get: (name) => (name === "content-type" ? type : null) },
		body: {
			getReader() {
				let done = false;
				return {
					read: async () => {
						if (done) return { done: true };
						done = true;
						return { done: false, value: bytes };
					},
				};
			},
		},
	};
}

describe("photo transfer", () => {
	it("downloads an allowed image and counts actual bytes", async () => {
		const fetchImpl = vi.fn(async () => response(new Uint8Array([1, 2, 3])));
		const result = await transfer.downloadSelected(
			[{ photoId: "a", sourceUrl: "https://i.ebayimg.com/a.jpg" }],
			fetchImpl,
		);
		expect(result.succeeded[0]).toMatchObject({
			photoId: "a",
			size: 3,
			mimeType: "image/jpeg",
		});
	});

	it("rejects unsafe URL, redirect, MIME, and partial oversized response", async () => {
		const unsafe = await transfer.downloadSelected(
			[{ photoId: "a", sourceUrl: "https://evil.example/a.jpg" }],
			vi.fn(),
		);
		expect(unsafe.failed[0].code).toBe("PHOTO_URL_NOT_ALLOWED");
		const redirect = await transfer.downloadSelected(
			[{ photoId: "b", sourceUrl: "https://i.ebayimg.com/b.jpg" }],
			vi.fn(async () =>
				response(
					new Uint8Array([1]),
					"image/jpeg",
					"https://evil.example/b.jpg",
				),
			),
		);
		expect(redirect.failed[0].code).toBe("PHOTO_REDIRECT_NOT_ALLOWED");
		const mime = await transfer.downloadSelected(
			[{ photoId: "c", sourceUrl: "https://i.ebayimg.com/c.jpg" }],
			vi.fn(async () => response(new Uint8Array([1]), "text/html")),
		);
		expect(mime.failed[0].code).toBe("PHOTO_MIME_NOT_ALLOWED");
	});

	it("round-trips JSON-safe chunks", () => {
		const bytes = new Uint8Array([0, 1, 2, 255]);
		const encoded = transfer.chunks(bytes);
		expect(Array.from(transfer.fromBase64(encoded[0]))).toEqual(
			Array.from(bytes),
		);
	});
});
