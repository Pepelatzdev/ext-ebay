/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAGeminiFiles = (() => {
	function create({ send, decode, chunkMessage }) {
		async function reconstruct(photo, requestId) {
			const parts = [];
			for (let chunkIndex = 0; ; chunkIndex += 1) {
				const chunk = await send(chunkMessage, {
					requestId,
					photoId: photo.photoId,
					chunkIndex,
				});
				if (!chunk?.success) {
					return null;
				}
				parts.push(decode(chunk.data));
				if (chunk.last) break;
			}
			const size = parts.reduce((total, part) => total + part.length, 0);
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const part of parts) {
				bytes.set(part, offset);
				offset += part.length;
			}
			if (!size || size !== photo.size) {
				return null;
			}
			const extension = {
				"image/jpeg": "jpg",
				"image/png": "png",
				"image/webp": "webp",
				"image/gif": "gif",
				"image/avif": "avif",
			}[photo.mimeType];
			if (!extension) {
				return null;
			}
			const file = new File([bytes], `${photo.photoId}.${extension}`, {
				type: photo.mimeType,
			});
			return file;
		}
		return { reconstruct };
	}
	return { create };
})();
