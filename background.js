/**
 * eBay Copy Assistant — Background Service Worker.
 *
 * Owns Gemini request state, report persistence, validated tab creation,
 * and cross-origin description fetching.
 */

importScripts(
	"config.js",
	"message-validation.js",
	"request-store.js",
	"report-store.js",
	"photo-transfer.js",
);

/* global chrome, ECA, ECAMessageValidation, ECAReportStore, ECARequestStore */

const attachmentCache = new Map();

async function fetchDescription(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ECA.DESC_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			credentials: "omit",
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return { success: true, html: await response.text() };
	} catch (error) {
		return { success: false, error: error.message };
	} finally {
		clearTimeout(timer);
	}
}

async function handleMessage(message, sender) {
	if (message?.type === ECA.MESSAGE.START) {
		const validation = ECAMessageValidation.validateStart(message, sender);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		const tab = await chrome.tabs.create({ url: message.url });
		const request = await ECARequestStore.create(tab.id, {
			itemId: message.itemId,
			prompt: message.prompt,
			targetUrl: message.url,
			photos: message.photos || [],
		});
		return { success: true, tabId: tab.id, requestId: request.requestId };
	}
	if (message?.type === ECA.MESSAGE.CLAIM) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.CLAIM,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		return {
			success: true,
			request: await ECARequestStore.get(sender.tab.id),
		};
	}
	if (message?.type === ECA.MESSAGE.ACK_INSERTED) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.ACK_INSERTED,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		return {
			success: Boolean(await ECARequestStore.markInserted(sender.tab.id)),
		};
	}
	if (message?.type === ECA.MESSAGE.PREPARE_PHOTOS) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.PREPARE_PHOTOS,
		);
		if (!validation.ok) return { success: false, error: validation.error };
		const request = await ECARequestStore.get(sender.tab.id);
		if (
			!request ||
			request.requestId !== message.requestId ||
			request.state !== "attaching"
		) {
			return { success: false, error: "No active photo preparation" };
		}
		const result = await ECAPhotoTransfer.downloadSelected(request.photos);
		for (const photo of result.succeeded)
			attachmentCache.set(`${message.requestId}:${photo.photoId}`, photo);
		const updated = await ECARequestStore.update(sender.tab.id, {
			failedPhotoIds: result.failed.map((photo) => photo.photoId),
			state:
				result.succeeded.length === request.photos.length
					? "attaching"
					: "failed_partial",
		});
		return {
			success: true,
			requestId: updated.requestId,
			photos: result.succeeded.map(({ photoId, mimeType, size }) => ({
				photoId,
				mimeType,
				size,
			})),
			failed: result.failed,
		};
	}
	if (message?.type === ECA.MESSAGE.GET_PHOTO_CHUNK) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.GET_PHOTO_CHUNK,
		);
		if (!validation.ok) return { success: false, error: validation.error };
		const request = await ECARequestStore.get(sender.tab.id);
		const cached = attachmentCache.get(
			`${message.requestId}:${message.photoId}`,
		);
		if (!request || request.requestId !== message.requestId || !cached)
			return { success: false, error: "Photo not available" };
		const chunks = ECAPhotoTransfer.chunks(cached.bytes);
		if (!chunks[message.chunkIndex])
			return { success: false, error: "Photo chunk not found" };
		return {
			success: true,
			requestId: message.requestId,
			photoId: message.photoId,
			chunkIndex: message.chunkIndex,
			data: chunks[message.chunkIndex],
			last: message.chunkIndex === chunks.length - 1,
		};
	}
	if (message?.type === ECA.MESSAGE.PHOTO_READY) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.PHOTO_READY,
		);
		if (!validation.ok) return { success: false, error: validation.error };
		const request = await ECARequestStore.get(sender.tab.id);
		if (
			!request ||
			request.requestId !== message.requestId ||
			!request.photos.some((photo) => photo.photoId === message.photoId)
		)
			return { success: false, error: "Invalid photo acknowledgement" };
		const completed = [
			...new Set([...request.completedPhotoIds, message.photoId]),
		];
		attachmentCache.delete(`${message.requestId}:${message.photoId}`);
		const state =
			completed.length === request.photos.length
				? "waiting_for_chat"
				: "attaching";
		await ECARequestStore.update(sender.tab.id, {
			completedPhotoIds: completed,
			state,
		});
		return { success: true, completedPhotoIds: completed, state };
	}
	if (message?.type === ECA.MESSAGE.SAVE_REPORT) {
		const validation = ECAMessageValidation.validateGemini(
			message,
			sender,
			ECA.MESSAGE.SAVE_REPORT,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		const request = await ECARequestStore.get(sender.tab.id);
		if (request?.state !== "waiting_for_chat") {
			return { success: false, error: "No active request" };
		}
		await ECAReportStore.save(request.itemId, message.url);
		await ECARequestStore.remove(sender.tab.id);
		return { success: true };
	}
	if (message?.type === ECA.MESSAGE.FETCH_DESCRIPTION) {
		const validation = ECAMessageValidation.validateDescription(
			message,
			sender,
		);
		if (!validation.ok) {
			return { success: false, error: validation.error };
		}
		return fetchDescription(message.url);
	}
	return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessage(message, sender)
		.then(sendResponse)
		.catch((error) => sendResponse({ success: false, error: error.message }));
	return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
	await ECARequestStore.get(tabId).then((request) => {
		if (request)
			for (const photo of request.photos || [])
				attachmentCache.delete(`${request.requestId}:${photo.photoId}`);
		return ECARequestStore.remove(tabId);
	});
});
chrome.alarms.onAlarm.addListener((alarm) => {
	const tabId = ECARequestStore.tabIdFromAlarm(alarm.name);
	if (tabId !== null) return ECARequestStore.remove(tabId);
});

chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason !== "install") return;
	const existing = await chrome.storage.sync.get(["preamble", "geminiUrl"]);
	const defaults = {};
	if (!existing.preamble) defaults.preamble = ECA.DEFAULT_PREAMBLE;
	if (!existing.geminiUrl) defaults.geminiUrl = ECA.DEFAULT_GEMINI_URL;
	if (Object.keys(defaults).length > 0) {
		await chrome.storage.sync.set(defaults);
	}
});
