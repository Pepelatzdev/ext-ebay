/* global ECA, ECARequestModel, ECARequestRepository, ECARequests, ECAReportPolicy, ECAReportStore, ECAPhotoCodec, ECAPhotoDownloader, ECADescriptionFetcher, ECAAttachmentCache, ECAMessageValidation, ECABackgroundActions, ECAMessageRouter */
importScripts(
	"../domain/policy.js",
	"../domain/request.js",
	"../domain/report-policy.js",
	"../domain/message-validation.js",
	"../domain/photo-codec.js",
	"../infrastructure/request-repository.js",
	"../infrastructure/report-store.js",
	"../infrastructure/photo-downloader.js",
	"../infrastructure/description-fetcher.js",
	"../infrastructure/attachment-cache.js",
	"../application/requests.js",
	"../application/background.js",
	"../infrastructure/message-router.js",
);
const model = ECARequestModel.create(ECA);
const requests = ECARequests.create({
	repository: ECARequestRepository.create(chrome.storage.session),
	alarms: chrome.alarms,
	model,
	now: () => Date.now(),
});
const reports = ECAReportStore.create({
	sync: chrome.storage.sync,
	policy: ECAReportPolicy,
});
const cache = ECAAttachmentCache.create();
requests.onRemoved(cache.removeRequest);
const photos = ECAPhotoDownloader.create({ policy: ECA, fetch });
const codec = ECAPhotoCodec.create({
	encode: btoa,
	decode: atob,
	chunkBytes: ECA.PHOTO_CHUNK_BYTES,
});
const actions = ECABackgroundActions.create({
	requests,
	reports,
	tabs: chrome.tabs,
	downloader: photos,
	codec,
	attachmentCache: cache.entries,
	model,
	loadDescription: ECADescriptionFetcher.create({
		fetch,
		timeoutMs: ECA.DESC_FETCH_TIMEOUT_MS,
	}),
});
const handleMessage = ECAMessageRouter.create({
	policy: ECA,
	validation: ECAMessageValidation.create(ECA),
	actions,
});
const reportError = (error) =>
	console.warn("eBay Copy Assistant: background event failed", error);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	(async () => {
		try {
			sendResponse(await handleMessage(message, sender));
		} catch (error) {
			sendResponse({ success: false, error: error.message });
		}
	})();
	return true;
});
chrome.tabs.onRemoved.addListener((tabId) =>
	requests.remove(tabId).catch(reportError),
);
chrome.alarms.onAlarm.addListener((alarm) => {
	const tabId = requests.tabIdFromAlarm(alarm.name);
	if (tabId !== null) return requests.get(tabId).catch(reportError);
});
chrome.runtime.onInstalled.addListener((details) => {
	if (details.reason !== "install") return;
	(async () => {
		const existing = await chrome.storage.sync.get(["preamble", "geminiUrl"]);
		const defaults = {};
		if (!existing.preamble) defaults.preamble = ECA.DEFAULT_PREAMBLE;
		if (!existing.geminiUrl) defaults.geminiUrl = ECA.DEFAULT_GEMINI_URL;
		if (Object.keys(defaults).length > 0)
			await chrome.storage.sync.set(defaults);
	})().catch(reportError);
});
