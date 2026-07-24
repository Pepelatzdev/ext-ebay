# Floating Gemini Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eBay-DOM-dependent inline UI with an always-visible bottom-right control that supports **Ask Gemini**, **Show report**, and **Ask again**.

**Architecture:** Keep `content.js` as the storage-change orchestrator and make `ui.js` render one fixed container directly under `document.body`. Reuse one Gemini request workflow for first and repeated requests, retain strict saved-URL validation, and cover rendering plus repeated requests with isolated jsdom tests.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, CSS, Chrome Storage API, Clipboard API, Vitest 4, jsdom, Biome.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `tests/ui.test.js` | Create | Test fixed rendering, URL validation, and repeated requests with Chrome API mocks |
| `ui.js` | Modify | Render and coordinate Ask/Show/Ask-again actions |
| `content.css` | Modify | Style responsive fixed actions without eBay selectors |
| `content.js` | Verify only | Re-render when the current item's synchronized chat URL changes |

No manifest, extractor, background-worker, Gemini content-script, or prompt-format changes are required.

### Task 1: Add UI rendering tests

**Files:**
- Create: `tests/ui.test.js`
- Test: `tests/ui.test.js`

- [ ] **Step 1: Create the UI test harness**

Create `tests/ui.test.js` with:

```javascript
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const configCode = readFileSync(resolve(testDir, "../config.js"), "utf8");
const extractorsCode = readFileSync(resolve(testDir, "../extractors.js"), "utf8");
const uiCode = readFileSync(resolve(testDir, "../ui.js"), "utf8");

function setUrl(url) {
	Object.defineProperty(window, "location", {
		value: { href: url },
		writable: true,
		configurable: true,
	});
}

function createChrome(initialSync = {}) {
	const syncData = { ...initialSync };
	return {
		runtime: { sendMessage: vi.fn(async () => ({ success: true })) },
		storage: {
			local: { set: vi.fn(async () => {}) },
			sync: {
				get: vi.fn(async (query) => {
					if (Array.isArray(query)) {
						return Object.fromEntries(
							query.filter((key) => key in syncData)
								.map((key) => [key, syncData[key]]),
						);
					}
					return { ...query, ...syncData };
				}),
				remove: vi.fn(async (keys) => {
					for (const key of keys) delete syncData[key];
				}),
				set: vi.fn(async (updates) => Object.assign(syncData, updates)),
			},
		},
	};
}

function loadUi() {
	return new Function(
		[configCode, extractorsCode, uiCode, "return { renderUI };"].join("\n"),
	)();
}

beforeEach(() => {
	document.body.innerHTML = "<main>Listing content</main>";
	setUrl("https://www.ebay.com/itm/123456789012");
	globalThis.chrome = createChrome();
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText: vi.fn(async () => {}) },
		configurable: true,
	});
});
```

- [ ] **Step 2: Add the failing state-rendering tests**

Append:

```javascript
describe("floating Gemini actions", () => {
	it("renders Ask Gemini directly under body without watch-list markup", async () => {
		const querySpy = vi.spyOn(document, "querySelector");
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById("ebay-copy-assistant-container");
		expect(container?.parentElement).toBe(document.body);
		expect(container?.textContent).toContain("Ask Gemini");
		expect(querySpy).not.toHaveBeenCalledWith("#vi-atl-lnk-99");
		expect(querySpy).not.toHaveBeenCalledWith("#watchBtn_btn_1");
	});

	it("renders Show report and Ask again for a safe chat URL", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012:
				"https://gemini.google.com/gem/example/chat-example",
		});
		const { renderUI } = loadUi();
		await renderUI();

		const link = document.querySelector("#ebay-copy-assistant-container a");
		expect(link?.textContent).toContain("Show report");
		expect(link?.href).toBe(
			"https://gemini.google.com/gem/example/chat-example",
		);
		expect(link?.target).toBe("_blank");
		expect(link?.rel).toBe("noopener noreferrer");
		expect(document.getElementById("ebay-gemini-reset-btn")?.textContent)
			.toContain("Ask again");
	});

	it("falls back to Ask Gemini for an unsafe report URL", async () => {
		globalThis.chrome = createChrome({
			chat_123456789012: "https://example.com/not-gemini",
		});
		const { renderUI } = loadUi();
		await renderUI();

		const container = document.getElementById("ebay-copy-assistant-container");
		expect(container?.textContent).toContain("Ask Gemini");
		expect(container?.querySelector("a")).toBeNull();
	});
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run tests/ui.test.js`

Expected: FAIL because the current fallback is icon-only and the report link says `View Report`.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/ui.test.js
git commit -m "test: define floating Gemini action states"
```

### Task 2: Replace eBay-dependent rendering

**Files:**
- Modify: `ui.js:30-192`
- Test: `tests/ui.test.js`

- [ ] **Step 1: Make feedback preserve the initiating action's label**

Replace `btnHTML` and `showFeedback` with:

```javascript
function btnHTML(icon, label) {
	return `<span class="ebay-copy-action__content">${icon}<span class="ebay-copy-action__text">${label}</span></span>`;
}

function showFeedback(targetBtn, type) {
	if (feedbackTimer) clearTimeout(feedbackTimer);
	if (!targetBtn) return;
	const originalHTML = targetBtn.innerHTML;
	targetBtn.innerHTML = btnHTML(SVG[type], ECA.FEEDBACK_LABEL[type]);
	targetBtn.classList.add(`ebay-copy--${type}`);
	targetBtn.style.pointerEvents = "none";

	feedbackTimer = setTimeout(() => {
		targetBtn.innerHTML = originalHTML;
		targetBtn.classList.remove(`ebay-copy--${type}`);
		targetBtn.style.pointerEvents = "";
		feedbackTimer = null;
	}, ECA.FEEDBACK_DELAY[type]);
}
```

- [ ] **Step 2: Replace `renderUI`**

```javascript
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
		if (chatUrl && isSafeGeminiUrl(chatUrl)) {
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
```

- [ ] **Step 3: Replace report and ask renderers**

```javascript
function renderReportReady(container, chatUrl, itemId) {
	const resetBtn = document.createElement("button");
	resetBtn.id = ECA.RESET_BTN_ID;
	resetBtn.type = "button";
	resetBtn.className = "ebay-copy-action ebay-copy-action--secondary";
	resetBtn.innerHTML = btnHTML(SVG.sparkle, "Ask again");

	const link = document.createElement("a");
	link.className = "ebay-copy-action ebay-copy-action--primary";
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.href = chatUrl;
	link.innerHTML = btnHTML(SVG.report, "Show report");

	container.replaceChildren(resetBtn, link);
	resetBtn.addEventListener("click", handleAskAgain(resetBtn, itemId));
}

function renderAskButton(container, itemId) {
	const btn = document.createElement("button");
	btn.id = ECA.BTN_ID;
	btn.type = "button";
	btn.title = "Ask Gemini";
	btn.className = "ebay-copy-action ebay-copy-action--primary";
	btn.innerHTML = btnHTML(SVG.sparkle, "Ask Gemini");
	container.replaceChildren(btn);
	btn.addEventListener("click", handleAskGemini(btn, itemId));
}
```

Add the first, reset-only version of the report cleanup handler so the report state is complete before Task 3:

```javascript
async function clearSavedReport(itemId) {
	await chrome.storage.sync.remove([`chat_${itemId}`]);
	const syncData = await chrome.storage.sync.get(["chatHistoryOrder"]);
	const order = (syncData.chatHistoryOrder || []).filter(
		(savedItemId) => savedItemId !== itemId,
	);
	await chrome.storage.sync.set({ chatHistoryOrder: order });
}

function handleAskAgain(_btn, itemId) {
	return async () => {
		await clearSavedReport(itemId);
		renderUI();
	};
}
```

Delete `insertAfterWatch`. No `ui.js` code should reference `watchContainer` or `watchButton`.

- [ ] **Step 4: Run the rendering tests**

Run: `npx vitest run tests/ui.test.js`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the renderer**

```bash
git add ui.js
git commit -m "feat: render Gemini actions as fixed controls"
```

### Task 3: Make Ask again start a fresh report

**Files:**
- Modify: `tests/ui.test.js`
- Modify: `ui.js:151-242`

- [ ] **Step 1: Add the failing repeated-request test**

Add inside the existing `describe` block:

```javascript
it("clears the saved report and starts a new Gemini request", async () => {
	globalThis.chrome = createChrome({
		chat_123456789012:
			"https://gemini.google.com/gem/example/chat-example",
		chatHistoryOrder: ["older-item", "123456789012"],
	});
	document.body.innerHTML =
		'<h1 itemprop="name">Vintage Camera</h1>' +
		'<div class="x-price-primary">' +
		'<span class="ux-textspans">US $99.99</span></div>';
	const { renderUI } = loadUi();
	await renderUI();

	document.getElementById("ebay-gemini-reset-btn").click();

	await vi.waitFor(() => {
		expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
			type: "OPEN_GEMINI_TAB",
			url: "https://gemini.google.com/gem/cb9c9074ac8d",
		});
	});
	expect(chrome.storage.sync.remove).toHaveBeenCalledWith([
		"chat_123456789012",
	]);
	expect(chrome.storage.sync.set).toHaveBeenCalledWith({
		chatHistoryOrder: ["older-item"],
	});
	expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
	expect(chrome.storage.local.set).toHaveBeenCalledWith(
		expect.objectContaining({
			activePromptItemId: "123456789012",
			pendingPrompt: expect.stringContaining("Vintage Camera"),
		}),
	);
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run tests/ui.test.js -t "clears the saved report"`

Expected: FAIL because the reset-only `handleAskAgain` does not start a new Gemini request.

- [ ] **Step 3: Extract the reusable request function**

Replace `handleAskGemini` with:

```javascript
function handleAskGemini(btn, itemId) {
	return () => requestGemini(btn, itemId);
}

async function requestGemini(btn, itemId) {
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
		const response = await chrome.runtime.sendMessage({
			type: "OPEN_GEMINI_TAB",
			url: geminiUrl || ECA.DEFAULT_GEMINI_URL,
		});
		if (response?.success === false) {
			throw new Error(response.error || "Failed to open Gemini tab");
		}
		showFeedback(btn, "success");
	} catch (error) {
		console.error("eBay Copy Assistant: Failed to ask Gemini", error);
		showFeedback(btn, "error");
	}
}
```

- [ ] **Step 4: Upgrade the repeated-request handler**

Keep `clearSavedReport` from Task 2 and replace only `handleAskAgain` with:

```javascript
function handleAskAgain(btn, itemId) {
	return async () => {
		btn.style.pointerEvents = "none";
		try {
			await clearSavedReport(itemId);
			await requestGemini(btn, itemId);
		} catch (error) {
			console.error(
				"eBay Copy Assistant: Failed to replace saved report",
				error,
			);
			showFeedback(btn, "error");
		}
	};
}
```

- [ ] **Step 5: Run all UI tests and commit**

Run: `npx vitest run tests/ui.test.js`

Expected: 4 tests PASS.

```bash
git add ui.js tests/ui.test.js
git commit -m "feat: restart Gemini analysis from saved reports"
```

### Task 4: Style the responsive floating control

**Files:**
- Modify: `content.css:3-108`

- [ ] **Step 1: Replace obsolete inline and report-card CSS**

Replace `content.css` with:

```css
/* eBay Copy Assistant — Floating actions */

.ebay-copy-container {
	position: fixed;
	right: max(20px, env(safe-area-inset-right));
	bottom: max(20px, env(safe-area-inset-bottom));
	z-index: 2147483647;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
	max-width: calc(100vw - 40px);
	font-family: Arial, sans-serif;
}

.ebay-copy-action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	min-height: 48px;
	padding: 11px 18px;
	border: 1px solid transparent;
	border-radius: 999px;
	font: inherit;
	font-size: 16px;
	font-weight: 700;
	line-height: 24px;
	text-decoration: none;
	cursor: pointer;
	box-shadow: 0 3px 14px rgba(0, 0, 0, 0.28);
	transition:
		background-color 160ms ease,
		border-color 160ms ease,
		box-shadow 160ms ease,
		transform 160ms ease;
	appearance: none;
	-webkit-appearance: none;
}

.ebay-copy-action:hover {
	transform: translateY(-1px);
	box-shadow: 0 5px 18px rgba(0, 0, 0, 0.34);
}

.ebay-copy-action:active {
	transform: translateY(0);
}

.ebay-copy-action:focus-visible {
	outline: 3px solid #3665f3;
	outline-offset: 3px;
}

.ebay-copy-action--primary {
	background-color: #191919;
	color: #fff;
}

.ebay-copy-action--primary:hover {
	background-color: #333;
}

.ebay-copy-action--secondary {
	min-height: 36px;
	padding: 5px 13px;
	background-color: rgba(255, 255, 255, 0.96);
	border-color: #767676;
	color: #191919;
	font-size: 14px;
	line-height: 24px;
}

.ebay-copy-action--secondary:hover {
	background-color: #f7f7f7;
}
```

Continue the same stylesheet with:

```css
.ebay-copy-action.ebay-copy--success {
	background-color: #228b22;
	border-color: #228b22;
	color: #fff;
}

.ebay-copy-action.ebay-copy--error {
	background-color: #c82828;
	border-color: #c82828;
	color: #fff;
}

.ebay-copy-action__content {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	white-space: nowrap;
}

.ebay-copy-action svg {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
}

@media (max-width: 480px) {
	.ebay-copy-container {
		right: max(12px, env(safe-area-inset-right));
		bottom: max(12px, env(safe-area-inset-bottom));
		max-width: calc(100vw - 24px);
	}

	.ebay-copy-action {
		min-height: 44px;
		padding: 9px 15px;
		font-size: 15px;
	}

	.ebay-copy-action--secondary {
		min-height: 34px;
		padding: 4px 12px;
		font-size: 13px;
	}
}
```

This supersedes the uncommitted inline-button CSS while carrying its explicit sizing, border, typography, and hover treatment into the new floating classes.

- [ ] **Step 2: Run static checks and commit**

Run: `npx biome check ui.js content.css tests/ui.test.js`

Expected: Checked 3 files with no errors.

```bash
git add content.css
git commit -m "style: add responsive floating Gemini controls"
```

### Task 5: Complete regression and manual verification

**Files:**
- Verify: `content.js`
- Verify: `ui.js`
- Verify: `content.css`
- Verify: `tests/ui.test.js`

- [ ] **Step 1: Confirm the storage listener**

Run: `rg -n "storage.onChanged|chat_" content.js`

Expected: `content.js` targets `chat_<itemId>` in sync storage and calls `renderUI()` when it changes.

- [ ] **Step 2: Run the full suite**

Run: `npm test`

Expected: two test files pass with 42 total tests.

- [ ] **Step 3: Run repository-wide static checks**

Run: `npx biome check .`

Expected: no Biome errors.

- [ ] **Step 4: Verify the production package**

Run:

```bash
node scripts/pack.js
unzip -l extension.zip
```

Expected: `extension.zip` contains runtime files and icons, but no tests or docs.

- [ ] **Step 5: Manually verify in Chrome**

1. Load the project directory with **Load unpacked** at `chrome://extensions/`.
2. Open a supported eBay item with no saved chat and confirm **Ask Gemini** is fixed at bottom-right without `Add to Watchlist` markup.
3. Click **Ask Gemini** and confirm Gemini opens with the prompt.
4. Start the conversation and confirm eBay changes to **Show report** plus **Ask again**.
5. Confirm **Show report** opens the saved chat.
6. Click **Ask again** and confirm the old report is cleared and a new Gemini request starts.
7. Resize below 480 px and confirm all actions remain visible and usable.

- [ ] **Step 6: Review the final diff**

Run:

```bash
git status --short
git diff HEAD~3 -- ui.js content.css tests/ui.test.js
```

Expected: only the planned UI, styles, and tests differ across implementation commits.
