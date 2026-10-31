/* global ECA, ECAEbayConfig, ECAChromeClient, ECAEbayReader, ECAEbayView, ECAStartEbay, ECAPrompt, ECAGalleryExtractor, ECAPhotoPicker */
(() => {
	if (document.getElementById(ECAEbayConfig.CONTAINER_ID)) return;
	const client = ECAChromeClient.create({ chrome, navigator, policy: ECA });
	const gallery = ECAGalleryExtractor.create({
		policy: ECA,
		location: window.location,
	});
	const picker = ECAPhotoPicker.create({
		document,
		policy: ECA,
		config: ECAEbayConfig,
	});
	const reader = ECAEbayReader.create({
		document,
		location: window.location,
		config: { ...ECA, ...ECAEbayConfig },
		loadDescription: (url) =>
			client.send(ECA.MESSAGE.FETCH_DESCRIPTION, { url }),
	});
	const start = ECAStartEbay.create({
		policy: ECA,
		reader,
		collectPhotos: () => gallery.collectGalleryPhotos(document),
		pickPhotos: picker.open,
		getSettings: client.getSettings,
		formatPrompt: ECAPrompt.create(ECA).formatPrompt,
		pageUrl: () => window.location.href,
		copy: client.copy,
		send: client.send,
		logger: console,
	});
	const view = ECAEbayView.create({
		document,
		config: ECAEbayConfig,
		getItemId: reader.extractItemId,
		getReport: client.getReport,
		isReportUrl: ECA.isGeminiReportUrl,
		onAsk: start,
		logger: console,
	});
	view.renderUI();
	const itemId = reader.extractItemId();
	if (itemId) {
		const key = `chat_${itemId}`;
		try {
			client.onChanged((changes, area) => {
				if (area === "sync" && key in changes) view.renderUI();
			});
		} catch (error) {
			if (!String(error?.message).includes("Extension context invalidated"))
				console.warn("eBay Copy Assistant: onChanged listener failed", error);
		}
	}
})();
