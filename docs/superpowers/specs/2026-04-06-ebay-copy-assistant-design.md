# eBay Copy Assistant — Chrome Extension Design Spec

A Chrome Extension (Manifest V3) that enables one-click copying of eBay product page content into a prompt-ready format for chatbot consultation.

## Problem

When evaluating eBay listings, users often want to consult with AI chatbots (ChatGPT, Claude, Gemini). Manually copying product details — title, price, specs, seller info, reviews — is tedious and error-prone. This extension automates the extraction and formatting of all relevant product data into a ready-to-paste prompt.

## Architecture

```
ext-ebay/
├── manifest.json         — Manifest V3 configuration
├── content.js            — Injected into eBay product pages, extracts data
├── content.css           — Styles for floating button and notification
├── background.js         — Service worker (minimal, handles extension events)
├── options.html          — Settings page for preamble editing
├── options.js            — Options page logic
├── options.css           — Options page styles
└── icons/                — Extension icons (16, 48, 128px)
```

### How It Works

1. **Content script** is automatically injected on pages matching `*://*.ebay.com/itm/*` and `*://*.ebay.*/itm/*`
2. Creates a **floating button** in the bottom-right corner of the page
3. On click: extracts all product data from the DOM, retrieves the preamble from `chrome.storage.sync`, formats the prompt, and copies it to the clipboard
4. Shows a **"✓ Copied!"** animation for ~2 seconds
5. **Options page** provides a textarea for editing the preamble with Save and Reset buttons

## Data Extraction

The content script extracts the following data from the eBay product page:

| Data Field | Source |
|---|---|
| Product Title | `h1` title element in the main product section |
| Price | Price container (e.g., `US $177.44`) |
| Condition | Condition label (e.g., "Good - Refurbished") |
| Item Specifics | Key-value table (Brand, Model, Processor, RAM, etc.) |
| Shipping | Cost and estimated delivery dates |
| Returns | Return policy details |
| Seller Name | Seller info section |
| Seller Rating | Feedback score and positive percentage |
| Seller Reviews | Visible feedback/reviews on the page |
| Product Description | Seller's detailed description section |
| Page URL | `window.location.href` |

If a section is not present on the page, it is omitted from the output.

## Output Format

```
[Editable Preamble]

---

**Product:** [Title]
**URL:** [URL]
**Price:** [Price]
**Condition:** [Condition]

**Item Specifics:**
- [Key]: [Value]
- [Key]: [Value]
- ...

**Shipping:** [Details]
**Returns:** [Details]

**Seller:** [Name] ([Feedback Count] reviews, [Positive %] positive)

**Seller Reviews:**
- "[Review text 1]"
- "[Review text 2]"
- ...

**Description:**
[Seller description text]
```

### Default Preamble (Ukrainian)

```
Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:
```

The preamble is stored in `chrome.storage.sync` and editable via the options page.

## UI Design

### Floating Button (on eBay pages)

- **Position**: fixed, bottom-right corner (`bottom: 20px; right: 20px`)
- **Size**: circular, ~48px diameter
- **Icon**: clipboard/copy icon (📋)
- **Style**: semi-transparent dark background with subtle backdrop blur, high z-index to stay above eBay elements
- **Hover state**: slight scale-up (1.1), glow/highlight effect
- **Click feedback**: icon changes to ✓, background turns green for 2 seconds, then reverts
- **Implementation**: injected via content script as a shadow DOM element to avoid eBay CSS conflicts

### Options Page

Minimalist dark-themed settings page:

- **Header**: "eBay Copy Assistant — Settings"
- **Textarea**: ~4 rows, for editing the preamble text
- **Hint text**: "This text will be added before the product data when copying"
- **Buttons**:
  - `Save` — stores preamble to `chrome.storage.sync`
  - `Reset to Default` — restores the default preamble
- **Feedback**: "✓ Saved!" message after successful save

## Permissions (Minimal)

```json
{
  "permissions": ["activeTab", "storage", "clipboardWrite"],
  "content_scripts": [{
    "matches": ["*://*.ebay.com/itm/*", "*://*.ebay.*/itm/*"],
    "js": ["content.js"],
    "css": ["content.css"]
  }]
}
```

## Storage Schema

```json
{
  "preamble": "string — the user's custom preamble text"
}
```

Using `chrome.storage.sync` so the preamble setting syncs across Chrome instances.

## Edge Cases

- **Description in iframe**: eBay sometimes renders seller descriptions in an iframe. The content script will attempt to read the iframe content; if blocked by same-origin policy, the description section will note "Description not accessible" or extract whatever text is available outside the iframe.
- **Multiple price formats**: Handle auction vs. Buy It Now vs. Best Offer price displays.
- **Missing sections**: If any data field is not found on the page, that section is silently omitted from the output.
- **Non-English eBay sites**: The extension targets DOM structure, not text content, so it should work across eBay regional sites (ebay.de, ebay.co.uk, etc.).
- **Page load timing**: Use `MutationObserver` or `DOMContentLoaded` to ensure the page is fully loaded before enabling the button.
