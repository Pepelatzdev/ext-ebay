/**
 * eBay Copy Assistant — Entry Point (Content Script).
 *
 * Orchestration only. All logic lives in:
 *   config.js      → shared constants & selectors
 *   extractors.js  → DOM parsing & prompt formatting
 *   ui.js          → button rendering & user interaction
 */

/* global ECA, renderUI */

(() => {
	// Prevent double injection
	if (document.getElementById(ECA.CONTAINER_ID)) return;

	const itemId = window.location.href.match(ECA.ITEM_ID_RE)?.[1];

	renderUI();

	// Re-render only when our chat link for this item changes from another
	// tab (e.g., the Gemini tab finishes saving the URL). Avoids the
	// previous per-focus full re-render with its extra storage read.
	if (itemId) {
		const key = `chat_${itemId}`;
		try {
			chrome.storage.onChanged.addListener((changes, area) => {
				if (area === "sync" && key in changes) renderUI();
			});
		} catch (e) {
			if (!String(e?.message).includes("Extension context invalidated")) {
				console.warn("eBay Copy Assistant: onChanged listener failed", e);
			}
		}
	}
})();
