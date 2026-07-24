# Gemini Request Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Прив’язати кожний prompt/report flow до конкретної Gemini-вкладки, гарантувати TTL cleanup і не втрачати старий звіт під час Ask again.

**Architecture:** eBay content script формує prompt, але service worker створює Gemini tab і володіє session state. `request-store.js` зберігає state за `sender.tab.id`, `gemini-editor.js` ізолює DOM-вставлення, а мінімальний `report-store.js` переносить запис звітів із Gemini content script у background.

**Tech Stack:** Chrome Extension Manifest V3, `chrome.storage.session`, `chrome.alarms`, `chrome.tabs`, runtime messaging, Vitest/jsdom.

---

**Depends on:** `docs/superpowers/plans/2026-07-24-release-foundation.md`

**Spec:** `docs/superpowers/specs/2026-07-24-gemini-request-reliability-design.md`

## File map

- Modify `config.js` — request messages, TTL and 100k/120k limits.
- Create `request-store.js` — tab-bound session state and alarms.
- Create `report-store.js` — service-worker-owned report persistence using the current history policy.
- Create `gemini-editor.js` — composer discovery and verified insertion.
- Modify `background.js` — validated request state machine and cleanup listeners.
- Modify `extractors.js` — whitespace normalization and bounded prompt formatting.
- Modify `ui.js` — non-destructive Ask again and accessible busy states.
- Replace `gemini-content.js` — claim/ACK/save protocol without direct storage writes.
- Modify `manifest.json` — `alarms`, new background imports and Gemini adapter order.
- Modify `scripts/pack.js` — include new runtime modules.
- Create `tests/request-store.test.js`, `tests/report-store.test.js`, `tests/gemini-editor.test.js`, `tests/background.test.js`, `tests/gemini-content.test.js`.
- Modify `tests/extractors.test.js`, `tests/ui.test.js`.

### Task 1: Define request protocol and prompt limits

**Files:**
- Modify: `config.js`
- Modify: `tests/extractors.test.js`

- [ ] **Step 1: Add failing constant assertions**

Append to `tests/extractors.test.js`:

```javascript
describe("Gemini request limits", () => {
	it("defines the approved TTL and prompt limits", () => {
		expect(ECA.PENDING_PROMPT_TTL_MS).toBe(5 * 60 * 1000);
		expect(ECA.MAX_DESCRIPTION_CHARS).toBe(100_000);
		expect(ECA.MAX_PROMPT_CHARS).toBe(120_000);
		expect(ECA.MESSAGE.START).toBe("START_GEMINI_REQUEST");
	});
});
```

- [ ] **Step 2: Run the focused test**

```bash
npx vitest run tests/extractors.test.js
```

Expected: FAIL because the new constants do not exist.

- [ ] **Step 3: Add protocol constants to `ECA`**

Add after `PENDING_PROMPT_TTL_MS`:

```javascript
MAX_DESCRIPTION_CHARS: 100_000,
MAX_PROMPT_CHARS: 120_000,
MESSAGE: {
	START: "START_GEMINI_REQUEST",
	CLAIM: "CLAIM_GEMINI_REQUEST",
	ACK_INSERTED: "ACK_PROMPT_INSERTED",
	SAVE_REPORT: "SAVE_GEMINI_REPORT",
	FETCH_DESCRIPTION: "FETCH_DESCRIPTION",
},
FEEDBACK_LABEL: { success: "Gemini opened", error: "Error" },
```

Replace the existing `FEEDBACK_LABEL` entry rather than leaving two copies.

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run tests/extractors.test.js
git add config.js tests/extractors.test.js
git commit -m "feat: define Gemini request protocol"
```

Expected: PASS and a protocol-only commit.

### Task 2: Implement the tab-bound request store

**Files:**
- Create: `request-store.js`
- Create: `tests/request-store.test.js`

- [ ] **Step 1: Create failing state-transition tests**

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("request-store.js"), "utf8");

function createStore() {
	const data = {};
	const chrome = {
		alarms: { create: vi.fn(), clear: vi.fn(async () => true) },
		storage: {
			session: {
				get: vi.fn(async (key) => ({ [key]: data[key] })),
				set: vi.fn(async (value) => Object.assign(data, value)),
				remove: vi.fn(async (key) => delete data[key]),
			},
		},
	};
	const ECA = { PENDING_PROMPT_TTL_MS: 300_000 };
	const store = new Function(
		"chrome",
		"ECA",
		`${code}; return ECARequestStore;`,
	)(chrome, ECA);
	return { chrome, data, store };
}

describe("request store", () => {
	it("creates and reads a request by tab ID", async () => {
		const { store } = createStore();
		await store.create(42, { itemId: "123", prompt: "Prompt", createdAt: 1000 });
		expect(await store.get(42)).toMatchObject({ state: "pending", itemId: "123" });
	});

	it("removes prompt but keeps item mapping after ACK", async () => {
		const { store } = createStore();
		await store.create(42, { itemId: "123", prompt: "Prompt", createdAt: 1000 });
		await store.markInserted(42);
		expect(await store.get(42)).toEqual({
			itemId: "123",
			createdAt: 1000,
			state: "waiting_for_chat",
		});
	});

	it("clears both session data and alarm", async () => {
		const { chrome, store } = createStore();
		await store.create(42, { itemId: "123", prompt: "Prompt", createdAt: 1000 });
		await store.remove(42);
		expect(await store.get(42)).toBeUndefined();
		expect(chrome.alarms.clear).toHaveBeenCalledWith("eca-request:42");
	});
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run tests/request-store.test.js
```

Expected: FAIL because `request-store.js` is absent.

- [ ] **Step 3: Implement `request-store.js`**

```javascript
/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECARequestStore = (() => {
	const KEY_PREFIX = "geminiRequest:";
	const ALARM_PREFIX = "eca-request:";
	const key = (tabId) => `${KEY_PREFIX}${tabId}`;
	const alarm = (tabId) => `${ALARM_PREFIX}${tabId}`;

	async function create(tabId, { itemId, prompt, createdAt = Date.now() }) {
		const request = { itemId, prompt, createdAt, state: "pending" };
		await chrome.storage.session.set({ [key(tabId)]: request });
		chrome.alarms.create(alarm(tabId), {
			when: createdAt + ECA.PENDING_PROMPT_TTL_MS,
		});
		return request;
	}

	async function get(tabId) {
		return (await chrome.storage.session.get(key(tabId)))[key(tabId)];
	}

	async function markInserted(tabId) {
		const request = await get(tabId);
		if (!request || request.state !== "pending") return null;
		const updated = {
			itemId: request.itemId,
			createdAt: request.createdAt,
			state: "waiting_for_chat",
		};
		await chrome.storage.session.set({ [key(tabId)]: updated });
		return updated;
	}

	async function remove(tabId) {
		await chrome.storage.session.remove(key(tabId));
		await chrome.alarms.clear(alarm(tabId));
	}

	function tabIdFromAlarm(name) {
		if (!name.startsWith(ALARM_PREFIX)) return null;
		const tabId = Number(name.slice(ALARM_PREFIX.length));
		return Number.isInteger(tabId) ? tabId : null;
	}

	return { create, get, markInserted, remove, tabIdFromAlarm };
})();
```

- [ ] **Step 4: Run, check and commit**

```bash
npx vitest run tests/request-store.test.js
npm run check
git add request-store.js tests/request-store.test.js
git commit -m "feat: store Gemini requests by tab"
```

Expected: 3 tests pass and Biome passes.

### Task 3: Move report writes behind a service-worker module

**Files:**
- Create: `report-store.js`
- Create: `tests/report-store.test.js`

- [ ] **Step 1: Create a failing persistence test**

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("report-store.js"), "utf8");

it("stores a report and keeps current FIFO behavior", async () => {
	const data = { chatHistoryOrder: ["old", "123"] };
	const chrome = {
		storage: {
			sync: {
				get: vi.fn(async () => ({ ...data })),
				set: vi.fn(async (value) => Object.assign(data, value)),
				remove: vi.fn(async () => {}),
			},
		},
	};
	const store = new Function("chrome", `${code}; return ECAReportStore;`)(chrome);
	await store.save("123", "https://gemini.google.com/app/report");
	expect(data.chat_123).toBe("https://gemini.google.com/app/report");
	expect(data.chatHistoryOrder).toEqual(["old", "123"]);
});
```

- [ ] **Step 2: Verify failure, then implement `report-store.js`**

```javascript
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAReportStore = (() => {
	const MAX_HISTORY = 400;

	async function save(itemId, chatUrl) {
		const data = await chrome.storage.sync.get(["chatHistoryOrder"]);
		const order = (data.chatHistoryOrder || []).filter((id) => id !== itemId);
		order.push(itemId);
		const toRemove = [];
		while (order.length > MAX_HISTORY) toRemove.push(`chat_${order.shift()}`);
		await chrome.storage.sync.set({
			[`chat_${itemId}`]: chatUrl,
			chatHistoryOrder: order,
		});
		if (toRemove.length > 0) await chrome.storage.sync.remove(toRemove);
	}

	return { save };
})();
```

Run before implementation to see FAIL, and after implementation:

```bash
npx vitest run tests/report-store.test.js
```

Expected after implementation: PASS.

- [ ] **Step 3: Commit the storage boundary**

```bash
git add report-store.js tests/report-store.test.js
git commit -m "refactor: move report persistence to background"
```

### Task 4: Normalize and bound prompts

**Files:**
- Modify: `extractors.js`
- Modify: `tests/extractors.test.js`

- [ ] **Step 1: Add exact normalization/truncation tests**

Append:

```javascript
describe("bounded prompt formatting", () => {
	it("normalizes spaces and repeated blank lines", () => {
		expect(normalizePromptText("  First\u00a0 line  \n\n\n  Second   line ")).toBe(
			"First line\n\nSecond line",
		);
	});

	it("limits description and adds the required marker", () => {
		const data = {
			title: "Item",
			type: "Buy It Now",
			bidPrice: "",
			binPrice: "",
			shipping: "",
			condition: "",
			returns: "",
			seller: { name: "", feedback: "" },
			reviews: [],
			specs: [],
			description: "x".repeat(100_001),
		};
		const prompt = formatPrompt("Analyze", data);
		expect(prompt.length).toBeLessThanOrEqual(120_000);
		expect(prompt).toContain("[Description truncated]");
	});

	it("never exceeds the full prompt limit", () => {
		const data = {
			title: "x".repeat(130_000),
			type: "Buy It Now",
			bidPrice: "",
			binPrice: "",
			shipping: "",
			condition: "",
			returns: "",
			seller: { name: "", feedback: "" },
			reviews: [],
			specs: [],
			description: "description",
		};
		expect(formatPrompt("Analyze", data).length).toBeLessThanOrEqual(120_000);
	});
});
```

- [ ] **Step 2: Verify the tests fail**

```bash
npx vitest run tests/extractors.test.js
```

Expected: FAIL because normalization/limits are absent.

- [ ] **Step 3: Add normalization and bounded description helpers**

Add before `formatPrompt`:

```javascript
function normalizePromptText(value) {
	return String(value || "")
		.replace(/\u00a0/g, " ")
		.split(/\r?\n/)
		.map((line) => line.trim().replace(/[ \t]+/g, " "))
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function appendBoundedDescription(basePrompt, rawDescription) {
	const marker = "[Description truncated]";
	const description = normalizePromptText(rawDescription);
	if (!description) return basePrompt.slice(0, ECA.MAX_PROMPT_CHARS);
	const header = "\n\n**Description:**\n";
	const markerBlock = `\n\n${marker}`;
	let body = description.slice(0, ECA.MAX_DESCRIPTION_CHARS);
	let truncated = body.length < description.length;
	const available = ECA.MAX_PROMPT_CHARS - basePrompt.length - header.length;
	if (body.length > available) truncated = true;
	if (!truncated) return `${basePrompt}${header}${body}`;
	const safeBase = basePrompt.slice(
		0,
		Math.max(0, ECA.MAX_PROMPT_CHARS - header.length - markerBlock.length),
	);
	const bodyLimit = Math.max(
		0,
		ECA.MAX_PROMPT_CHARS - safeBase.length - header.length - markerBlock.length,
	);
	body = body.slice(0, bodyLimit).trimEnd();
	return `${safeBase}${header}${body}${markerBlock}`;
}
```

Replace `formatPrompt` completely so every dynamic text field is normalized and description is added only by the bounded helper:

```javascript
function formatPrompt(preamble, data) {
	const clean = normalizePromptText;
	const lines = [`${clean(preamble)}\n\n---`];
	if (data.title) lines.push(`**Product:** ${clean(data.title)}`);
	lines.push(`**URL:** ${window.location.href.split(/[?#]/)[0]}`);
	lines.push(`**Listing Type:** ${clean(data.type)}`);
	if (data.bidPrice) lines.push(`**Current Bid:** ${clean(data.bidPrice)}`);
	if (data.binPrice) lines.push(`**Buy It Now Price:** ${clean(data.binPrice)}`);
	if (data.shipping) lines.push(`**Shipping:** ${clean(data.shipping)}`);
	if (data.condition) lines.push(`**Condition:** ${clean(data.condition)}`);
	if (data.returns) lines.push(`**Returns:** ${clean(data.returns)}`);

	if (data.seller.name) {
		const feedback = data.seller.feedback ? ` (${clean(data.seller.feedback)})` : "";
		lines.push(`\n**Seller:** ${clean(data.seller.name)}${feedback}`);
	}
	if (data.reviews?.length > 0) {
		lines.push("\n**Seller Reviews:**");
		for (const review of data.reviews) lines.push(`- "${clean(review)}"`);
	}
	if (data.specs?.length > 0) {
		lines.push("\n**Item Specifics:**");
		for (const spec of data.specs) {
			lines.push(`- ${clean(spec.label)}: ${clean(spec.value)}`);
		}
	}

	return appendBoundedDescription(normalizePromptText(lines.join("\n")), data.description);
}
```

- [ ] **Step 4: Run extractor tests and commit**

```bash
npx vitest run tests/extractors.test.js
git add extractors.js tests/extractors.test.js
git commit -m "feat: normalize and bound Gemini prompts"
```

### Task 5: Create the Gemini editor adapter

**Files:**
- Create: `gemini-editor.js`
- Create: `tests/gemini-editor.test.js`

- [ ] **Step 1: Create failing adapter tests**

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("gemini-editor.js"), "utf8");
const editorApi = () => new Function(`${code}; return ECAGeminiEditor;`)();

describe("Gemini editor adapter", () => {
	it("selects a visible main composer", () => {
		document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(editorApi().findEditor()).toBe(editor);
	});

	it("inserts and verifies prompt text", () => {
		document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(editorApi().insertPrompt(editor, "Hello Gemini")).toBe(true);
		expect(editor.textContent).toContain("Hello Gemini");
	});
});
```

- [ ] **Step 2: Verify failure, then create `gemini-editor.js`**

```javascript
/* biome-ignore-all lint/correctness/noUnusedVariables: Gemini content-script global */
var ECAGeminiEditor = (() => {
	const SELECTORS = [
		'main div[contenteditable="true"][role="textbox"]',
		'div[contenteditable="true"][aria-label*="prompt" i]',
		'div[contenteditable="true"][role="textbox"]',
	];

	function isUsable(element) {
		if (!element || element.getAttribute("aria-disabled") === "true") return false;
		const rect = element.getBoundingClientRect();
		return element.isContentEditable && rect.width > 0 && rect.height > 0;
	}

	function findEditor() {
		for (const selector of SELECTORS) {
			const editor = document.querySelector(selector);
			if (isUsable(editor)) return editor;
		}
		return null;
	}

	function waitForEditor(timeoutMs = 15_000) {
		const existing = findEditor();
		if (existing) return Promise.resolve(existing);
		return new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				const editor = findEditor();
				if (editor) finish(editor);
			});
			const timer = setTimeout(() => finish(null), timeoutMs);
			function finish(value) {
				clearTimeout(timer);
				observer.disconnect();
				resolve(value);
			}
			observer.observe(document.documentElement, { childList: true, subtree: true });
		});
	}

	function insertPrompt(editor, prompt) {
		editor.focus();
		try {
			const range = document.createRange();
			range.selectNodeContents(editor);
			range.deleteContents();
			range.insertNode(document.createTextNode(prompt));
			const selection = window.getSelection();
			selection.removeAllRanges();
			range.collapse(false);
			selection.addRange(range);
		} catch {
			document.execCommand("insertText", false, prompt);
		}
		editor.dispatchEvent(
			new InputEvent("input", {
				bubbles: true,
				inputType: "insertText",
				data: prompt,
			}),
		);
		return (editor.textContent || "").includes(prompt.slice(0, 200));
	}

	return { findEditor, insertPrompt, waitForEditor };
})();
```

Run before and after implementation:

```bash
npx vitest run tests/gemini-editor.test.js
```

Expected after implementation: 2 tests pass.

- [ ] **Step 3: Commit the adapter**

```bash
git add gemini-editor.js tests/gemini-editor.test.js
git commit -m "feat: add verified Gemini editor adapter"
```

### Task 6: Implement the service-worker request state machine

**Files:**
- Modify: `background.js`
- Create: `tests/background.test.js`

- [ ] **Step 1: Create tests for tab isolation and cleanup**

Create `tests/background.test.js` with a fake `chrome`, evaluate the classic worker scripts in one scope, and call the returned dispatcher directly:

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const scripts = ["config.js", "request-store.js", "report-store.js", "background.js"]
	.map((file) => readFileSync(resolve(file), "utf8"))
	.join("\n");

function createWorker() {
	const session = {};
	const sync = { chatHistoryOrder: [] };
	let nextTabId = 101;
	const listeners = {};
	const area = (data) => ({
		get: vi.fn(async (query) => {
			if (query === null) return { ...data };
			const keys = Array.isArray(query) ? query : [query];
			return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
		}),
		set: vi.fn(async (updates) => Object.assign(data, updates)),
		remove: vi.fn(async (keys) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
		}),
	});
	const chrome = {
		alarms: {
			create: vi.fn(),
			clear: vi.fn(async () => true),
			onAlarm: { addListener: (listener) => (listeners.alarm = listener) },
		},
		runtime: {
			onInstalled: { addListener: vi.fn() },
			onMessage: { addListener: (listener) => (listeners.message = listener) },
		},
		storage: { session: area(session), sync: area(sync) },
		tabs: {
			create: vi.fn(async () => ({ id: nextTabId++ })),
			onRemoved: { addListener: (listener) => (listeners.removed = listener) },
		},
	};
	const worker = new Function(
		"chrome",
		"importScripts",
		"fetch",
		`${scripts}; return { ECA, handleMessage };`,
	)(chrome, () => {}, vi.fn());
	return { chrome, listeners, session, sync, ...worker };
}

describe("background Gemini request flow", () => {
	it("keeps two simultaneous requests bound to their Gemini tabs", async () => {
		const { ECA, handleMessage } = createWorker();
		const gemUrl = "https://gemini.google.com/gem/id";
		const ebay = (itemId) => ({ url: `https://www.ebay.com/itm/${itemId}`, tab: { id: 1 } });
		const first = await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "111", prompt: "A", url: gemUrl },
			ebay("111"),
		);
		const second = await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "222", prompt: "B", url: gemUrl },
			ebay("222"),
		);
		expect(first.tabId).toBe(101);
		expect(second.tabId).toBe(102);
		const claim = (tabId) => handleMessage(
			{ type: ECA.MESSAGE.CLAIM },
			{ url: "https://gemini.google.com/gem/id", tab: { id: tabId } },
		);
		expect(await claim(101)).toMatchObject({ request: { itemId: "111", prompt: "A" } });
		expect(await claim(102)).toMatchObject({ request: { itemId: "222", prompt: "B" } });
	});

	it("ACKs and saves only the report mapped to the sender tab", async () => {
		const { ECA, handleMessage, sync } = createWorker();
		const gemSender = { url: "https://gemini.google.com/app/new", tab: { id: 101 } };
		await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "111", prompt: "A", url: "https://gemini.google.com/gem/id" },
			{ url: "https://www.ebay.com/itm/111", tab: { id: 1 } },
		);
		expect(await handleMessage({ type: ECA.MESSAGE.ACK_INSERTED }, gemSender)).toEqual({ success: true });
		expect(await handleMessage(
			{ type: ECA.MESSAGE.SAVE_REPORT, url: "https://gemini.google.com/app/new" },
			gemSender,
		)).toEqual({ success: true });
		expect(sync.chat_111).toBe("https://gemini.google.com/app/new");
	});

	it("cleans requests on tab close and TTL alarm", async () => {
		const { ECA, handleMessage, listeners, session } = createWorker();
		await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "111", prompt: "A", url: "https://gemini.google.com/gem/id" },
			{ url: "https://www.ebay.com/itm/111", tab: { id: 1 } },
		);
		await listeners.removed(101);
		expect(session["geminiRequest:101"]).toBeUndefined();
		await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "222", prompt: "B", url: "https://gemini.google.com/gem/id" },
			{ url: "https://www.ebay.com/itm/222", tab: { id: 2 } },
		);
		await listeners.alarm({ name: "eca-request:102" });
		expect(session["geminiRequest:102"]).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
npx vitest run tests/background.test.js
```

Expected: FAIL against the old OPEN_GEMINI_TAB flow.

- [ ] **Step 3: Refactor `background.js` around one async dispatcher**

Load globals at the top:

```javascript
importScripts("config.js", "request-store.js", "report-store.js");
/* global ECA, ECARequestStore, ECAReportStore */
```

Use these validation helpers in this stage:

```javascript
function isEbayItemSender(sender) {
	try {
		const url = new URL(sender.url);
		return url.protocol === "https:" && /(^|\.)ebay\./.test(url.hostname) && ECA.ITEM_ID_RE.test(url.pathname);
	} catch {
		return false;
	}
}

function isGeminiSender(sender) {
	try {
		const url = new URL(sender.url);
		return url.protocol === "https:" && url.hostname === ECA.GEMINI_HOST && Number.isInteger(sender.tab?.id);
	} catch {
		return false;
	}
}
```

Implement dispatcher branches with these exact state rules:

```javascript
async function handleMessage(message, sender) {
	if (message.type === ECA.MESSAGE.START) {
		if (!isEbayItemSender(sender)) return { success: false, error: "Disallowed sender" };
		if (!/^\d+$/.test(message.itemId) || typeof message.prompt !== "string") {
			return { success: false, error: "Invalid request" };
		}
		if (message.prompt.length > ECA.MAX_PROMPT_CHARS || !isAllowedGeminiUrl(message.url)) {
			return { success: false, error: "Invalid prompt or Gemini URL" };
		}
		const tab = await chrome.tabs.create({ url: message.url });
		await ECARequestStore.create(tab.id, {
			itemId: message.itemId,
			prompt: message.prompt,
		});
		return { success: true, tabId: tab.id };
	}
	if (message.type === ECA.MESSAGE.CLAIM) {
		if (!isGeminiSender(sender)) return { success: false, error: "Disallowed sender" };
		return { success: true, request: await ECARequestStore.get(sender.tab.id) };
	}
	if (message.type === ECA.MESSAGE.ACK_INSERTED) {
		if (!isGeminiSender(sender)) return { success: false, error: "Disallowed sender" };
		return { success: Boolean(await ECARequestStore.markInserted(sender.tab.id)) };
	}
	if (message.type === ECA.MESSAGE.SAVE_REPORT) {
		if (!isGeminiSender(sender) || !isAllowedGeminiUrl(message.url)) {
			return { success: false, error: "Invalid report" };
		}
		const request = await ECARequestStore.get(sender.tab.id);
		if (!request || request.state !== "waiting_for_chat") {
			return { success: false, error: "No active request" };
		}
		await ECAReportStore.save(request.itemId, message.url);
		await ECARequestStore.remove(sender.tab.id);
		return { success: true };
	}
	if (message.type === ECA.MESSAGE.FETCH_DESCRIPTION) {
		if (!isAllowedDescriptionUrl(message.url)) {
			return { success: false, error: "Disallowed fetch URL" };
		}
		return fetchDescription(message.url);
	}
	return null;
}
```

Add this complete helper above `handleMessage`:

```javascript
async function fetchDescription(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ECA.DESC_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, { credentials: "omit", signal: controller.signal });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return { success: true, html: await response.text() };
	} catch (error) {
		return { success: false, error: error.message };
	} finally {
		clearTimeout(timer);
	}
}
```

Register it without relying on Promise-return support:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessage(message, sender)
		.then(sendResponse)
		.catch((error) => sendResponse({ success: false, error: error.message }));
	return true;
});

chrome.tabs.onRemoved.addListener((tabId) => ECARequestStore.remove(tabId));
chrome.alarms.onAlarm.addListener((alarm) => {
	const tabId = ECARequestStore.tabIdFromAlarm(alarm.name);
	if (tabId !== null) ECARequestStore.remove(tabId);
});
```

Retain install initialization as this explicit listener:

```javascript
chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason !== "install") return;
	const existing = await chrome.storage.sync.get(["preamble", "geminiUrl"]);
	const defaults = {};
	if (!existing.preamble) defaults.preamble = ECA.DEFAULT_PREAMBLE;
	if (!existing.geminiUrl) defaults.geminiUrl = ECA.DEFAULT_GEMINI_URL;
	if (Object.keys(defaults).length > 0) await chrome.storage.sync.set(defaults);
});
```

The `FETCH_DESCRIPTION` branch must call the complete `fetchDescription` helper above so every message receives exactly one awaited response.

- [ ] **Step 4: Run background and store tests**

```bash
npx vitest run tests/background.test.js tests/request-store.test.js tests/report-store.test.js
```

Expected: all pass, including two-tab isolation.

- [ ] **Step 5: Commit background orchestration**

```bash
git add background.js tests/background.test.js
git commit -m "feat: orchestrate tab-bound Gemini requests"
```

### Task 7: Make UI requests accessible and non-destructive

**Files:**
- Modify: `ui.js`
- Modify: `tests/ui.test.js`
- Modify: `content.css`

- [ ] **Step 1: Replace the destructive Ask again test**

The test must click Ask again and assert:

```javascript
expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
expect(document.querySelector('a[href*="gemini.google.com"]')).not.toBeNull();
expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
	expect.objectContaining({
		type: "START_GEMINI_REQUEST",
		itemId: "123456789012",
		prompt: expect.stringContaining("Vintage Camera"),
	}),
);
```

Add a test that inspects the button synchronously after click and expects `disabled === true`, `aria-busy="true"`, then waits for completion and expects both restored.

- [ ] **Step 2: Run UI tests and verify failure**

```bash
npx vitest run tests/ui.test.js
```

Expected: FAIL because current code clears the report and uses pointer-events only.

- [ ] **Step 3: Refactor UI request handling**

Delete `clearSavedReport`. Make both handlers call `requestGemini` directly.

Add:

```javascript
function setBusy(button, busy) {
	button.disabled = busy;
	button.setAttribute("aria-disabled", String(busy));
	button.setAttribute("aria-busy", String(busy));
}
```

At request start call `setBusy(btn, true)`. Clipboard becomes non-blocking:

```javascript
try {
	await navigator.clipboard.writeText(promptText);
} catch (error) {
	console.warn("eBay Copy Assistant: Clipboard fallback unavailable", error);
}

const response = await chrome.runtime.sendMessage({
	type: ECA.MESSAGE.START,
	itemId,
	prompt: promptText,
	url: geminiUrl || ECA.DEFAULT_GEMINI_URL,
});
if (!response?.success) throw new Error(response?.error || "Failed to open Gemini");
showFeedback(btn, "success");
```

Remove the `chrome.storage.local.set` block. Make `showFeedback` restore busy state in its timer and make the catch path call `showFeedback(btn, "error")`. The existing report link remains untouched.

Add CSS:

```css
.ebay-copy-action:disabled {
	cursor: wait;
	opacity: 0.78;
}
```

- [ ] **Step 4: Run UI tests and commit**

```bash
npx vitest run tests/ui.test.js
git add ui.js content.css tests/ui.test.js
git commit -m "fix: preserve reports during Ask again"
```

### Task 8: Replace Gemini-side flow with claim/ACK/save

**Files:**
- Replace: `gemini-content.js`
- Create: `tests/gemini-content.test.js`

- [ ] **Step 1: Create integration tests with mocked adapter/runtime**

Evaluate `gemini-content.js` with `ECA`, `ECAGeminiEditor`, a fake location and a mocked `chrome.runtime.sendMessage`. Assert this call order for a pending request:

```javascript
[
	{ type: "CLAIM_GEMINI_REQUEST" },
	{ type: "ACK_PROMPT_INSERTED" },
	{ type: "SAVE_GEMINI_REPORT", url: "https://gemini.google.com/app/chat-id" },
]
```

Add a reload case where CLAIM returns `{ state: "waiting_for_chat" }`; assert no insertion and eventual SAVE. Add an editor-timeout case; assert CLAIM is never sent.

- [ ] **Step 2: Verify tests fail against the old storage-based script**

```bash
npx vitest run tests/gemini-content.test.js
```

Expected: FAIL because current script reads `storage.local` directly.

- [ ] **Step 3: Replace `gemini-content.js`**

```javascript
/* global ECA, ECAGeminiEditor */
(() => {
	const CHAT_PATH_RE = /\/(app|chat|chats)\/[^/?#]|\/gem\/[^/?#]+\/[^/?#]/;

	async function send(type, extra = {}) {
		return chrome.runtime.sendMessage({ type, ...extra });
	}

	function waitForChatUrl() {
		return new Promise((resolve) => {
			let attempts = 0;
			const timer = setInterval(() => {
				attempts++;
				if (CHAT_PATH_RE.test(window.location.href)) {
					clearInterval(timer);
					resolve(window.location.href);
				} else if (attempts >= 300) {
					clearInterval(timer);
					resolve(null);
				}
			}, 1000);
		});
	}

	async function run() {
		const editor = await ECAGeminiEditor.waitForEditor();
		if (!editor) return;
		const claimed = await send(ECA.MESSAGE.CLAIM);
		const request = claimed?.request;
		if (!claimed?.success || !request) return;

		if (request.state === "pending") {
			if (!ECAGeminiEditor.insertPrompt(editor, request.prompt)) return;
			const ack = await send(ECA.MESSAGE.ACK_INSERTED);
			if (!ack?.success) return;
		}

		const chatUrl = await waitForChatUrl();
		if (chatUrl) await send(ECA.MESSAGE.SAVE_REPORT, { url: chatUrl });
	}

	run().catch((error) => {
		if (!String(error?.message).includes("Extension context invalidated")) {
			console.warn("eBay Copy Assistant: Gemini flow failed", error);
		}
	});
})();
```

- [ ] **Step 4: Run Gemini-side tests and commit**

```bash
npx vitest run tests/gemini-editor.test.js tests/gemini-content.test.js
git add gemini-content.js tests/gemini-content.test.js
git commit -m "feat: bind Gemini content flow to its tab"
```

### Task 9: Wire runtime modules into manifest and package

**Files:**
- Modify: `manifest.json`
- Modify: `scripts/pack.js`
- Modify: `tests/release-scripts.test.js`

- [ ] **Step 1: Add failing package/manifest assertions**

Assert:

```javascript
expect(manifest.permissions).toContain("alarms");
expect(manifest.content_scripts.find((entry) =>
	entry.matches.includes("https://gemini.google.com/*"),
).js).toEqual(["config.js", "gemini-editor.js", "gemini-content.js"]);
```

Also extend package verification expectations to include `request-store.js`, `report-store.js`, and `gemini-editor.js`.

- [ ] **Step 2: Verify failure**

```bash
npx vitest run tests/release-scripts.test.js
```

- [ ] **Step 3: Update manifest and pack list**

Use:

```json
"permissions": ["storage", "alarms"]
```

Change Gemini scripts to:

```json
"js": ["config.js", "gemini-editor.js", "gemini-content.js"]
```

Add `request-store.js`, `report-store.js`, and `gemini-editor.js` to `PRODUCTION_FILES` in `scripts/pack.js`.

- [ ] **Step 4: Run full packaging tests and commit**

```bash
npm test
npm run pack
npm run verify:package
git add manifest.json scripts/pack.js tests/release-scripts.test.js
git commit -m "build: package reliable Gemini request flow"
```

### Task 10: Final runtime verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all automated gates**

```bash
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
git diff --check
```

Expected: all pass; no tests write tracked files.

- [ ] **Step 2: Confirm old global flow is gone**

```bash
rg -n "pendingPrompt|activePromptItemId|clearSavedReport|OPEN_GEMINI_TAB" --glob '!docs/**'
```

Expected: no runtime matches.

- [ ] **Step 3: Manual smoke test**

Load unpacked extension and verify:

```text
1. Ask Gemini opens one tab and inserts one prompt.
2. Two eBay item tabs opened quickly produce two correctly paired Gemini tabs.
3. Ask again leaves Show report usable until the replacement chat is saved.
4. Closing a Gemini tab clears only its request.
5. A prompt older than five minutes is not inserted.
6. Clipboard denial does not block automatic insertion.
```

- [ ] **Step 4: Record verification in the final implementation commit if fixes were needed**

```bash
git status --short
git log --oneline -10
```

Expected: clean worktree and all Gemini reliability commits present.
