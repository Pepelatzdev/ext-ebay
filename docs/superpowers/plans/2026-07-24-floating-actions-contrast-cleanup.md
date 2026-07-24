# Floating Actions Contrast and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved high-contrast cobalt palette to the floating actions, protect the report link color from host-page link states, and remove the one proven-unused configuration entry.

**Architecture:** Keep rendering and behavior unchanged. Add component-local CSS custom properties to `.ebay-copy-container`, consume them only in the existing action selectors, and add explicit `:link`/`:visited` primary-action rules. Verify the source-level CSS contract in the existing UI suite and verify configuration cleanup in the compliance suite.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, CSS custom properties, Vitest with jsdom, Biome.

---

## File map

- Modify `tests/ui.test.js`: define the high-contrast CSS contract, including scoped tokens and visited-link protection.
- Modify `content.css`: implement component-scoped cobalt primary and outlined secondary action colors without changing layout or state behavior.
- Modify `tests/compliance.test.js`: prevent the removed unused configuration key from returning.
- Modify `config.js`: remove `DESC_FETCH_HOST_SUFFIXES` and its obsolete comment.

### Task 1: Protect and implement the floating-action palette

**Files:**
- Modify: `tests/ui.test.js:186-189`
- Modify: `content.css:3-81`

- [ ] **Step 1: Write the failing palette contract test**

Add this test after `defines reduced-motion and disabled styles` in `tests/ui.test.js`:

```js
it("defines scoped high-contrast action colors and protected link states", () => {
	expect(contentCss).toContain("--eca-primary-background: #3665f3");
	expect(contentCss).toContain("--eca-primary-hover-background: #234fc7");
	expect(contentCss).toContain("--eca-primary-foreground: #fff");
	expect(contentCss).toContain("--eca-secondary-background: #fff");
	expect(contentCss).toContain("--eca-secondary-foreground: #191919");
	expect(contentCss).toContain("--eca-secondary-border: #191919");
	expect(contentCss).toContain(".ebay-copy-action--primary:link");
	expect(contentCss).toContain(".ebay-copy-action--primary:visited");
	expect(contentCss).toContain("color: var(--eca-primary-foreground)");
	expect(contentCss).not.toContain(":root");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run tests/ui.test.js
```

Expected: FAIL in `defines scoped high-contrast action colors and protected link states` because the `--eca-primary-background` token is absent.

- [ ] **Step 3: Add scoped tokens and consume them in existing action selectors**

Add these declarations at the beginning of `.ebay-copy-container` in `content.css`, before `position`:

```css
	--eca-primary-background: #3665f3;
	--eca-primary-hover-background: #234fc7;
	--eca-primary-foreground: #fff;
	--eca-secondary-background: #fff;
	--eca-secondary-hover-background: #f7f7f7;
	--eca-secondary-foreground: #191919;
	--eca-secondary-border: #191919;
```

Replace the existing primary and secondary color blocks with:

```css
.ebay-copy-action--primary,
.ebay-copy-action--primary:link,
.ebay-copy-action--primary:visited {
	background-color: var(--eca-primary-background);
	border-color: var(--eca-primary-background);
	color: var(--eca-primary-foreground);
}

.ebay-copy-action--primary:hover {
	background-color: var(--eca-primary-hover-background);
	border-color: var(--eca-primary-hover-background);
}

.ebay-copy-action--secondary {
	min-height: 36px;
	padding: 5px 13px;
	background-color: var(--eca-secondary-background);
	border-color: var(--eca-secondary-border);
	color: var(--eca-secondary-foreground);
	font-size: 14px;
	line-height: 24px;
}

.ebay-copy-action--secondary:hover {
	background-color: var(--eca-secondary-hover-background);
}
```

Do not change `.ebay-copy-action:focus-visible`, success/error colors, responsive sizing, rendering code, or the legacy button behavior.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx vitest run tests/ui.test.js
```

Expected: PASS with 8 tests in `tests/ui.test.js`.

- [ ] **Step 5: Check formatting and commit the palette change**

Run:

```bash
npx biome check content.css tests/ui.test.js
git diff --check
git add content.css tests/ui.test.js
git commit -m "style: improve floating action contrast"
```

Expected: Biome and whitespace checks pass; the commit contains only `content.css` and `tests/ui.test.js`.

### Task 2: Remove the unused configuration entry

**Files:**
- Modify: `tests/compliance.test.js:65`
- Modify: `config.js:18-24`

- [ ] **Step 1: Write the failing configuration cleanup test**

Append this test to `tests/compliance.test.js`:

```js
it("does not retain unused configuration entries", () => {
	const config = readFileSync(resolve("config.js"), "utf8");
	expect(config).not.toContain("DESC_FETCH_HOST_SUFFIXES");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npx vitest run tests/compliance.test.js
```

Expected: FAIL in `does not retain unused configuration entries` because `config.js` still contains `DESC_FETCH_HOST_SUFFIXES`.

- [ ] **Step 3: Remove only the unused entry**

Delete these two lines from `config.js`:

```js
	// Hosts allowed for background-proxied fetches (eBay description iframes).
	DESC_FETCH_HOST_SUFFIXES: [".ebaydesc.com", ".ebay.com"],
```

Keep `GEMINI_HOST`, `DESC_FETCH_TIMEOUT_MS`, and every other configuration value unchanged because the audit confirmed they have runtime consumers.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npx vitest run tests/compliance.test.js
```

Expected: PASS with 8 tests in `tests/compliance.test.js`.

- [ ] **Step 5: Check formatting and commit the cleanup**

Run:

```bash
npx biome check config.js tests/compliance.test.js
git diff --check
git add config.js tests/compliance.test.js
git commit -m "chore: remove unused description host config"
```

Expected: Biome and whitespace checks pass; the commit contains only `config.js` and `tests/compliance.test.js`.

### Task 3: Run the complete quality gate and review scope

**Files:**
- Verify only; no source files should change.

- [ ] **Step 1: Run all repository checks**

Run:

```bash
npm run check
npm test
npm run verify:version
```

Expected: Biome reports no diagnostics, all 92 Vitest tests pass, and package/manifest versions are consistent.

- [ ] **Step 2: Review the completed diff and repository state**

Run:

```bash
git diff HEAD~2 -- content.css config.js tests/ui.test.js tests/compliance.test.js
git diff --check
git status --short
```

Expected: the two implementation commits contain only the four planned files; no whitespace errors exist. The generated `.superpowers/` preview directory may remain untracked but must not be staged or committed.

- [ ] **Step 3: Confirm the acceptance criteria manually from source**

Confirm all of the following:

- `.ebay-copy-container` owns every new color token.
- `Show report` receives white text through both `:link` and `:visited` selectors.
- `Ask again` has a white background with a near-black foreground and border.
- Focus, success, error, reduced-motion, and responsive rules are still present.
- No rendering or duplicate-button cleanup logic changed.
- `DESC_FETCH_HOST_SUFFIXES` is absent and no other configuration entry was removed.

Expected: every item is satisfied without further code changes.
