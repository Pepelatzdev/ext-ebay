/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: content-script global */
var ECAGalleryExtractor = (() => {
	function absolute(raw, pageUrl) {
		try {
			const url = new URL(raw, pageUrl);
			return url.protocol === "https:" ? url.href : null;
		} catch {
			return null;
		}
	}

	function allowed(url) {
		try {
			const parsed = new URL(url);
			return (
				parsed.protocol === "https:" &&
				ECA.PHOTO_HOSTS.includes(parsed.hostname)
			);
		} catch {
			return false;
		}
	}

	function urlsFromElement(element, pageUrl) {
		const values = [];
		for (const name of ["src", "data-src", "data-image-url", "data-zoom-src"]) {
			const value = element.getAttribute(name);
			if (value) values.push(value);
		}
		for (const name of ["srcset", "data-srcset"]) {
			const value = element.getAttribute(name) || "";
			for (const entry of value.split(",")) {
				const parts = entry.trim().split(/\s+/);
				const candidate = parts[0];
				if (candidate)
					values.push({
						url: candidate,
						width: Number.parseInt(parts[1], 10) || 0,
					});
			}
		}
		return values
			.map((value) => {
				const entry =
					typeof value === "string" ? { url: value, width: 0 } : value;
				return { url: absolute(entry.url, pageUrl), width: entry.width };
			})
			.filter((entry) => entry.url);
	}

	function imageIdentity(rawUrl) {
		const url = new URL(rawUrl);
		const match = url.pathname.match(/^(\/images\/g\/[^/]+)\/s-l(\d+)\.[^/]+$/);
		return match
			? { key: `${url.origin}${match[1]}`, width: Number(match[2]) }
			: { key: rawUrl, width: 0 };
	}

	function collectGalleryPhotos(document, pageUrl = window.location.href) {
		const roots = Array.from(
			document.querySelectorAll(
				'[aria-label*="Image Gallery" i], [class*="PicturePanel"], [data-testid*="gallery" i]',
			),
		);
		if (roots.length === 0)
			return { photos: [], omitted: [], totalDiscovered: 0 };
		const elements = roots.flatMap((root) =>
			Array.from(root.querySelectorAll("img, source")),
		);
		const photos = [];
		const omitted = [];
		const seen = new Map();
		for (const [order, element] of elements.entries()) {
			const candidates = urlsFromElement(element, pageUrl);
			const allowedCandidates = candidates.filter((candidate) =>
				allowed(candidate.url),
			);
			if (allowedCandidates.length === 0) {
				for (const { url } of candidates)
					omitted.push({ reason: "disallowed-url", url });
				continue;
			}
			const ranked = allowedCandidates
				.map((candidate) => {
					const identity = imageIdentity(candidate.url);
					return {
						...candidate,
						key: identity.key,
						width: Math.max(candidate.width, identity.width),
					};
				})
				.sort((a, b) => b.width - a.width);
			const best = ranked[0];
			const existing = seen.get(best.key);
			if (existing) {
				if (best.width > existing.width) {
					existing.photo.sourceUrl = best.url;
					existing.width = best.width;
				}
				continue;
			}
			const photo = {
				photoId: best.key,
				sourceUrl: best.url,
				thumbnailUrl: allowedCandidates[0].url,
				order,
			};
			seen.set(best.key, { photo, width: best.width });
			photos.push(photo);
		}
		return { photos, omitted, totalDiscovered: photos.length + omitted.length };
	}

	return { collectGalleryPhotos };
})();
