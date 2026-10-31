/* biome-ignore-all lint/correctness/noUnusedVariables: shared domain policy */
var ECA = {
	// ── Defaults ──────────────────────────────────────────────
	DEFAULT_PREAMBLE:
		"Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:",
	DEFAULT_GEMINI_URL: "https://gemini.google.com/app",

	// ── Security ──────────────────────────────────────────────
	GEMINI_HOST: "gemini.google.com",
	// Hard cap on description fetch to keep the service worker from being
	// killed mid-flight on slow networks.
	DESC_FETCH_TIMEOUT_MS: 10000,
	PHOTO_FETCH_TIMEOUT_MS: 15_000,
	PHOTO_LIMIT: 10,
	MAX_PHOTO_BYTES: 8 * 1024 * 1024,
	MAX_PHOTO_REQUEST_BYTES: 32 * 1024 * 1024,
	PHOTO_CHUNK_BYTES: 256 * 1024,
	PHOTO_FETCH_CONCURRENCY: 2,
	// A Gemini request expires if its target tab does not consume it in time.
	PENDING_PROMPT_TTL_MS: 5 * 60 * 1000,
	PREPARED_REQUEST_TTL_MS: 30 * 60 * 1000,
	MAX_DESCRIPTION_CHARS: 100_000,
	MAX_PROMPT_CHARS: 120_000,
	MESSAGE: {
		START: "START_GEMINI_REQUEST",
		CLAIM: "CLAIM_GEMINI_REQUEST",
		ACK_INSERTED: "ACK_PROMPT_INSERTED",
		SAVE_REPORT: "SAVE_GEMINI_REPORT",
		FETCH_DESCRIPTION: "FETCH_DESCRIPTION",
		PREPARE_PHOTOS: "PREPARE_GEMINI_PHOTOS",
		GET_PHOTO_CHUNK: "GET_GEMINI_PHOTO_CHUNK",
		PHOTO_READY: "ACK_GEMINI_PHOTO",
		RETRY_PHOTOS: "RETRY_GEMINI_PHOTOS",
		CONTINUE_WITH_FAILED_PHOTOS: "CONTINUE_WITH_FAILED_PHOTOS",
	},
	// eBay's gallery CDN origin is validated again in the service worker.
	PHOTO_HOSTS: ["i.ebayimg.com"],
};

ECA.isGeminiGemUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			!url.username &&
			!url.password &&
			!url.port
		);
	} catch {
		return false;
	}
};

ECA.isGeminiReportUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			(/^\/gem\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
				/^\/(app|chat|chats)\/(?!new\/?$)[^/]+\/?$/.test(url.pathname))
		);
	} catch {
		return false;
	}
};
