# Chrome Web Store Installation Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GitHub Pages landing page and README consistently use the verified Chrome Web Store listing while retaining unpacked developer installation instructions.

**Architecture:** Keep the existing single-file landing page design and replace only its CTA, instructions, and a small developer note. Update the existing README installation section without restructuring the already-current feature, development, testing, packaging, or CI/CD documentation, then fast-forward the completed feature branch into `main`.

**Tech Stack:** Static HTML/CSS, Markdown, Chrome Extension Manifest V3, Vitest, Biome, Git.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `index.html` | Modify | Public Chrome Web Store CTA, current usage workflow, developer link |
| `README.md` | Modify | Chrome Web Store and unpacked installation instructions |

### Task 1: Update the GitHub Pages landing page

**Files:**
- Modify: `index.html:251-325`

- [ ] **Step 1: Confirm the obsolete CRX state**

Run:

```bash
rg -n "extension\.crx|Download Extension|Installation Instructions" index.html
```

Expected: matches for the old CRX link, CRX instructions, download CTA, and installation heading.

- [ ] **Step 2: Add the developer-note styles**

Insert after the `.step-text strong` rule:

```css
.developer-note {
  margin: 24px 0 0;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.developer-note a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.developer-note a:hover {
  color: var(--primary-hover);
  text-decoration: underline;
}
```

- [ ] **Step 3: Replace the landing-page content block**

Replace the description, CTA, and instructions card with:

```html
<p class="description">
  Analyze eBay listings with Google Gemini in one click, then reopen or refresh each saved report directly from the item page.
</p>

<a
  href="https://chromewebstore.google.com/detail/ebay-copy-assistant/ekchfjieilkcaajpefdacpmibbglikip"
  class="btn-download"
  target="_blank"
  rel="noopener noreferrer"
>
  <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
  </svg>
  Install from Chrome Web Store
</a>

<div class="instructions-card">
  <div class="instructions-title">
    <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
    </svg>
    How it works
  </div>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Install the extension from the <strong>Chrome Web Store</strong>.</div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Open a supported eBay item page and click <strong>Ask Gemini</strong>.</div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Review the inserted listing prompt and send it to Gemini.</div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-text">Return to eBay to <strong>Show report</strong> or <strong>Ask again</strong>.</div>
    </div>
  </div>
  <p class="developer-note">
    Developing locally? Follow the unpacked installation instructions in the
    <a href="https://github.com/Pepelatzdev/ext-ebay" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
  </p>
</div>
```

- [ ] **Step 4: Make the footer link safe for a new tab**

Add `rel="noopener noreferrer"` to the existing **View Repository** link.

- [ ] **Step 5: Verify the landing page content**

Run:

```bash
rg -n "Install from Chrome Web Store|Ask Gemini|Show report|Ask again|noopener noreferrer" index.html
rg -n "extension\.crx|Download Extension|Installation Instructions" index.html
```

Expected: the first command finds the new CTA, workflow, and safe links; the second command returns no matches.

### Task 2: Add both installation paths to README

**Files:**
- Modify: `README.md:36-50`

- [ ] **Step 1: Confirm the missing public installation path**

Run:

```bash
rg -n "Встановлення|Chrome Web Store|публічний URL" README.md
```

Expected: README contains only the developer installation heading and the note that the public listing URL is unavailable.

- [ ] **Step 2: Replace the installation section**

Replace the current `## Встановлення для розробки` section and unavailable-URL note with:

````markdown
## Встановлення

### Chrome Web Store

1. Відкрийте сторінку [eBay Copy Assistant у Chrome Web Store](https://chromewebstore.google.com/detail/ebay-copy-assistant/ekchfjieilkcaajpefdacpmibbglikip).
2. Натисніть **Add to Chrome** і підтвердьте встановлення.
3. За потреби закріпіть іконку розширення на панелі Chrome для швидкого доступу до **Options**.

Оновлення встановленої версії надходять через Chrome Web Store.

### Встановлення з репозиторію (unpacked)

1. Клонуйте репозиторій:

   ```bash
   git clone https://github.com/Pepelatzdev/ext-ebay.git
   cd ext-ebay
   ```

2. Відкрийте `chrome://extensions/` у Google Chrome.
3. Увімкніть **Developer mode**.
4. Натисніть **Load unpacked** і виберіть кореневу папку проєкту.
5. Після зміни вихідних файлів натисніть **Reload** на картці розширення та оновіть відкриті сторінки eBay/Gemini.
````

- [ ] **Step 3: Verify README completeness and stale-term removal**

Run:

```bash
rg -n "Chrome Web Store|Load unpacked|npm test|biome check|pack\.js|CI/CD|Ask Gemini|Show report|Ask again" README.md
rg -n "extension\.crx|update\.xml|публічний URL|View Report|Add to Watchlist|\*\*Copy Assistant\*\*" README.md
```

Expected: the first command finds both installation paths and all required documentation sections; the second command returns no matches.

- [ ] **Step 4: Commit synchronized landing-page and README updates**

```bash
git add index.html README.md
git commit -m "docs: publish Chrome Web Store installation flow"
```

### Task 3: Verify and integrate into main

**Files:**
- Verify: `index.html`
- Verify: `README.md`
- Verify: `ui.js`
- Verify: `content.css`
- Verify: `tests/ui.test.js`

- [ ] **Step 1: Run documentation and diff checks**

Run:

```bash
git diff --check main...HEAD
rg -l "https://chromewebstore.google.com/detail/ebay-copy-assistant/ekchfjieilkcaajpefdacpmibbglikip" index.html README.md
```

Expected: no whitespace errors; both `index.html` and `README.md` contain the exact verified listing URL.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: 43 tests PASS across two test files.

- [ ] **Step 3: Run repository-wide static analysis**

Run: `npx biome check .`

Expected: Biome checks 20 source files with no errors; Markdown is not processed by the current Biome configuration.

- [ ] **Step 4: Build and inspect the Chrome Web Store package**

Run:

```bash
node scripts/pack.js
unzip -l extension.zip
```

Expected: `extension.zip` contains the runtime extension files and icons, but no tests, docs, or landing page.

- [ ] **Step 5: Confirm a clean feature branch**

Run:

```bash
git status --short
git log --oneline --decorate main..HEAD
```

Expected: clean status and the complete feature/documentation commit series ahead of `main`.

- [ ] **Step 6: Fast-forward the feature branch into main**

Run:

```bash
git switch main
git merge --ff-only codex/floating-gemini-actions
```

Expected: `main` advances to the feature branch HEAD without a merge commit.

- [ ] **Step 7: Verify main after integration**

Run:

```bash
git status --short
git branch -vv
npm test
npx biome check .
```

Expected: clean `main`, 43 passing tests, and no Biome errors. Do not push to `origin`.
