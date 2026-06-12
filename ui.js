/**
 * eBay Copy Assistant — UI Rendering.
 *
 * Handles button creation, feedback states, and the "Report Ready" card.
 * Depends on ECA (config.js) and extractor functions (extractors.js).
 */

/* global ECA, extractItemId, extractTitle, extractAuctionData, extractCondition,
          extractItemSpecifics, extractShipping, extractReturns, extractSellerInfo,
          extractSellerReviews, extractDescription, formatPrompt */

// ── SVG Icons ────────────────────────────────────────────────

const SVG = {
	copy: '<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 36 36" version="1.1" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><path d="M29.5,7h-19A1.5,1.5,0,0,0,9,8.5v24A1.5,1.5,0,0,0,10.5,34h19A1.5,1.5,0,0,0,31,32.5V8.5A1.5,1.5,0,0,0,29.5,7ZM29,32H11V9H29Z"></path><path d="M26,3.5A1.5,1.5,0,0,0,24.5,2H5.5A1.5,1.5,0,0,0,4,3.5v24A1.5,1.5,0,0,0,5.5,29H6V4H26Z"></path></svg>',
	success:
		'<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"></path></svg>',
	error:
		'<svg focusable="false" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>',
	sparkle:
		'<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="ebay-copy-icon--sparkle"><path d="M12 2c.4 0 .7.3.9.7l2.2 5.2 5.2 2.2c.4.2.7.5.7.9s-.3.7-.7.9l-5.2 2.2-2.2 5.2c-.2.4-.5.7-.9.7s-.7-.3-.9-.7l-2.2-5.2-5.2-2.2c-.4-.2-.7-.5-.7-.9s.3-.7.7-.9l5.2-2.2 2.2-5.2c.2-.4.5-.7.9-.7z"/></svg>',
	report:
		'<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="ebay-copy-icon--report"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
};

// ── UI Helpers ───────────────────────────────────────────────

let feedbackTimer = null;

function btnHTML(icon, label) {
	return `<span class="ux-call-to-action__cell-with-icon">${icon}<span class="ux-call-to-action__text">${label}</span></span>`;
}

function showFeedback(targetBtn, type) {
	if (feedbackTimer) clearTimeout(feedbackTimer);
	if (!targetBtn) return;
	const isFloating = targetBtn.classList.contains(ECA.FLOATING_CLASS);

	targetBtn.innerHTML = isFloating
		? SVG[type]
		: btnHTML(SVG[type], ECA.FEEDBACK_LABEL[type]);
	targetBtn.classList.add(`ebay-copy--${type}`);
	targetBtn.style.pointerEvents = "none";

	feedbackTimer = setTimeout(() => {
		targetBtn.innerHTML = isFloating
			? SVG.sparkle
			: btnHTML(SVG.sparkle, "Ask Gemini");
		targetBtn.classList.remove(`ebay-copy--${type}`);
		targetBtn.style.pointerEvents = "";
		feedbackTimer = null;
	}, ECA.FEEDBACK_DELAY[type]);
}

// ── Main Render ──────────────────────────────────────────────

async function renderUI() {
	try {
		const itemId = extractItemId();
		if (!itemId) return;

		// Remove existing container if any
		const existingContainer = document.getElementById(ECA.CONTAINER_ID);
		if (existingContainer) {
			existingContainer.remove();
		}

		const container = document.createElement("div");
		container.id = ECA.CONTAINER_ID;
		container.className = "ebay-copy-container";

		const result = await chrome.storage.sync.get([`chat_${itemId}`]);
		const chatUrl = result[`chat_${itemId}`];

		const S = ECA.SELECTORS;
		const watchContainer =
			document.querySelector(S.watchContainer) ||
			document
				.querySelector(S.watchButton)
				?.closest(".add-to-watch-list, .x-watchheart");

		if (chatUrl) {
			renderReportReady(container, chatUrl, itemId, watchContainer);
		} else {
			renderAskButton(container, itemId, watchContainer);
		}
	} catch (e) {
		if (e.message?.includes("Extension context invalidated")) {
			console.log(
				"eBay Copy Assistant: Extension context invalidated. Page reload required.",
			);
			const el = document.getElementById(ECA.CONTAINER_ID);
			if (el) el.remove();
		} else {
			console.error("eBay Copy Assistant: Error rendering UI", e);
		}
	}
}

// ── Report Ready Card ────────────────────────────────────────

function isSafeGeminiUrl(rawUrl) {
	try {
		const u = new URL(rawUrl);
		return u.protocol === "https:" && u.hostname === ECA.GEMINI_HOST;
	} catch {
		return false;
	}
}

function renderReportReady(container, chatUrl, itemId, watchContainer) {
	// Defense-in-depth: never render a URL that wasn't written by our own
	// gemini-content.js running on gemini.google.com.
	if (!isSafeGeminiUrl(chatUrl)) {
		renderAskButton(container, itemId, watchContainer);
		return;
	}

	const header = document.createElement("div");
	header.className = "ebay-copy-report-box__header";

	const title = document.createElement("div");
	title.className = "ebay-copy-report-box__title";
	// SVG.report is a static string literal — safe to set as innerHTML.
	title.innerHTML = SVG.report;
	const titleText = document.createElement("span");
	titleText.className = "ux-textspans ux-textspans--BOLD";
	titleText.textContent = "Gemini Report Ready";
	title.appendChild(titleText);

	const resetBtn = document.createElement("button");
	resetBtn.id = ECA.RESET_BTN_ID;
	resetBtn.type = "button";
	resetBtn.className = "fake-link";
	resetBtn.textContent = "Ask again";

	header.append(title, resetBtn);

	const link = document.createElement("a");
	link.className =
		"ux-call-to-action fake-btn fake-btn--fluid fake-btn--large fake-btn--primary";
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.href = chatUrl;
	link.textContent = "View Report";

	container.replaceChildren(header, link);

	insertAfterWatch(container, watchContainer);

	resetBtn.addEventListener("click", async () => {
		try {
			await chrome.storage.sync.remove([`chat_${itemId}`]);

			// Clean up the item from the FIFO order array
			const syncData = await chrome.storage.sync.get(["chatHistoryOrder"]);
			const order = (syncData.chatHistoryOrder || []).filter(
				(id) => id !== itemId,
			);
			await chrome.storage.sync.set({ chatHistoryOrder: order });
		} catch (e) {
			console.error("eBay Copy Assistant: Failed to reset chat link", e);
		}

		renderUI();
	});
}

// ── Ask Gemini Button ────────────────────────────────────────

function renderAskButton(container, itemId, watchContainer) {
	const btn = document.createElement("button");
	btn.id = ECA.BTN_ID;
	btn.type = "button";
	btn.title = "Ask Gemini";

	if (watchContainer?.parentNode) {
		btn.className =
			"ux-call-to-action fake-btn fake-btn--fluid fake-btn--large fake-btn--secondary ebay-copy-btn";
		btn.innerHTML = btnHTML(SVG.sparkle, "Ask Gemini");
		container.appendChild(btn);
		insertAfterWatch(container, watchContainer);
	} else {
		// Fallback: floating button
		btn.className = ECA.FLOATING_CLASS;
		btn.innerHTML = SVG.sparkle;
		container.appendChild(btn);
		document.body.appendChild(container);
	}

	btn.addEventListener("click", handleAskGemini(btn, itemId));
}

function handleAskGemini(btn, itemId) {
	return async () => {
		btn.style.pointerEvents = "none";
		try {
			const data = {
				title: extractTitle(),
				...extractAuctionData(),
				condition: extractCondition(),
				specs: extractItemSpecifics(),
				shipping: extractShipping(),
				returns: extractReturns(),
				seller: extractSellerInfo(),
				reviews: extractSellerReviews(),
				description: await extractDescription(),
			};

			const { preamble, geminiUrl } = await chrome.storage.sync.get({
				preamble: ECA.DEFAULT_PREAMBLE,
				geminiUrl: ECA.DEFAULT_GEMINI_URL,
			});

			const promptText = formatPrompt(preamble, data);
			await navigator.clipboard.writeText(promptText);
			await chrome.storage.local.set({
				pendingPrompt: promptText,
				activePromptItemId: itemId,
				pendingPromptAt: Date.now(),
			});

			const resp = await chrome.runtime.sendMessage({
				type: "OPEN_GEMINI_TAB",
				url: geminiUrl || ECA.DEFAULT_GEMINI_URL,
			});

			if (resp && resp.success === false) {
				console.error(
					"eBay Copy Assistant: Failed to open Gemini tab",
					resp.error,
				);
				showFeedback(btn, "error");
			} else {
				showFeedback(btn, "success");
			}
		} catch (err) {
			console.error("eBay Copy Assistant: Failed to copy", err);
			showFeedback(btn, "error");
		}
	};
}

// ── DOM Insertion Helper ─────────────────────────────────────

function insertAfterWatch(container, watchContainer) {
	if (watchContainer?.parentNode) {
		watchContainer.parentNode.insertBefore(
			container,
			watchContainer.nextSibling,
		);
	} else {
		document.body.appendChild(container);
	}
}
