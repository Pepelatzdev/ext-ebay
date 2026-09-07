/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAMessageValidation = (() => {
	const EBAY_DOMAINS = [
		"ebay.com",
		"ebay.co.uk",
		"ebay.de",
		"ebay.fr",
		"ebay.it",
		"ebay.es",
		"ebay.com.au",
		"ebay.ca",
		"ebay.at",
		"ebay.pl",
	];
	const hostMatches = (host, domain) =>
		host === domain || host.endsWith(`.${domain}`);
	const exactKeys = (message, allowed) =>
		Boolean(
			message &&
				typeof message === "object" &&
				!Array.isArray(message) &&
				Object.keys(message).sort().join(",") === [...allowed].sort().join(","),
		);

	function parsed(rawUrl) {
		try {
			return new URL(rawUrl);
		} catch {
			return null;
		}
	}

	function isSafeGeminiUrl(rawUrl) {
		const url = parsed(rawUrl);
		return Boolean(
			url && url.protocol === "https:" && url.hostname === ECA.GEMINI_HOST,
		);
	}

	function isGeminiSender(sender) {
		return isSafeGeminiUrl(sender?.url) && Number.isInteger(sender?.tab?.id);
	}

	function ebayItemId(sender) {
		const url = parsed(sender?.url);
		if (
			url?.protocol !== "https:" ||
			!EBAY_DOMAINS.some((domain) => hostMatches(url.hostname, domain))
		) {
			return null;
		}
		return url.pathname.match(/^\/itm\/(\d+)(?:\/|$)/)?.[1] || null;
	}

	function isAllowedDescriptionUrl(rawUrl) {
		const url = parsed(rawUrl);
		return Boolean(
			url &&
				url.protocol === "https:" &&
				(url.hostname === "ebaydesc.com" ||
					url.hostname.endsWith(".ebaydesc.com") ||
					url.hostname === "ebay.com" ||
					url.hostname.endsWith(".ebay.com")),
		);
	}

	function validateStart(message, sender) {
		if (
			(!exactKeys(message, ["type", "itemId", "prompt", "url"]) &&
				!exactKeys(message, ["type", "itemId", "prompt", "url", "photos"])) ||
			message.type !== ECA.MESSAGE.START
		) {
			return { ok: false, error: "Unexpected request fields" };
		}
		if (ebayItemId(sender) !== message.itemId) {
			return { ok: false, error: "Disallowed sender" };
		}
		if (
			!/^\d+$/.test(message.itemId) ||
			typeof message.prompt !== "string" ||
			message.prompt.length === 0 ||
			message.prompt.length > ECA.MAX_PROMPT_CHARS
		) {
			return { ok: false, error: "Invalid request payload" };
		}
		if (!ECA.isGeminiGemUrl(message.url)) {
			return { ok: false, error: "Invalid Gemini URL" };
		}
		if (message.photos !== undefined) {
			if (
				!Array.isArray(message.photos) ||
				message.photos.length > ECA.PHOTO_LIMIT
			) {
				return { ok: false, error: "Invalid photo selection" };
			}
			const seen = new Set();
			for (const photo of message.photos) {
				if (
					!photo ||
					typeof photo.photoId !== "string" ||
					seen.has(photo.photoId) ||
					!isAllowedPhotoUrl(photo.sourceUrl)
				) {
					return { ok: false, error: "Invalid photo selection" };
				}
				seen.add(photo.photoId);
			}
		}
		return { ok: true };
	}

	function isAllowedPhotoUrl(rawUrl) {
		try {
			const url = new URL(rawUrl);
			return (
				url.protocol === "https:" && ECA.PHOTO_HOSTS.includes(url.hostname)
			);
		} catch {
			return false;
		}
	}

	function validateGemini(message, sender, type) {
		if (!isGeminiSender(sender) || message?.type !== type) {
			return { ok: false, error: "Disallowed sender" };
		}
		const allowed =
			type === ECA.MESSAGE.SAVE_REPORT
				? ["type", "url"]
				: type === ECA.MESSAGE.ACK_INSERTED &&
						exactKeys(message, ["type", "requestId"])
					? ["type", "requestId"]
					: type === ECA.MESSAGE.PREPARE_PHOTOS
						? ["type", "requestId"]
						: type === ECA.MESSAGE.GET_PHOTO_CHUNK
							? ["type", "requestId", "photoId", "chunkIndex"]
							: type === ECA.MESSAGE.PHOTO_READY
								? ["type", "requestId", "photoId"]
								: type === ECA.MESSAGE.RETRY_PHOTOS
									? ["type", "requestId", "photoIds"]
									: type === ECA.MESSAGE.CONTINUE_WITH_FAILED_PHOTOS
										? ["type", "requestId"]
										: ["type"];
		if (!exactKeys(message, allowed)) {
			return { ok: false, error: "Unexpected request fields" };
		}
		if (
			type === ECA.MESSAGE.SAVE_REPORT &&
			!ECA.isGeminiReportUrl(message.url)
		) {
			return { ok: false, error: "Invalid report URL" };
		}
		if (
			[
				ECA.MESSAGE.PREPARE_PHOTOS,
				ECA.MESSAGE.GET_PHOTO_CHUNK,
				ECA.MESSAGE.PHOTO_READY,
				ECA.MESSAGE.RETRY_PHOTOS,
				ECA.MESSAGE.CONTINUE_WITH_FAILED_PHOTOS,
			].includes(type) &&
			typeof message.requestId !== "string"
		) {
			return { ok: false, error: "Invalid request ID" };
		}
		if (
			type === ECA.MESSAGE.GET_PHOTO_CHUNK &&
			(typeof message.photoId !== "string" ||
				!Number.isInteger(message.chunkIndex) ||
				message.chunkIndex < 0)
		) {
			return { ok: false, error: "Invalid photo chunk" };
		}
		if (
			type === ECA.MESSAGE.RETRY_PHOTOS &&
			(!Array.isArray(message.photoIds) ||
				message.photoIds.some((id) => typeof id !== "string"))
		) {
			return { ok: false, error: "Invalid photo retry" };
		}
		return { ok: true };
	}

	function validateDescription(message, sender) {
		if (
			!exactKeys(message, ["type", "url"]) ||
			message.type !== ECA.MESSAGE.FETCH_DESCRIPTION ||
			!ebayItemId(sender) ||
			!isAllowedDescriptionUrl(message.url)
		) {
			return { ok: false, error: "Invalid description request" };
		}
		return { ok: true };
	}

	return {
		EBAY_DOMAINS,
		isAllowedDescriptionUrl,
		isAllowedPhotoUrl,
		isGeminiSender,
		isSafeGeminiUrl,
		validateDescription,
		validateGemini,
		validateStart,
	};
})();
