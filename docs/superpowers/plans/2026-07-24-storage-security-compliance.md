# Storage, Security and Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обмежити synchronized report history фактичним byte budget, звузити MV3 trust boundaries і опублікувати точну privacy/license документацію.

**Architecture:** Service worker залишається єдиним privileged writer. `report-store.js` отримує count/byte pruning, а `message-validation.js` стає єдиним allowlist/schema layer для background. UI будується safe DOM factories; сайт, Options і README посилаються на одну GitHub Pages Privacy Policy.

**Tech Stack:** Chrome Extension Manifest V3, Chrome Storage API, Vitest/jsdom, static HTML/CSS, GitHub Pages.

---

**Depends on:**

- `docs/superpowers/plans/2026-07-24-release-foundation.md`
- `docs/superpowers/plans/2026-07-24-gemini-request-reliability.md`

**Spec:** `docs/superpowers/specs/2026-07-24-storage-security-compliance-design.md`

## File map

- Modify `report-store.js` — normalize history, cap at 200 and target 80 KiB.
- Modify `tests/report-store.test.js` — corruption, count, bytes and retry.
- Create `message-validation.js` — HTTPS host, sender and message schemas.
- Create `tests/message-validation.test.js` — positive/negative trust-boundary cases.
- Modify `background.js` — use validation module only.
- Modify `manifest.json` — HTTPS-only matches/hosts and explicit CSP.
- Modify `scripts/pack.js`, `tests/release-scripts.test.js` — package new validation module.
- Modify `ui.js`, `content.css`, `tests/ui.test.js` — no `innerHTML`, reduced motion.
- Create `privacy.html` and `LICENSE`.
- Modify `index.html`, `options.html`, `options.css`, `README.md` — disclosure/privacy links.
- Modify `.github/workflows/pages.yml` — deploy privacy page.
- Create `tests/compliance.test.js` — manifest/site/license assertions.

### Task 1: Enforce 200-report and 80 KiB storage policy

**Files:**
- Modify: `report-store.js`
- Modify: `tests/report-store.test.js`

- [ ] **Step 1: Expand report-store tests with exact policy cases**

Replace `tests/report-store.test.js` with this complete in-memory sync harness followed by the policy cases:

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("report-store.js"), "utf8");
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function createStore(initial = {}) {
	const data = structuredClone(initial);
	const sync = {
		get: vi.fn(async (query) => {
			if (query === null) return { ...data };
			const keys = Array.isArray(query) ? query : [query];
			return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
		}),
		set: vi.fn(async (updates) => Object.assign(data, updates)),
		remove: vi.fn(async (keys) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
		}),
		getBytesInUse: vi.fn(async () =>
			Object.entries(data).reduce((total, [key, value]) => total + bytes(key) + bytes(value), 0),
		),
	};
	const chrome = { __data: data, storage: { sync } };
	const store = new Function("chrome", `${code}; return ECAReportStore;`)(chrome);
	return { chrome, data, store };
}

describe("quota-aware report store", () => {
it("deduplicates history and keeps the newest occurrence", async () => {
	const { data, store } = createStore({
		chat_1: "https://gemini.google.com/app/one",
		chat_2: "https://gemini.google.com/app/two",
		chatHistoryOrder: ["1", "2", "1", "missing"],
	});
	await store.save("1", "https://gemini.google.com/app/replacement");
	expect(data.chatHistoryOrder).toEqual(["2", "1"]);
});

it("prunes to at most 200 reports", async () => {
	const initial = { chatHistoryOrder: [] };
	for (let index = 0; index < 200; index++) {
		initial.chatHistoryOrder.push(String(index));
		initial[`chat_${index}`] = `https://gemini.google.com/app/${index}`;
	}
	const { data, store } = createStore(initial);
	await store.save("new", "https://gemini.google.com/app/new");
	expect(data.chatHistoryOrder).toHaveLength(200);
	expect(data.chatHistoryOrder.at(-1)).toBe("new");
	expect(data.chat_0).toBeUndefined();
});

it("prunes large oldest URLs to the 80 KiB target", async () => {
	const initial = { chatHistoryOrder: [] };
	for (let index = 0; index < 100; index++) {
		initial.chatHistoryOrder.push(String(index));
		initial[`chat_${index}`] = `https://gemini.google.com/app/${"x".repeat(1000)}${index}`;
	}
	const { chrome, data, store } = createStore(initial);
	await store.save("new", "https://gemini.google.com/app/new");
	expect(await chrome.storage.sync.getBytesInUse(null)).toBeLessThanOrEqual(80 * 1024);
	expect(data.chat_new).toBeTruthy();
});

it("retries once after a quota error", async () => {
	const { chrome, store } = createStore({
		chat_old: "https://gemini.google.com/app/old",
		chatHistoryOrder: ["old"],
	});
	chrome.storage.sync.set
		.mockRejectedValueOnce(new Error("QUOTA_BYTES quota exceeded"))
		.mockImplementationOnce(async (updates) => Object.assign(chrome.__data, updates));
	await store.save("new", "https://gemini.google.com/app/new");
	expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2);
});
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run tests/report-store.test.js
```

Expected: current 400-entry store fails new policy cases.

- [ ] **Step 3: Replace `report-store.js` with quota-aware storage**

```javascript
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAReportStore = (() => {
	const MAX_REPORTS = 200;
	const TARGET_BYTES = 80 * 1024;
	const ORDER_KEY = "chatHistoryOrder";
	const reportKey = (itemId) => `chat_${itemId}`;

	function estimateEntries(data) {
		const encoder = new TextEncoder();
		return Object.entries(data).reduce(
			(total, [key, value]) =>
				total + encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length,
			0,
		);
	}

	function normalizedOrder(data, currentItemId) {
		const seen = new Set();
		const ordered = [];
		for (const id of data[ORDER_KEY] || []) {
			if (id === currentItemId || seen.has(id) || !data[reportKey(id)]) continue;
			seen.add(id);
			ordered.push(id);
		}
		const orphaned = Object.keys(data)
			.filter((key) => key.startsWith("chat_") && key !== ORDER_KEY)
			.map((key) => key.slice("chat_".length))
			.filter((id) => id !== currentItemId && !seen.has(id))
			.sort();
		return [...orphaned, ...ordered, currentItemId];
	}

	function prepare(data, itemId, chatUrl, extraPrune = 0) {
		const next = { ...data, [reportKey(itemId)]: chatUrl };
		const order = normalizedOrder(next, itemId);
		const removed = [];
		while (order.length > MAX_REPORTS) removed.push(order.shift());
		while (extraPrune > 0 && order.length > 1) {
			removed.push(order.shift());
			extraPrune--;
		}
		next[ORDER_KEY] = order;
		for (const id of removed) delete next[reportKey(id)];
		while (estimateEntries(next) > TARGET_BYTES && order.length > 1) {
			const id = order.shift();
			removed.push(id);
			delete next[reportKey(id)];
		}
		return { next, order, removed: [...new Set(removed)] };
	}

	async function applyPrepared(original, prepared, itemId, chatUrl) {
		const removeKeys = prepared.removed
			.map(reportKey)
			.filter((key) => key !== reportKey(itemId) && key in original);
		if (removeKeys.length > 0) await chrome.storage.sync.remove(removeKeys);
		await chrome.storage.sync.set({
			[reportKey(itemId)]: chatUrl,
			[ORDER_KEY]: prepared.order,
		});
	}

	async function save(itemId, chatUrl) {
		const original = await chrome.storage.sync.get(null);
		let prepared = prepare(original, itemId, chatUrl);
		try {
			await applyPrepared(original, prepared, itemId, chatUrl);
		} catch (error) {
			if (!/quota/i.test(error.message)) throw error;
			prepared = prepare(original, itemId, chatUrl, 1);
			await applyPrepared(original, prepared, itemId, chatUrl);
		}
		const used = await chrome.storage.sync.getBytesInUse(null);
		if (used > TARGET_BYTES) throw new Error(`Sync storage remains above target: ${used}`);
	}

	return { MAX_REPORTS, TARGET_BYTES, estimateEntries, normalizedOrder, prepare, save };
})();
```

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run tests/report-store.test.js
git add report-store.js tests/report-store.test.js
git commit -m "feat: bound synchronized report history"
```

### Task 2: Centralize sender, URL and schema validation

**Files:**
- Create: `message-validation.js`
- Create: `tests/message-validation.test.js`
- Modify: `background.js`

- [ ] **Step 1: Create failing trust-boundary tests**

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("message-validation.js"), "utf8");
const validation = new Function(
	"ECA",
	`${code}; return ECAMessageValidation;`,
)({
	GEMINI_HOST: "gemini.google.com",
	MAX_PROMPT_CHARS: 120_000,
	MESSAGE: {
		CLAIM: "CLAIM_GEMINI_REQUEST",
		ACK_INSERTED: "ACK_PROMPT_INSERTED",
		SAVE_REPORT: "SAVE_GEMINI_REPORT",
	},
});

describe("message validation", () => {
	it("accepts a supported HTTPS eBay item sender", () => {
		expect(
			validation.validateStart(
				{ itemId: "123", prompt: "Prompt", url: "https://gemini.google.com/gem/id" },
				{ url: "https://www.ebay.co.uk/itm/123", tab: { id: 1 } },
			),
		).toEqual({ ok: true });
	});

	it.each([
		"http://www.ebay.com/itm/123",
		"https://evil-ebay.com/itm/123",
		"https://www.ebay.com/itm/999",
	])("rejects invalid eBay sender %s", (url) => {
		expect(
			validation.validateStart(
				{ itemId: "123", prompt: "Prompt", url: "https://gemini.google.com/gem/id" },
				{ url, tab: { id: 1 } },
			),
		).toMatchObject({ ok: false });
	});

	it("rejects HTTP description and non-Gemini report URLs", () => {
		expect(validation.isAllowedDescriptionUrl("http://vi.ebaydesc.com/x")).toBe(false);
		expect(validation.isSafeGeminiUrl("https://example.com/app/x")).toBe(false);
	});

	it("requires an integer tab ID for Gemini messages", () => {
		expect(validation.isGeminiSender({ url: "https://gemini.google.com/app", tab: {} })).toBe(false);
	});

	it("rejects unexpected privileged payload fields", () => {
		expect(
			validation.validateStart(
				{
					type: "START_GEMINI_REQUEST",
					itemId: "123",
					prompt: "Prompt",
					url: "https://gemini.google.com/gem/id",
					tabId: 999,
				},
				{ url: "https://www.ebay.com/itm/123", tab: { id: 1 } },
			),
		).toMatchObject({ ok: false });
	});

	it("validates SAVE_REPORT against the Gemini sender and URL", () => {
		expect(
			validation.validateGemini(
				{ type: "SAVE_GEMINI_REPORT", url: "https://gemini.google.com/app/report" },
				{ url: "https://gemini.google.com/app/report", tab: { id: 7 } },
				"SAVE_GEMINI_REPORT",
			),
		).toEqual({ ok: true });
	});
});
```

- [ ] **Step 2: Verify failure, then implement `message-validation.js`**

```javascript
/* global ECA */
/* biome-ignore-all lint/correctness/noUnusedVariables: service-worker global */
var ECAMessageValidation = (() => {
	const EBAY_DOMAINS = [
		"ebay.com", "ebay.co.uk", "ebay.de", "ebay.fr", "ebay.it",
		"ebay.es", "ebay.com.au", "ebay.ca", "ebay.at", "ebay.pl",
	];
	const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);
	const exactKeys = (message, allowed) =>
		Object.keys(message).sort().join(",") === [...allowed].sort().join(",");

	function parsed(rawUrl) {
		try { return new URL(rawUrl); } catch { return null; }
	}

	function isSafeGeminiUrl(rawUrl) {
		const url = parsed(rawUrl);
		return Boolean(url && url.protocol === "https:" && url.hostname === ECA.GEMINI_HOST);
	}

	function isGeminiSender(sender) {
		return isSafeGeminiUrl(sender?.url) && Number.isInteger(sender?.tab?.id);
	}

	function isAllowedDescriptionUrl(rawUrl) {
		const url = parsed(rawUrl);
		return Boolean(
			url && url.protocol === "https:" &&
			(url.hostname === "ebaydesc.com" || url.hostname.endsWith(".ebaydesc.com") ||
			 url.hostname === "ebay.com" || url.hostname.endsWith(".ebay.com")),
		);
	}

	function validateStart(message, sender) {
		if (!exactKeys(message, ["type", "itemId", "prompt", "url"])) {
			return { ok: false, error: "Unexpected request fields" };
		}
		const senderUrl = parsed(sender?.url);
		const senderItemId = senderUrl?.pathname.match(/^\/itm\/(\d+)/)?.[1];
		const validSender = senderUrl?.protocol === "https:" &&
			EBAY_DOMAINS.some((domain) => hostMatches(senderUrl.hostname, domain));
		if (!validSender || senderItemId !== message.itemId) return { ok: false, error: "Disallowed sender" };
		if (!/^\d+$/.test(message.itemId) || typeof message.prompt !== "string" ||
			message.prompt.length === 0 || message.prompt.length > ECA.MAX_PROMPT_CHARS) {
			return { ok: false, error: "Invalid request payload" };
		}
		if (!isSafeGeminiUrl(message.url)) return { ok: false, error: "Invalid Gemini URL" };
		return { ok: true };
	}

	function validateGemini(message, sender, type) {
		if (!isGeminiSender(sender) || message.type !== type) {
			return { ok: false, error: "Disallowed sender" };
		}
		const allowed = type === ECA.MESSAGE.SAVE_REPORT ? ["type", "url"] : ["type"];
		if (!exactKeys(message, allowed)) return { ok: false, error: "Unexpected request fields" };
		if (type === ECA.MESSAGE.SAVE_REPORT && !isSafeGeminiUrl(message.url)) {
			return { ok: false, error: "Invalid report URL" };
		}
		return { ok: true };
	}

	function validateDescription(message) {
		if (!exactKeys(message, ["type", "url"]) || !isAllowedDescriptionUrl(message.url)) {
			return { ok: false, error: "Invalid description URL" };
		}
		return { ok: true };
	}

	return {
		EBAY_DOMAINS,
		isAllowedDescriptionUrl,
		isGeminiSender,
		isSafeGeminiUrl,
		validateDescription,
		validateGemini,
		validateStart,
	};
})();
```

Run:

```bash
npx vitest run tests/message-validation.test.js
```

Expected after implementation: all cases pass.

- [ ] **Step 3: Replace local validators in `background.js`**

Change imports/global declaration to:

```javascript
importScripts("config.js", "message-validation.js", "request-store.js", "report-store.js");
/* global ECA, ECAMessageValidation, ECARequestStore, ECAReportStore */
```

Use `validateStart(message, sender)` for START, `validateGemini(message, sender, expectedType)` for CLAIM/ACK/SAVE, and `validateDescription(message)` for description fetch. If `{ ok: false }`, return `{ success: false, error: validation.error }` before reading storage, opening a tab, or fetching. Delete duplicated local URL/sender helpers.

- [ ] **Step 4: Run background/security tests and commit**

```bash
npx vitest run tests/message-validation.test.js tests/background.test.js
git add message-validation.js background.js tests/message-validation.test.js
git commit -m "security: validate extension message boundaries"
```

### Task 3: Harden manifest and production package

**Files:**
- Modify: `manifest.json`
- Modify: `scripts/pack.js`
- Modify: `tests/release-scripts.test.js`
- Create: `tests/compliance.test.js`

- [ ] **Step 1: Create manifest compliance tests**

```javascript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8"));

describe("manifest compliance", () => {
	it("uses only approved permissions", () => {
		expect(manifest.permissions).toEqual(["storage", "alarms"]);
	});

	it("uses HTTPS for every host and content-script match", () => {
		const matches = [
			...manifest.host_permissions,
			...manifest.content_scripts.flatMap((entry) => entry.matches),
		];
		expect(matches.every((match) => match.startsWith("https://"))).toBe(true);
	});

	it("declares a self-only extension CSP", () => {
		expect(manifest.content_security_policy.extension_pages).toBe(
			"script-src 'self'; object-src 'self'",
		);
	});
});
```

- [ ] **Step 2: Verify failure, then update manifest**

Replace every `*://` prefix with `https://`, keep the exact supported domains, and add:

```json
"content_security_policy": {
	"extension_pages": "script-src 'self'; object-src 'self'"
}
```

Add `message-validation.js` to `PRODUCTION_FILES` in `scripts/pack.js` and to package expectations.

- [ ] **Step 3: Run compliance/package checks and commit**

```bash
npx vitest run tests/compliance.test.js tests/release-scripts.test.js tests/background.test.js
npm run pack
npm run verify:package
git add manifest.json scripts/pack.js tests/compliance.test.js tests/release-scripts.test.js
git commit -m "security: enforce HTTPS and extension CSP"
```

### Task 4: Remove runtime `innerHTML` and improve accessibility

**Files:**
- Modify: `ui.js`
- Modify: `content.css`
- Modify: `tests/ui.test.js`

- [ ] **Step 1: Add safe-construction assertions**

Append:

```javascript
it("builds runtime actions without innerHTML", async () => {
	expect(uiCode).not.toContain(".innerHTML");
	const { renderUI } = loadUi();
	await renderUI();
	const button = document.getElementById("ebay-copy-assistant-btn");
	expect(button.querySelector("svg")).not.toBeNull();
	expect(button.textContent).toContain("Ask Gemini");
});

it("defines reduced-motion and disabled styles", () => {
	expect(contentCss).toContain("prefers-reduced-motion: reduce");
	expect(contentCss).toContain(".ebay-copy-action:disabled");
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run tests/ui.test.js
```

- [ ] **Step 3: Replace string SVG/HTML helpers with DOM factories**

Use fixed path data:

```javascript
const SVG_PATH = {
	success: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z",
	error: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z",
	sparkle: "M12 2c.4 0 .7.3.9.7l2.2 5.2 5.2 2.2c.4.2.7.5.7.9s-.3.7-.7.9l-5.2 2.2-2.2 5.2c-.2.4-.5.7-.9.7s-.7-.3-.9-.7l-2.2-5.2-5.2-2.2c-.4-.2-.7-.5-.7-.9s.3-.7.7-.9l5.2-2.2 2.2-5.2c.2-.4.5-.7.9-.7z",
	report: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
};

function createIcon(name) {
	const namespace = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(namespace, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
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
```

Replace every `innerHTML = btnHTML(...)` with `setButtonContent(...)`. In `showFeedback`, clone the existing content node before replacement and restore it with `replaceChildren(originalContent)`.

Delete unused `SVG.copy`, `btnHTML`, `FLOATING_CLASS`, `watchContainer`, `watchButton` and obsolete Report Ready/watch-list comments.

- [ ] **Step 4: Add reduced-motion CSS**

```css
@media (prefers-reduced-motion: reduce) {
	.ebay-copy-action {
		transition: none;
	}
}
```

- [ ] **Step 5: Run UI tests and commit**

```bash
npx vitest run tests/ui.test.js
npm run check
git add ui.js config.js content.css tests/ui.test.js
git commit -m "security: build floating actions with safe DOM APIs"
```

### Task 5: Add Privacy Policy and MIT license

**Files:**
- Create: `privacy.html`
- Create: `LICENSE`
- Modify: `index.html`
- Modify: `options.html`
- Modify: `options.css`
- Modify: `tests/compliance.test.js`

- [ ] **Step 1: Add failing privacy/license tests**

Append to `tests/compliance.test.js`:

```javascript
it("publishes and links the privacy policy", () => {
	const privacy = readFileSync(resolve("privacy.html"), "utf8");
	const landing = readFileSync(resolve("index.html"), "utf8");
	const options = readFileSync(resolve("options.html"), "utf8");
	expect(privacy).toContain("Google Gemini");
	expect(privacy).toContain("chrome.storage.session");
	expect(privacy).toContain("Chrome Web Store User Data Policy");
	expect(landing).toContain("privacy.html");
	expect(options).toContain("https://pepelatzdev.github.io/ext-ebay/privacy.html");
});

it("contains a complete MIT license", () => {
	const license = readFileSync(resolve("LICENSE"), "utf8");
	expect(license).toContain("MIT License");
	expect(license).toContain("Copyright (c) 2026 Pepelatzdev");
	expect(license).toContain("THE SOFTWARE IS PROVIDED \"AS IS\"");
});
```

- [ ] **Step 2: Verify failure**

```bash
npx vitest run tests/compliance.test.js
```

- [ ] **Step 3: Create `privacy.html`**

Use a complete static page with this required body content:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy — eBay Copy Assistant</title>
  <style>
    body { max-width: 760px; margin: 0 auto; padding: 40px 20px; font: 16px/1.6 system-ui, sans-serif; color: #191919; }
    h1, h2 { line-height: 1.25; }
    a { color: #3665f3; }
  </style>
</head>
<body>
  <main>
    <h1>eBay Copy Assistant Privacy Policy</h1>
    <p>Last updated: July 24, 2026.</p>
    <p>eBay Copy Assistant processes listing data only after the user clicks Ask Gemini. It has no developer-operated backend, analytics, advertising, or data-sale functionality.</p>
    <h2>Data processed</h2>
    <p>The extension reads the current eBay listing URL, title, price, condition, shipping, returns, seller information, visible reviews, item specifics, and description to provide its user-facing analysis feature.</p>
    <h2>How data is used and shared</h2>
    <p>The prompt is generated locally, copied to the clipboard as a fallback, and sent to the Google Gemini page selected by the user. Google Gemini is the only external recipient; its processing is governed by Google's terms and privacy policy.</p>
    <h2>Storage and retention</h2>
    <p>Pending prompts are temporarily stored in <code>chrome.storage.session</code> for up to five minutes. Settings and saved Gemini report URLs use Chrome Sync. The extension does not store listing prompts on developer servers.</p>
    <h2>Deletion</h2>
    <p>Pending prompts expire automatically. Users can remove synced extension data through Chrome or by uninstalling the extension.</p>
    <h2>Limited Use</h2>
    <p>The use of information received from browser APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the extension's disclosed single purpose.</p>
    <h2>Contact</h2>
    <p>Questions: <a href="mailto:pepelatzdev@gmail.com">pepelatzdev@gmail.com</a>.</p>
    <p><a href="./">Back to eBay Copy Assistant</a></p>
  </main>
</body>
</html>
```

- [ ] **Step 4: Create `LICENSE`**

Use this complete standard MIT text:

```text
MIT License

Copyright (c) 2026 Pepelatzdev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Link and disclose from landing and Options**

Add near the install CTA in `index.html`:

```html
<p class="developer-note">
  When you click Ask Gemini, the extension sends data from the current eBay listing to Google Gemini for analysis.
  Read the <a href="privacy.html">Privacy Policy</a>.
</p>
```

Add before the closing options container in `options.html`:

```html
<p class="privacy-link">
  <a href="https://pepelatzdev.github.io/ext-ebay/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
</p>
```

Add a small centered `.privacy-link` style consistent with existing options colors.

- [ ] **Step 6: Run tests and commit**

```bash
npx vitest run tests/compliance.test.js
git add privacy.html LICENSE index.html options.html options.css tests/compliance.test.js
git commit -m "docs: add privacy policy and MIT license"
```

### Task 6: Deploy the complete static site

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `tests/compliance.test.js`

- [ ] **Step 1: Add a workflow-content assertion**

```javascript
it("deploys both landing and privacy pages", () => {
	const workflow = readFileSync(resolve(".github/workflows/pages.yml"), "utf8");
	expect(workflow).toContain("cp index.html build/");
	expect(workflow).toContain("cp privacy.html build/");
});
```

- [ ] **Step 2: Update the Prepare site step**

```yaml
- name: Prepare site
  run: |
    mkdir -p build
    cp index.html build/
    cp privacy.html build/
```

- [ ] **Step 3: Run compliance tests and commit**

```bash
npx vitest run tests/compliance.test.js
git add .github/workflows/pages.yml tests/compliance.test.js
git commit -m "ci: deploy extension privacy policy"
```

### Task 7: Fully synchronize README with the hardened project

**Files:**
- Modify: `README.md`
- Modify: `tests/compliance.test.js`

- [ ] **Step 1: Add documentation assertions**

```javascript
it("documents current limits permissions and privacy URL", () => {
	const readme = readFileSync(resolve("README.md"), "utf8");
	expect(readme).toContain("100 000");
	expect(readme).toContain("120 000");
	expect(readme).toContain("[Description truncated]");
	expect(readme).toContain("200");
	expect(readme).toContain("80");
	expect(readme).toContain("storage.session");
	expect(readme).toContain("alarms");
	expect(readme).toContain("privacy.html");
});
```

- [ ] **Step 2: Update README sections with exact behavior**

Document:

```text
- per-tab storage.session request binding;
- five-minute alarm cleanup;
- description limit 100 000 and total prompt limit 120 000 characters;
- [Description truncated] marker;
- old Show report remains available during Ask again;
- maximum 200 reports and an approximately 80 KiB sync target;
- permissions storage and alarms;
- HTTPS-only host access and service-worker sender validation;
- public Privacy Policy URL;
- API V2 tag/manual release flow and all five secrets;
- manual smoke checklist for eBay/Gemini DOM-dependent behavior.
```

Replace the license note with a link to `LICENSE`. Remove the obsolete 400-report and “deleted on next Gemini load” statements.

- [ ] **Step 3: Run documentation tests and commit**

```bash
npx vitest run tests/compliance.test.js
npm run check
git add README.md tests/compliance.test.js
git commit -m "docs: document hardened extension behavior"
```

### Task 8: Final project verification and release checklist

**Files:**
- Verify only.

- [ ] **Step 1: Run every automated gate**

```bash
npm ci
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
git diff --check
```

Expected: all pass; no high/critical audit findings; ZIP contains all runtime modules and no docs/site-only files.

- [ ] **Step 2: Run security searches**

```bash
rg -n "\*://|http://|innerHTML|pendingPrompt|activePromptItemId|update_url|manifest\.key" background.js config.js content.js extractors.js gemini-content.js gemini-editor.js manifest.json message-validation.js options.js request-store.js report-store.js ui.js
```

Expected: no runtime `*://`, HTTP fetch, `innerHTML`, old pending globals, `update_url`, or manifest key. Allow literal `http://www.w3.org/2000/svg` only if it exists as the SVG namespace string.

- [ ] **Step 3: Execute the complete manual smoke checklist**

```text
1. Buy It Now listing: correct extraction and prompt.
2. Auction listing: correct bid/BIN fields.
3. Cross-origin description iframe: HTTPS background fetch succeeds.
4. Ask Gemini: one correct prompt in one correct tab.
5. Two simultaneous listings: no cross-tab prompt/report mix-up.
6. Ask again: old report remains until replacement is saved.
7. Clipboard denied: automatic insertion still works.
8. Gemini editor unavailable: manual clipboard fallback remains possible.
9. Options save/reset and Privacy Policy link work.
10. Keyboard focus, disabled state, reduced motion and mobile layout work.
11. privacy.html loads from the final GitHub Pages URL.
```

- [ ] **Step 4: Complete external dashboard setup**

In Chrome Web Store Developer Dashboard:

```text
Privacy Policy URL: https://pepelatzdev.github.io/ext-ebay/privacy.html
Privacy disclosures: listing website content, browsing/listing URL, Chrome Sync,
                     sharing with Google Gemini for the single disclosed purpose
Publisher ID: copied to CHROME_PUBLISHER_ID secret
```

In GitHub:

```text
Pages source: GitHub Actions
chrome-web-store environment: optional required reviewer enabled
All five OAuth/Web Store secrets present
```

- [ ] **Step 5: Confirm clean state before creating a release tag**

```bash
git status --short
git log --oneline -20
```

Expected: clean worktree. Only after the updated `main` workflows pass should a matching tag such as `v1.0.3` be created; the manifest/package/lock/index version bump must be committed before the tag.
