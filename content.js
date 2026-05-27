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

	// Initialize UI
	renderUI();

	// Listen for window focus to refresh UI status dynamically
	// (detects "Report Ready" state after returning from Gemini tab)
	window.addEventListener("focus", () => {
		renderUI();
	});
})();
