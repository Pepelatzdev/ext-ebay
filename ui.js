/**
 * eBay Copy Assistant — UI Rendering.
 *
 * Handles button creation, feedback states, and saved-report actions.
 * Depends on ECA (config.js) and extractor functions (extractors.js).
 */

/* global ECA, extractItemId, extractTitle, extractAuctionData, extractCondition,
          extractItemSpecifics, extractShipping, extractReturns, extractSellerInfo,
          extractSellerReviews, extractDescription, formatPrompt */

const SVG_PATH = {
	success: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
	error:
		"M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z",
	sparkle:
		"M12 2c.4 0 .7.3.9.7l2.2 5.2 5.2 2.2c.4.2.7.5.7.9s-.3.7-.7.9l-5.2 2.2-2.2 5.2c-.2.4-.5.7-.9.7s-.7-.3-.9-.7l-2.2-5.2-5.2-2.2c-.4-.2-.7-.5-.7-.9s.3-.7.7-.9l5.2-2.2 2.2-5.2c.2-.4.5-.7.9-.7z",
	report:
		"M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
};

// ── UI Helpers ───────────────────────────────────────────────

let feedbackTimer = null;

function createIcon(name) {
	const namespace = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(namespace, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "currentColor");
	svg.setAttribute("focusable", "false");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(namespace, "path");
	path.setAttribute("d", SVG_PATH[name]);
	svg.appendChild(path);
	return svg;
}

function createButtonContent(icon, label) {
	const content = document.createElement("span");
	content.className = "ebay-copy-action__content";
	const text = document.createElement("span");
	text.className = "ebay-copy-action__text";
	text.textContent = label;
	content.append(createIcon(icon), text);
	return content;
}

function setButtonContent(button, icon, label) {
	button.replaceChildren(createButtonContent(icon, label));
}

function setBusy(button, busy) {
	button.disabled = busy;
	button.setAttribute("aria-disabled", String(busy));
	button.setAttribute("aria-busy", String(busy));
}

function showFeedback(targetBtn, type) {
	if (feedbackTimer) clearTimeout(feedbackTimer);
	if (!targetBtn) return;

	const originalContent = targetBtn.firstElementChild.cloneNode(true);
	setButtonContent(targetBtn, type, ECA.FEEDBACK_LABEL[type]);
	targetBtn.classList.add(`ebay-copy--${type}`);

	feedbackTimer = setTimeout(() => {
		targetBtn.replaceChildren(originalContent);
		targetBtn.classList.remove(`ebay-copy--${type}`);
		setBusy(targetBtn, false);
		feedbackTimer = null;
	}, ECA.FEEDBACK_DELAY[type]);
}

// ── Main Render ──────────────────────────────────────────────

// biome-ignore lint/correctness/noUnusedVariables: global entry point called by content.js
async function renderUI() {
	try {
		const itemId = extractItemId();
		if (!itemId) return;

		document.getElementById(ECA.CONTAINER_ID)?.remove();

		const container = document.createElement("div");
		container.id = ECA.CONTAINER_ID;
		container.className = "ebay-copy-container";

		const key = `chat_${itemId}`;
		const result = await chrome.storage.sync.get([key]);
		const chatUrl = result[key];

		if (chatUrl && ECA.isGeminiReportUrl(chatUrl)) {
			renderReportReady(container, chatUrl, itemId);
		} else {
			renderAskButton(container, itemId);
		}

		document.body.appendChild(container);
	} catch (e) {
		if (e.message?.includes("Extension context invalidated")) {
			console.log(
				"eBay Copy Assistant: Extension context invalidated. Page reload required.",
			);
			document.getElementById(ECA.CONTAINER_ID)?.remove();
		} else {
			console.error("eBay Copy Assistant: Error rendering UI", e);
		}
	}
}

// ── Saved Report Actions ─────────────────────────────────────

function renderReportReady(container, chatUrl, itemId) {
	const resetBtn = document.createElement("button");
	resetBtn.id = ECA.RESET_BTN_ID;
	resetBtn.type = "button";
	resetBtn.className = "ebay-copy-action ebay-copy-action--secondary";
	resetBtn.setAttribute("aria-live", "polite");
	setButtonContent(resetBtn, "sparkle", "Ask again");

	const link = document.createElement("a");
	link.className = "ebay-copy-action ebay-copy-action--primary";
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.href = chatUrl;
	setButtonContent(link, "report", "Show report");

	container.replaceChildren(resetBtn, link);
	resetBtn.addEventListener("click", handleAskAgain(resetBtn, itemId));
}

// ── Ask Gemini Button ────────────────────────────────────────

function renderAskButton(container, itemId) {
	const btn = document.createElement("button");
	btn.id = ECA.BTN_ID;
	btn.type = "button";
	btn.title = "Ask Gemini";
	btn.className = "ebay-copy-action ebay-copy-action--primary";
	btn.setAttribute("aria-live", "polite");
	setButtonContent(btn, "sparkle", "Ask Gemini");

	container.replaceChildren(btn);
	btn.addEventListener("click", handleAskGemini(btn, itemId));
}

function handleAskAgain(btn, itemId) {
	return () => requestGemini(btn, itemId);
}

function handleAskGemini(btn, itemId) {
	return () => requestGemini(btn, itemId);
}

async function requestGemini(btn, itemId) {
	setBusy(btn, true);
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
		try {
			await navigator.clipboard.writeText(promptText);
		} catch (error) {
			console.warn(
				"eBay Copy Assistant: Clipboard fallback unavailable",
				error,
			);
		}

		const response = await chrome.runtime.sendMessage({
			type: ECA.MESSAGE.START,
			itemId,
			prompt: promptText,
			url: geminiUrl || ECA.DEFAULT_GEMINI_URL,
		});

		if (!response?.success) {
			throw new Error(response?.error || "Failed to open Gemini");
		}

		showFeedback(btn, "success");
	} catch (error) {
		console.error("eBay Copy Assistant: Failed to ask Gemini", error);
		showFeedback(btn, "error");
	}
}
