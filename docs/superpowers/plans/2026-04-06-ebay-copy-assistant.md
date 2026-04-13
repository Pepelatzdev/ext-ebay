# eBay Copy Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension that extracts all key product data from eBay listing pages and copies it to the clipboard as a prompt-ready text for chatbot consultation.

**Architecture:** Manifest V3 extension with a content script injected on eBay item pages that creates a floating copy button. Data is extracted from the DOM, combined with a user-editable preamble stored in `chrome.storage.sync`, and copied to clipboard. An options page allows preamble customization.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, CSS, Chrome Storage API, Clipboard API.

---

## File Structure

| File | Responsibility |
|---|---|
| `manifest.json` | Extension manifest — permissions, content scripts, options page, icons |
| `content.js` | Injected on eBay item pages. Creates floating button, extracts product data, formats prompt, copies to clipboard |
| `content.css` | Styles for the floating button, hover/click states, and "Copied!" notification |
| `background.js` | Service worker — handles `onInstalled` to set default preamble |
| `options.html` | Settings page HTML — textarea for preamble, Save/Reset buttons |
| `options.js` | Options page logic — load/save/reset preamble from `chrome.storage.sync` |
| `options.css` | Options page styles — dark theme, modern minimalist design |
| `icons/icon16.png` | Toolbar icon 16×16 |
| `icons/icon48.png` | Extension icon 48×48 |
| `icons/icon128.png` | Store/install icon 128×128 |

---

## Task 1: Project Scaffold & Manifest

**Files:**
- Create: `manifest.json`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "eBay Copy Assistant",
  "version": "1.0.0",
  "description": "One-click copy of eBay product details as a prompt-ready text for chatbot consultation.",
  "permissions": ["storage", "clipboardWrite", "activeTab"],
  "background": {
    "service_worker": "background.js"
  },
  "options_page": "options.html",
  "content_scripts": [
    {
      "matches": [
        "*://*.ebay.com/itm/*",
        "*://*.ebay.co.uk/itm/*",
        "*://*.ebay.de/itm/*",
        "*://*.ebay.fr/itm/*",
        "*://*.ebay.it/itm/*",
        "*://*.ebay.es/itm/*",
        "*://*.ebay.com.au/itm/*",
        "*://*.ebay.ca/itm/*",
        "*://*.ebay.at/itm/*",
        "*://*.ebay.pl/itm/*"
      ],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

- [ ] **Step 2: Generate extension icons**

Generate simple clipboard/copy-themed icons at 16×16, 48×48, and 128×128 pixel sizes. Use a blue/teal accent color to differentiate from eBay's UI. Save to `icons/` directory as PNG files.

- [ ] **Step 3: Commit scaffold**

```bash
git init
git add manifest.json icons/
git commit -m "chore: initial project scaffold with manifest.json and icons"
```

---

## Task 2: Background Service Worker

**Files:**
- Create: `background.js`

- [ ] **Step 1: Create `background.js`**

```javascript
const DEFAULT_PREAMBLE = 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ preamble: DEFAULT_PREAMBLE });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add background.js
git commit -m "feat: add background service worker with default preamble setup"
```

---

## Task 3: Content Script — Floating Button UI

**Files:**
- Create: `content.css`
- Create: `content.js` (button injection only, extraction in next task)

- [ ] **Step 1: Create `content.css`**

Styles for the floating button, hover/active states, and "Copied!" notification. Uses a CSS namespace prefix `ebay-copy-` to avoid style collisions with eBay's page.

```css
/* Floating Copy Button */
#ebay-copy-assistant-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease, background 0.3s ease, box-shadow 0.2s ease;
  font-size: 20px;
  line-height: 1;
  color: #fff;
  padding: 0;
}

#ebay-copy-assistant-btn:hover {
  transform: scale(1.12);
  background: rgba(50, 50, 50, 0.95);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

#ebay-copy-assistant-btn:active {
  transform: scale(0.95);
}

#ebay-copy-assistant-btn.ebay-copy--success {
  background: rgba(34, 139, 34, 0.9);
}

/* Copied notification tooltip */
#ebay-copy-assistant-tooltip {
  position: fixed;
  bottom: 76px;
  right: 16px;
  background: rgba(34, 139, 34, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-weight: 500;
  z-index: 2147483647;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.25s ease, transform 0.25s ease;
  pointer-events: none;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

#ebay-copy-assistant-tooltip.ebay-copy--visible {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 2: Create `content.js` — button injection**

Create the initial content.js that injects the floating button into the page. The data extraction function will be added in the next task.

```javascript
(function () {
  'use strict';

  // Prevent double injection
  if (document.getElementById('ebay-copy-assistant-btn')) return;

  // --- UI: Create Floating Button ---
  const btn = document.createElement('button');
  btn.id = 'ebay-copy-assistant-btn';
  btn.title = 'Copy product info for chatbot';
  btn.textContent = '📋';
  document.body.appendChild(btn);

  // --- UI: Create Tooltip ---
  const tooltip = document.createElement('div');
  tooltip.id = 'ebay-copy-assistant-tooltip';
  tooltip.textContent = '✓ Copied!';
  document.body.appendChild(tooltip);

  // --- Show success feedback ---
  function showSuccess() {
    btn.textContent = '✓';
    btn.classList.add('ebay-copy--success');
    tooltip.classList.add('ebay-copy--visible');

    setTimeout(() => {
      btn.textContent = '📋';
      btn.classList.remove('ebay-copy--success');
      tooltip.classList.remove('ebay-copy--visible');
    }, 2000);
  }

  // --- Button click handler (extraction added in Task 4) ---
  btn.addEventListener('click', async () => {
    // Placeholder — will be replaced in Task 4
    showSuccess();
  });
})();
```

- [ ] **Step 3: Load extension in Chrome and verify button appears**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `ext-ebay/` directory
4. Navigate to any eBay item page (e.g., `https://www.ebay.com/itm/256687932761`)
5. Verify: floating button (📋) appears in the bottom-right corner
6. Verify: clicking the button shows ✓ and "Copied!" tooltip for 2 seconds

- [ ] **Step 4: Commit**

```bash
git add content.css content.js
git commit -m "feat: add floating copy button with hover/click animations"
```

---

## Task 4: Content Script — Data Extraction

**Files:**
- Modify: `content.js` — add extraction functions and wire up click handler

- [ ] **Step 1: Add extraction functions to `content.js`**

Replace the placeholder click handler with full data extraction. Add these functions before the click handler:

```javascript
  // --- Data Extraction Functions ---

  function extractTitle() {
    const el = document.querySelector('.x-item-title__mainTitle .ux-textspans')
      || document.querySelector('h1.x-item-title__mainTitle')
      || document.querySelector('h1[itemprop="name"]');
    return el?.textContent?.trim() || '';
  }

  function extractPrice() {
    const el = document.querySelector('.x-price-primary .ux-textspans')
      || document.querySelector('[itemprop="price"]');
    return el?.textContent?.trim() || '';
  }

  function extractCondition() {
    const el = document.querySelector('.x-item-condition-text .ux-textspans')
      || document.querySelector('[data-testid*="condition"] .ux-textspans');
    return el?.textContent?.trim() || '';
  }

  function extractItemSpecifics() {
    const specs = [];
    const rows = document.querySelectorAll('.ux-layout-section-evo__item--table-view .ux-labels-values');
    rows.forEach((row) => {
      const labelEl = row.querySelector('.ux-labels-values__labels .ux-textspans');
      const valueEls = row.querySelectorAll('.ux-labels-values__values .ux-textspans');
      const label = labelEl?.textContent?.trim();
      const values = Array.from(valueEls).map(el => el.textContent.trim()).filter(Boolean);
      const value = values.join(', ');
      if (label && value) {
        specs.push({ label, value });
      }
    });
    return specs;
  }

  function extractShipping() {
    const els = document.querySelectorAll('.ux-labels-values--shipping .ux-labels-values__values .ux-textspans');
    return Array.from(els).map(el => el.textContent.trim()).filter(Boolean).join(' · ') || '';
  }

  function extractReturns() {
    const els = document.querySelectorAll('.ux-labels-values--returns .ux-labels-values__values .ux-textspans');
    return Array.from(els).map(el => el.textContent.trim()).filter(Boolean).join(' ') || '';
  }

  function extractSellerInfo() {
    const nameEl = document.querySelector('.x-sellercard-atf__info__about-seller .ux-textspans')
      || document.querySelector('[data-testid*="seller"] a.ux-textspans');
    const feedbackEls = document.querySelectorAll('.x-sellercard-atf__info__about-seller .ux-textspans--SECONDARY');
    const feedbackTexts = Array.from(feedbackEls).map(el => el.textContent.trim()).filter(Boolean);
    return {
      name: nameEl?.textContent?.trim() || '',
      feedback: feedbackTexts.join(', ')
    };
  }

  function extractSellerReviews() {
    const reviews = [];
    // Try feedback detail cards
    const feedbackCards = document.querySelectorAll('.fdbk-detail-list .card');
    feedbackCards.forEach((card) => {
      const text = card.querySelector('.card__comment .ux-textspans')?.textContent?.trim();
      if (text) reviews.push(text);
    });
    // Try alternate feedback structures
    if (reviews.length === 0) {
      const altCards = document.querySelectorAll('[data-testid*="feedback"] .ux-textspans');
      altCards.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 20 && reviews.length < 10) {
          reviews.push(text);
        }
      });
    }
    return reviews;
  }

  function extractDescription() {
    // Try direct description container first
    const descDiv = document.querySelector('.x-item-description [data-testid="x-item-description-child"]')
      || document.querySelector('#desc_div')
      || document.querySelector('.x-item-description');
    if (descDiv) {
      return descDiv.textContent?.trim() || '';
    }
    // Try iframe (may be cross-origin blocked)
    const iframe = document.querySelector('iframe#desc_ifr, iframe[src*="vi/description"]');
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          return iframeDoc.body?.textContent?.trim() || '';
        }
      } catch (e) {
        // Cross-origin — can't access
        return '[Description is in an iframe and could not be extracted]';
      }
    }
    return '';
  }
```

- [ ] **Step 2: Add prompt formatting function**

```javascript
  function formatPrompt(preamble, data) {
    let output = preamble + '\n\n---\n\n';

    if (data.title) output += `**Product:** ${data.title}\n`;
    output += `**URL:** ${window.location.href}\n`;
    if (data.price) output += `**Price:** ${data.price}\n`;
    if (data.condition) output += `**Condition:** ${data.condition}\n`;

    if (data.specs.length > 0) {
      output += '\n**Item Specifics:**\n';
      data.specs.forEach(s => {
        output += `- ${s.label}: ${s.value}\n`;
      });
    }

    if (data.shipping) output += `\n**Shipping:** ${data.shipping}\n`;
    if (data.returns) output += `**Returns:** ${data.returns}\n`;

    if (data.seller.name) {
      output += `\n**Seller:** ${data.seller.name}`;
      if (data.seller.feedback) output += ` (${data.seller.feedback})`;
      output += '\n';
    }

    if (data.reviews.length > 0) {
      output += '\n**Seller Reviews:**\n';
      data.reviews.forEach(r => {
        output += `- "${r}"\n`;
      });
    }

    if (data.description) {
      output += `\n**Description:**\n${data.description}\n`;
    }

    return output.trim();
  }
```

- [ ] **Step 3: Wire up the click handler**

Replace the placeholder click handler with the real one:

```javascript
  btn.addEventListener('click', async () => {
    try {
      const data = {
        title: extractTitle(),
        price: extractPrice(),
        condition: extractCondition(),
        specs: extractItemSpecifics(),
        shipping: extractShipping(),
        returns: extractReturns(),
        seller: extractSellerInfo(),
        reviews: extractSellerReviews(),
        description: extractDescription()
      };

      // Get preamble from storage
      const storage = await chrome.storage.sync.get({ preamble: 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:' });
      const prompt = formatPrompt(storage.preamble, data);

      // Copy to clipboard
      await navigator.clipboard.writeText(prompt);

      showSuccess();
    } catch (err) {
      console.error('eBay Copy Assistant: Failed to copy', err);
      // Fallback: try document.execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showSuccess();
      } catch (e2) {
        tooltip.textContent = '✗ Copy failed';
        tooltip.classList.add('ebay-copy--visible');
        setTimeout(() => {
          tooltip.textContent = '✓ Copied!';
          tooltip.classList.remove('ebay-copy--visible');
        }, 2000);
      }
    }
  });
```

- [ ] **Step 4: Test on eBay page**

1. Reload the extension in `chrome://extensions/`
2. Navigate to `https://www.ebay.com/itm/256687932761`
3. Click the floating button
4. Paste clipboard content into a text editor
5. Verify: preamble appears at top, followed by ---, then all product fields
6. Verify: Item Specifics are listed as key-value pairs
7. Verify: Seller info includes name and feedback

- [ ] **Step 5: Commit**

```bash
git add content.js
git commit -m "feat: add product data extraction and clipboard copy"
```

---

## Task 5: Options Page

**Files:**
- Create: `options.html`
- Create: `options.css`
- Create: `options.js`

- [ ] **Step 1: Create `options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>eBay Copy Assistant — Settings</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="container">
    <h1>eBay Copy Assistant</h1>
    <p class="subtitle">Settings</p>

    <div class="field">
      <label for="preamble">Prompt Preamble</label>
      <textarea id="preamble" rows="4" placeholder="Enter your preamble text..."></textarea>
      <p class="hint">This text will be added before the product data when copying to clipboard.</p>
    </div>

    <div class="actions">
      <button id="save-btn" class="btn btn-primary">Save</button>
      <button id="reset-btn" class="btn btn-secondary">Reset to Default</button>
    </div>

    <div id="status" class="status" aria-live="polite"></div>
  </div>

  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `options.css`**

Dark-themed, modern minimalist options page:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 16px;
}

.container {
  background: #16213e;
  border-radius: 16px;
  padding: 40px;
  max-width: 560px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

h1 {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 14px;
  color: #8892b0;
  margin-bottom: 32px;
}

.field {
  margin-bottom: 24px;
}

label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #ccd6f6;
  margin-bottom: 8px;
}

textarea {
  width: 100%;
  background: #0f0f23;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  color: #e0e0e0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 16px;
  resize: vertical;
  transition: border-color 0.2s ease;
}

textarea:focus {
  outline: none;
  border-color: #64ffda;
}

.hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
}

.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #64ffda;
  color: #0a0a1a;
}

.btn-primary:hover {
  background: #45e6c0;
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: #8892b0;
  border: 1px solid #2a2a4a;
}

.btn-secondary:hover {
  border-color: #64ffda;
  color: #64ffda;
}

.status {
  font-size: 13px;
  font-weight: 500;
  min-height: 20px;
  transition: opacity 0.3s ease;
}

.status.success {
  color: #64ffda;
}

.status.error {
  color: #ff6b6b;
}
```

- [ ] **Step 3: Create `options.js`**

```javascript
const DEFAULT_PREAMBLE = 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:';

const preambleTextarea = document.getElementById('preamble');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const statusEl = document.getElementById('status');

// Load saved preamble
chrome.storage.sync.get({ preamble: DEFAULT_PREAMBLE }, (result) => {
  preambleTextarea.value = result.preamble;
});

// Save
saveBtn.addEventListener('click', () => {
  const value = preambleTextarea.value.trim();
  if (!value) {
    showStatus('Preamble cannot be empty', 'error');
    return;
  }
  chrome.storage.sync.set({ preamble: value }, () => {
    showStatus('✓ Saved!', 'success');
  });
});

// Reset to default
resetBtn.addEventListener('click', () => {
  preambleTextarea.value = DEFAULT_PREAMBLE;
  chrome.storage.sync.set({ preamble: DEFAULT_PREAMBLE }, () => {
    showStatus('✓ Reset to default!', 'success');
  });
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }, 2500);
}
```

- [ ] **Step 4: Test options page**

1. Reload extension in `chrome://extensions/`
2. Click the extension's "Options" link or go to `chrome-extension://<ID>/options.html`
3. Verify: dark-themed page loads with textarea pre-filled with default preamble
4. Modify the preamble text, click Save — verify "✓ Saved!" appears
5. Click Reset to Default — verify textarea reverts to Ukrainian default
6. Navigate to an eBay item page, click the floating button, paste — verify the new preamble is used

- [ ] **Step 5: Commit**

```bash
git add options.html options.css options.js
git commit -m "feat: add options page for preamble editing"
```

---

## Task 6: Polish & Edge Cases

**Files:**
- Modify: `content.js` — error handling, edge cases, description fallback

- [ ] **Step 1: Add description fallback via fetch**

Add a fallback for when the description iframe is cross-origin. Insert this at the top of `extractDescription()`:

```javascript
  async function extractDescriptionAsync() {
    // Try direct DOM first
    const descDiv = document.querySelector('.x-item-description [data-testid="x-item-description-child"]')
      || document.querySelector('#desc_div')
      || document.querySelector('.x-item-description');
    if (descDiv && descDiv.textContent?.trim()) {
      return descDiv.textContent.trim();
    }
    // Try iframe content
    const iframe = document.querySelector('iframe#desc_ifr, iframe[src*="vi/description"], iframe[src*="ebaydesc"]');
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc?.body) {
          return iframeDoc.body.textContent?.trim() || '';
        }
      } catch (e) {
        // Cross-origin — try fetching iframe src
        if (iframe.src) {
          try {
            const resp = await fetch(iframe.src);
            const html = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return doc.body?.textContent?.trim() || '';
          } catch (fetchErr) {
            return '[Description could not be extracted]';
          }
        }
      }
    }
    return '';
  }
```

- [ ] **Step 2: Update click handler to use async description**

Change the click handler so that `description` uses `extractDescriptionAsync()`:

```javascript
  btn.addEventListener('click', async () => {
    try {
      btn.style.pointerEvents = 'none'; // Prevent double-clicks

      const data = {
        title: extractTitle(),
        price: extractPrice(),
        condition: extractCondition(),
        specs: extractItemSpecifics(),
        shipping: extractShipping(),
        returns: extractReturns(),
        seller: extractSellerInfo(),
        reviews: extractSellerReviews(),
        description: await extractDescriptionAsync()
      };

      const storage = await chrome.storage.sync.get({
        preamble: 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:'
      });
      const prompt = formatPrompt(storage.preamble, data);

      await navigator.clipboard.writeText(prompt);
      showSuccess();
    } catch (err) {
      console.error('eBay Copy Assistant: Failed to copy', err);
      tooltip.textContent = '✗ Error';
      tooltip.classList.add('ebay-copy--visible');
      setTimeout(() => {
        tooltip.textContent = '✓ Copied!';
        tooltip.classList.remove('ebay-copy--visible');
      }, 2000);
    } finally {
      btn.style.pointerEvents = 'auto';
    }
  });
```

- [ ] **Step 3: Test edge cases**

1. Test on a Buy It Now listing — verify price extraction
2. Test on an auction listing — verify current bid / starting price is captured
3. Test on a listing with no Item Specifics — verify section is omitted
4. Test on eBay.co.uk or eBay.de — verify the extension loads on regional domains
5. Test clipboard paste after copying — verify clean Markdown output

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: add async description extraction and edge case handling"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full end-to-end test**

1. Load the extension fresh in Chrome
2. Navigate to `https://www.ebay.com/itm/256687932761`
3. Click the floating button (📋)
4. Open ChatGPT/Claude/any chatbot
5. Paste the clipboard content
6. Verify: the preamble text appears, followed by all product data in clean Markdown

- [ ] **Step 2: Test options persistence**

1. Open options page, change preamble to "Analyze this eBay listing for me:"
2. Save
3. Go to eBay item page, click copy button
4. Paste — verify new preamble is used
5. Close and reopen Chrome
6. Repeat — verify preamble persists

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final polish and verification complete"
```
