/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAStartEbay = (() => {
	function create({
		policy: ECA,
		reader,
		collectPhotos,
		pickPhotos,
		getSettings,
		formatPrompt,
		pageUrl,
		copy,
		send,
		logger,
	}) {
		return async function start(itemId) {
			const gallery = collectPhotos();
			const selection = await pickPhotos({
				title: reader.extractTitle(),
				photos: gallery.photos,
				limit: ECA.PHOTO_LIMIT,
			});
			if (!selection.confirmed) {
				return { cancelled: true };
			}
			const data = {
				title: reader.extractTitle(),
				...reader.extractAuctionData(),
				condition: reader.extractCondition(),
				specs: reader.extractItemSpecifics(),
				shipping: reader.extractShipping(),
				returns: reader.extractReturns(),
				seller: reader.extractSellerInfo(),
				reviews: reader.extractSellerReviews(),
				description: await reader.extractDescription(),
			};

			const { preamble, geminiUrl } = await getSettings();

			const promptText = formatPrompt(preamble, data, pageUrl());
			try {
				await copy(promptText);
			} catch (error) {
				logger.warn(
					"eBay Copy Assistant: Clipboard fallback unavailable",
					error,
				);
			}

			const response = await send(ECA.MESSAGE.START, {
				itemId,
				prompt: promptText,
				url: geminiUrl || ECA.DEFAULT_GEMINI_URL,
				photos: gallery.photos.filter((photo) =>
					selection.selectedPhotoIds.includes(photo.photoId),
				),
			});

			if (!response?.success) {
				throw new Error(response?.error || "Failed to open Gemini");
			}

			return { cancelled: false };
		};
	}
	return { create };
})();
