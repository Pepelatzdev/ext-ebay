# Review Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the release-blocking advisories and make report persistence, Gemini navigation, prompt insertion, request expiry, and README guarantees reliable.

**Architecture:** Keep the existing Manifest V3 context boundaries. Shared Gemini URL rules live in `config.js`, the service worker remains the only privileged writer, and focused regression tests protect each failure reproduced during review.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript, Chrome Storage and Alarms APIs, Vitest, jsdom, npm, Biome.

---

## File Map

- Modify `package-lock.json`: resolve vulnerable development-only transitive dependencies.
- Modify `config.js`: define shared Gemini Gem/report URL validators.
- Modify `message-validation.js`: apply URL-role-specific validation to privileged messages.
- Modify `options.js`: reject non-Gem target URLs.
- Modify `ui.js`: display only recognized report URLs.
- Modify `gemini-content.js`: require a transition from the initial Gem URL to a report URL.
- Modify `gemini-editor.js`: verify complete inserted prompt content.
- Modify `request-store.js`: enforce TTL when reading requests.
- Modify `report-store.js`: serialize complete report save transactions.
- Modify `tests/message-validation.test.js`, `tests/ui.test.js`, `tests/gemini-content.test.js`, `tests/gemini-editor.test.js`, `tests/request-store.test.js`, and `tests/report-store.test.js`: add regression coverage.
- Modify `README.md`: align documented requirements and guarantees with runtime behavior.

### Task 1: Resolve release-blocking dependency advisories

**Files:**
- Modify: `package-lock.json`

- [x] **Step 1: Confirm the current audit failure**

Run: `npm audit --audit-level=high`

Expected: FAIL and identify vulnerable `nanoid@3.3.16` and `postcss@8.5.22` under Vitest/Vite.

- [x] **Step 2: Apply npm's compatible dependency resolution**

Run: `npm audit fix`

Expected: npm updates only compatible transitive development dependencies; it does not add runtime packages or perform a forced major-version update.

- [x] **Step 3: Verify the resolved dependency tree**

Run: `npm ls nanoid postcss && npm audit --audit-level=high`

Expected: `nanoid` resolves to at least `3.3.18`, `postcss` resolves beyond `8.5.22`, and the audit reports zero high-severity vulnerabilities.

- [x] **Step 4: Verify the dependency update does not affect behavior**

Run: `npm run check && npm test`

Expected: Biome succeeds and all existing test files pass.

- [x] **Step 5: Commit the lockfile update**

```bash
git add package-lock.json
git commit -m "chore: resolve development dependency advisories"
```

### Task 2: Serialize report-history writes

**Files:**
- Modify: `tests/report-store.test.js`
- Modify: `report-store.js`

- [x] **Step 1: Add regression tests for concurrency and queue recovery**

Add these cases inside `describe("quota-aware report store", ...)`:

```js
it("serializes simultaneous saves against the latest history", async () => {
	const initial = { chatHistoryOrder: [] };
	for (let index = 0; index < 200; index++) {
		initial.chatHistoryOrder.push(String(index));
		initial[`chat_${index}`] = `https://gemini.google.com/app/${index}`;
	}
	const { data, store } = createStore(initial);

	await Promise.all([
		store.save("new-a", "https://gemini.google.com/app/new-a"),
		store.save("new-b", "https://gemini.google.com/app/new-b"),
	]);

	expect(data.chatHistoryOrder).toHaveLength(200);
	expect(data.chatHistoryOrder.slice(-2)).toEqual(["new-a", "new-b"]);
	expect(data["chat_new-a"]).toBeTruthy();
	expect(data["chat_new-b"]).toBeTruthy();
	expect(data.chat_0).toBeUndefined();
	expect(data.chat_1).toBeUndefined();
});

it("continues the save queue after one operation fails", async () => {
	const { chrome, data, store } = createStore({ chatHistoryOrder: [] });
	chrome.storage.sync.set.mockRejectedValueOnce(new Error("write failed"));

	await expect(
		store.save("failed", "https://gemini.google.com/app/failed"),
	).rejects.toThrow("write failed");
	await store.save("next", "https://gemini.google.com/app/next");

	expect(data.chat_next).toBe("https://gemini.google.com/app/next");
});
```

- [x] **Step 2: Run the new tests and observe the race failure**

Run: `npm test -- tests/report-store.test.js`

Expected: FAIL because simultaneous saves calculate history from the same original snapshot.

- [x] **Step 3: Put the complete save transaction behind a resilient promise queue**

In `report-store.js`, replace the current `save` implementation with:

```js
let saveQueue = Promise.resolve();

async function performSave(itemId, chatUrl) {
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
	if (used > TARGET_BYTES) {
		throw new Error(`Sync storage remains above target: ${used}`);
	}
}

function save(itemId, chatUrl) {
	const operation = saveQueue.then(() => performSave(itemId, chatUrl));
	saveQueue = operation.catch(() => {});
	return operation;
}
```

- [x] **Step 4: Run report-store and background-flow tests**

Run: `npm test -- tests/report-store.test.js tests/background.test.js`

Expected: PASS, including simultaneous saves and recovery after a failed write.

- [x] **Step 5: Commit serialized report persistence**

```bash
git add report-store.js tests/report-store.test.js
git commit -m "fix: serialize report history writes"
```

### Task 3: Separate Gemini Gem targets from report URLs

**Files:**
- Modify: `config.js`
- Modify: `message-validation.js`
- Modify: `options.js`
- Modify: `ui.js`
- Modify: `tests/message-validation.test.js`
- Modify: `tests/ui.test.js`

- [x] **Step 1: Load the shared config in validation tests and cover both URL roles**

At the top of `tests/message-validation.test.js`, read `config.js` and construct the validator from both scripts:

```js
const configCode = readFileSync(resolve("config.js"), "utf8");
const validationCode = readFileSync(resolve("message-validation.js"), "utf8");
const validation = new Function(
	`${configCode}\n${validationCode}; return ECAMessageValidation;`,
)();
```

Add the following tests:

```js
it.each([
	"https://gemini.google.com/app/existing-chat",
	"https://gemini.google.com/",
	"https://example.com/gem/id",
])("rejects a non-Gem start target %s", (url) => {
	const result = validation.validateStart(
		{ type: "START_GEMINI_REQUEST", itemId: "123", prompt: "Prompt", url },
		{ url: "https://www.ebay.com/itm/123", tab: { id: 1 } },
	);
	expect(result).toMatchObject({ ok: false });
});

it.each([
	"https://gemini.google.com/gem/id",
	"https://gemini.google.com/app/new",
	"https://gemini.google.com/",
])("rejects a non-report save URL %s", (url) => {
	const result = validation.validateGemini(
		{ type: "SAVE_GEMINI_REPORT", url },
		{ url, tab: { id: 7 } },
		"SAVE_GEMINI_REPORT",
	);
	expect(result).toMatchObject({ ok: false });
});
```

Extend `tests/ui.test.js` so a stored `https://gemini.google.com/gem/example` renders **Ask Gemini**, while the existing `/gem/example/chat-example` case still renders **Show report**.

- [x] **Step 2: Run the URL-role tests and observe acceptance of invalid roles**

Run: `npm test -- tests/message-validation.test.js tests/ui.test.js`

Expected: FAIL because current validation checks only protocol and host.

- [x] **Step 3: Add shared URL-role validators**

Append these methods after the `ECA` object in `config.js`:

```js
ECA.isGeminiGemUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			/^\/gem\/[^/]+\/?$/.test(url.pathname)
		);
	} catch {
		return false;
	}
};

ECA.isGeminiReportUrl = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return (
			url.protocol === "https:" &&
			url.hostname === ECA.GEMINI_HOST &&
			(/^\/gem\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
				/^\/(app|chat|chats)\/(?!new\/?$)[^/]+\/?$/.test(url.pathname))
		);
	} catch {
		return false;
	}
};
```

In `message-validation.js`, use `ECA.isGeminiGemUrl(message.url)` for START and `ECA.isGeminiReportUrl(message.url)` for SAVE_REPORT. Keep the host-only `isSafeGeminiUrl` helper for sender-origin validation.

In `options.js`, return `ECA.isGeminiGemUrl(rawUrl)` from `isValidGeminiUrl`. In `ui.js`, use `ECA.isGeminiReportUrl(chatUrl)` and remove its duplicate host-only helper.

- [x] **Step 4: Run the URL validation and UI tests**

Run: `npm test -- tests/message-validation.test.js tests/ui.test.js`

Expected: PASS for recognized Gem/report paths and FAIL-safe behavior for root, existing-chat target, `/app/new`, and foreign-host URLs.

- [x] **Step 5: Commit URL-role validation**

```bash
git add config.js message-validation.js options.js ui.js tests/message-validation.test.js tests/ui.test.js
git commit -m "fix: distinguish Gemini targets from reports"
```

### Task 4: Require a new chat URL before saving a report

**Files:**
- Modify: `gemini-content.js`
- Modify: `tests/gemini-content.test.js`

- [x] **Step 1: Update the Gemini-flow fixture and add transition coverage**

Load real `config.js` before `gemini-content.js` in the test. Change the happy path to start at `https://gemini.google.com/gem/example`, set `window.location.href` to `https://gemini.google.com/gem/example/chat-id` before advancing the timer, and assert the latter URL is saved.

Add this regression case:

```js
it("does not save the URL present when monitoring starts", async () => {
	setUrl("https://gemini.google.com/app/existing-chat");
	const { sendMessage } = runFlow({
		request: { state: "pending", itemId: "123", prompt: "Analyze item" },
	});
	await finishChatPolling();
	expect(sendMessage).not.toHaveBeenCalledWith(
		expect.objectContaining({ type: ECA.MESSAGE.SAVE_REPORT }),
	);
});
```

- [x] **Step 2: Run the focused test and observe premature saving**

Run: `npm test -- tests/gemini-content.test.js`

Expected: FAIL because the initial URL currently qualifies immediately.

- [x] **Step 3: Require a normalized URL transition**

Replace the local report regex and `waitForChatUrl` entry with:

```js
function comparableUrl(rawUrl) {
	try {
		const url = new URL(rawUrl);
		return `${url.origin}${url.pathname}`;
	} catch {
		return null;
	}
}

function waitForChatUrl(initialUrl = window.location.href) {
	const initial = comparableUrl(initialUrl);
	return new Promise((resolve) => {
		let attempts = 0;
		const timer = setInterval(() => {
			attempts++;
			const current = comparableUrl(window.location.href);
			if (current !== initial && ECA.isGeminiReportUrl(window.location.href)) {
				clearInterval(timer);
				resolve(window.location.href);
			} else if (attempts >= 300) {
				clearInterval(timer);
				resolve(null);
			}
		}, 1000);
	});
}
```

- [x] **Step 4: Run Gemini orchestration tests**

Run: `npm test -- tests/gemini-content.test.js tests/background.test.js`

Expected: PASS; a report is saved only after a qualifying pathname transition.

- [x] **Step 5: Commit chat-transition tracking**

```bash
git add gemini-content.js tests/gemini-content.test.js
git commit -m "fix: wait for a new Gemini chat before saving"
```

### Task 5: Verify the complete inserted prompt

**Files:**
- Modify: `gemini-editor.js`
- Modify: `tests/gemini-editor.test.js`

- [x] **Step 1: Add partial-insertion and harmless-normalization tests**

Add these cases to `tests/gemini-editor.test.js`:

```js
it("rejects an editor that retains only the prompt prefix", () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		editor.textContent = editor.textContent.slice(0, 200);
	});
	expect(editorApi().insertPrompt(editor, "x".repeat(1000))).toBe(false);
});

it("accepts equivalent line endings and spaces", () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		editor.textContent = editor.textContent.replace(/\n/g, "\r\n").replace(/ /g, "\u00a0");
	});
	expect(editorApi().insertPrompt(editor, "First line\nSecond line with space")).toBe(true);
});
```

- [x] **Step 2: Run the editor tests and observe the prefix false positive**

Run: `npm test -- tests/gemini-editor.test.js`

Expected: FAIL because the current check accepts any editor containing the first 200 characters.

- [x] **Step 3: Compare complete normalized strings**

In `gemini-editor.js`, add:

```js
function comparableText(value) {
	return String(value).replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
}
```

Replace the final return in `insertPrompt` with:

```js
return comparableText(editor.textContent) === comparableText(prompt);
```

- [x] **Step 4: Run editor and Gemini-flow tests**

Run: `npm test -- tests/gemini-editor.test.js tests/gemini-content.test.js`

Expected: PASS; partial insertion blocks ACK while content-preserving normalization remains accepted.

- [x] **Step 5: Commit complete insertion verification**

```bash
git add gemini-editor.js tests/gemini-editor.test.js
git commit -m "fix: verify complete Gemini prompt insertion"
```

### Task 6: Enforce request expiry during reads

**Files:**
- Modify: `request-store.js`
- Modify: `tests/request-store.test.js`

- [x] **Step 1: Make the store fixture use current timestamps and add expiry tests**

Change existing fixture requests from `createdAt: 1000` to `createdAt: Date.now()`. Add:

```js
it("removes and rejects an expired request during get", async () => {
	const { chrome, store } = createStore();
	await store.create(42, {
		itemId: "123",
		prompt: "Prompt",
		createdAt: Date.now() - 300_000,
	});
	expect(await store.get(42)).toBeUndefined();
	expect(chrome.storage.session.remove).toHaveBeenCalledWith("geminiRequest:42");
	expect(chrome.alarms.clear).toHaveBeenCalledWith("eca-request:42");
});

it.each([undefined, "invalid", Number.NaN])(
	"removes a request with invalid createdAt %s",
	async (createdAt) => {
		const { data, store } = createStore();
		data["geminiRequest:42"] = {
			itemId: "123",
			prompt: "Prompt",
			createdAt,
			state: "pending",
		};
		expect(await store.get(42)).toBeUndefined();
	},
);
```

- [x] **Step 2: Run the store tests and observe expired state being returned**

Run: `npm test -- tests/request-store.test.js`

Expected: FAIL because `get()` currently returns raw session state.

- [x] **Step 3: Validate age and clean invalid requests in `get()`**

Replace `get` in `request-store.js` with:

```js
async function get(tabId) {
	const request = (await chrome.storage.session.get(key(tabId)))[key(tabId)];
	if (!request) return undefined;
	const age = Date.now() - request.createdAt;
	if (!Number.isFinite(request.createdAt) || age < 0 || age >= ECA.PENDING_PROMPT_TTL_MS) {
		await remove(tabId);
		return undefined;
	}
	return request;
}
```

- [x] **Step 4: Run request-store and background-flow tests**

Run: `npm test -- tests/request-store.test.js tests/background.test.js`

Expected: PASS; delayed alarms can no longer expose expired requests.

- [x] **Step 5: Commit read-time TTL enforcement**

```bash
git add request-store.js tests/request-store.test.js
git commit -m "fix: enforce Gemini request expiry on read"
```

### Task 7: Align README with actual behavior

**Files:**
- Modify: `README.md`

- [x] **Step 1: Update the documented behavior and requirements**

Make these exact content changes:

- Replace “необов'язкове копіювання” with wording that copying is attempted automatically for every request as a fallback.
- State that cross-device settings and report links require Chrome Sync to be enabled.
- Add that the five-minute request lifetime starts when the Gemini tab opens and is not extended after insertion.
- Describe sender validation precisely: Gemini messages require a Gemini sender URL and integer tab ID; eBay messages validate the supported item-page URL and matching item ID.
- State that `pack` stages files in a temporary directory and writes `extension.zip` to the repository root.
- Change the Node requirement to Node.js 22.13 or newer in the Node 22 release line.
- List both `zip` and `unzip` as local system requirements.

- [x] **Step 2: Check documentation against source constants and workflows**

Run:

```bash
rg -n "22.13|zip|unzip|Chrome Sync|5 хвилин|sender|extension.zip|буфер" README.md
rg -n "PENDING_PROMPT_TTL_MS|MAX_DESCRIPTION_CHARS|MAX_PROMPT_CHARS" config.js
rg -n "node-version|npm audit|verify:package" .github/workflows/*.yml
```

Expected: README statements match the five-minute TTL, prompt limits, Node 22 CI line, package output, and active OAuth-based release workflow.

- [x] **Step 3: Run documentation compliance tests**

Run: `npm test -- tests/compliance.test.js tests/release-scripts.test.js`

Expected: PASS.

- [x] **Step 4: Commit README corrections**

```bash
git add README.md
git commit -m "docs: align README with extension behavior"
```

### Task 8: Run the complete release gate

**Files:**
- Verify all modified files.

- [x] **Step 1: Run static analysis and the full test suite**

Run: `npm run check && npm test`

Expected: Biome succeeds and all test files pass.

- [x] **Step 2: Run dependency and version checks**

Run: `npm audit --audit-level=high && npm run verify:version`

Expected: zero high-severity advisories and version `1.0.2` remains consistent.

- [x] **Step 3: Build and verify the production archive**

Run: `npm run pack && npm run verify:package`

Expected: `extension.zip` is created and reports `Package verified: 1.0.2`.

- [x] **Step 4: Inspect the final change set**

Run: `git status --short && git diff --check && git log --oneline -8`

Expected: no whitespace errors; only the user's pre-existing untracked audio files remain outside the commits; the remediation commits appear in priority order.
