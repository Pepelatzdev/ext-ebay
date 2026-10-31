/* global ECA, ECAChromeClient, ECAPhotoCodec, ECAGeminiFiles, ECAGeminiStatus, ECAChatObserver, ECAGeminiFlow, ECAGeminiEditor, ECAGeminiAttachments */
(() => {
	const client = ECAChromeClient.create({ chrome, navigator, policy: ECA });
	const codec = ECAPhotoCodec.create({
		encode: btoa,
		decode: atob,
		chunkBytes: ECA.PHOTO_CHUNK_BYTES,
	});
	const status = ECAGeminiStatus.create(document);
	const files = ECAGeminiFiles.create({
		send: client.send,
		decode: codec.fromBase64,
		chunkMessage: ECA.MESSAGE.GET_PHOTO_CHUNK,
	});
	const observer = ECAChatObserver.create({
		location: window.location,
		isReportUrl: ECA.isGeminiReportUrl,
	});
	const flow = ECAGeminiFlow.create({
		policy: ECA,
		editorAdapter: ECAGeminiEditor,
		attachments: ECAGeminiAttachments,
		files,
		send: client.send,
		...status,
		waitForChatUrl: observer.waitForChatUrl,
	});
	flow.run().catch((error) => {
		if (!String(error?.message).includes("Extension context invalidated")) {
			status.status(
				"Gemini preparation failed. Check the draft and start a new request from eBay.",
				"error",
			);
			console.warn("eBay Copy Assistant: Gemini flow failed", error);
		}
	});
})();
