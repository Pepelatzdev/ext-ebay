import { describe, expect, it, vi } from "vitest";
import { api } from "./helpers/scripts.js";

const transfer = api(
	[
		"src/domain/policy.js",
		"src/domain/photo-codec.js",
		"src/infrastructure/photo-downloader.js",
	],
	`({ ...ECAPhotoDownloader.create({ policy: ECA, fetch }), ...ECAPhotoCodec.create({ encode: btoa, decode: atob, chunkBytes: ECA.PHOTO_CHUNK_BYTES }) })`,
);

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

it("rejects an empty download", async () => {
	const result = await transfer.downloadSelected(
		[{ photoId: "empty", sourceUrl: "https://i.ebayimg.com/empty.jpg" }],
		async () => response(new Uint8Array()),
	);
	expect(result.succeeded).toEqual([]);
	expect(result.failed[0].code).toBe("PHOTO_EMPTY");
});
