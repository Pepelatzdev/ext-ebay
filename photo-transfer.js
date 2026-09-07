/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAPhotoTransfer = (() => {
	function allowedUrl(rawUrl) {
		try {
			const url = new URL(rawUrl);
			return (
				url.protocol === "https:" && ECA.PHOTO_HOSTS.includes(url.hostname)
			);
		} catch {
			return false;
		}
	}

	function toBase64(bytes) {
		let binary = "";
		for (let index = 0; index < bytes.length; index += 1)
			binary += String.fromCharCode(bytes[index]);
		return btoa(binary);
	}

	function fromBase64(value) {
		const binary = atob(value);
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	}

	async function readBytes(response) {
		if (!response.body?.getReader) {
			const bytes = new Uint8Array(await response.arrayBuffer());
			return bytes;
		}
		const reader = response.body.getReader();
		const chunks = [];
		let total = 0;
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			const chunk = new Uint8Array(next.value);
			chunks.push(chunk);
			total += chunk.length;
			if (total > ECA.MAX_PHOTO_BYTES) throw new Error("PHOTO_TOO_LARGE");
		}
		const bytes = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		return bytes;
	}

	async function downloadOne(photo, fetchImpl = fetch) {
		if (!allowedUrl(photo.sourceUrl)) throw new Error("PHOTO_URL_NOT_ALLOWED");
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(),
			ECA.PHOTO_FETCH_TIMEOUT_MS,
		);
		try {
			const response = await fetchImpl(photo.sourceUrl, {
				credentials: "omit",
				signal: controller.signal,
				redirect: "follow",
			});
			if (!allowedUrl(response.url || photo.sourceUrl))
				throw new Error("PHOTO_REDIRECT_NOT_ALLOWED");
			if (!response.ok) throw new Error(`PHOTO_HTTP_${response.status}`);
			const mimeType = (response.headers.get("content-type") || "")
				.split(";", 1)[0]
				.toLowerCase();
			if (!mimeType.startsWith("image/"))
				throw new Error("PHOTO_MIME_NOT_ALLOWED");
			const bytes = await readBytes(response);
			if (!bytes.length) throw new Error("PHOTO_EMPTY");
			if (bytes.length > ECA.MAX_PHOTO_BYTES)
				throw new Error("PHOTO_TOO_LARGE");
			return { photoId: photo.photoId, mimeType, size: bytes.length, bytes };
		} finally {
			clearTimeout(timer);
		}
	}

	async function downloadSelected(photos, fetchImpl = fetch) {
		const succeeded = [];
		const failed = [];
		let cursor = 0;
		let totalBytes = 0;
		async function worker() {
			while (cursor < photos.length) {
				const photo = photos[cursor++];
				try {
					const result = await downloadOne(photo, fetchImpl);
					if (totalBytes + result.size > ECA.MAX_PHOTO_REQUEST_BYTES)
						throw new Error("PHOTO_REQUEST_TOO_LARGE");
					totalBytes += result.size;
					succeeded.push(result);
				} catch (error) {
					failed.push({
						photoId: photo.photoId,
						code: error.message,
						message: error.message,
					});
				}
			}
		}
		await Promise.all(
			Array.from(
				{ length: Math.min(ECA.PHOTO_FETCH_CONCURRENCY, photos.length) },
				worker,
			),
		);
		return { succeeded, failed, totalBytes };
	}

	function chunks(bytes) {
		const result = [];
		for (
			let offset = 0;
			offset < bytes.length;
			offset += ECA.PHOTO_CHUNK_BYTES
		) {
			result.push(
				toBase64(bytes.slice(offset, offset + ECA.PHOTO_CHUNK_BYTES)),
			);
		}
		return result;
	}

	return { allowedUrl, downloadSelected, chunks, fromBase64, toBase64 };
})();
