# Floating Gemini Actions Design

**Date:** 2026-07-24

## Goal

Replace the eBay-DOM-dependent inline controls with an always-available floating control in the bottom-right corner of every supported eBay item page.

## User experience

The extension renders exactly one floating action container appended directly to `document.body`. It does not search for or attach to eBay's `Add to Watchlist` area.

The container has two states:

1. **No saved report**
   - Show one primary **Ask Gemini** button.
   - Clicking it collects the current listing data, copies the generated prompt to the clipboard, stores the pending prompt, and opens the configured Gemini Gem.

2. **Saved report available**
   - Show a primary **Show report** action that opens the saved Gemini chat in a new tab.
   - Show a compact **Ask again** action.
   - Clicking **Ask again** removes the saved report for the current item, updates the FIFO history, collects fresh listing data, and immediately starts the same Gemini flow as **Ask Gemini**.

The floating container remains visible in the bottom-right corner on desktop and narrow viewports, with responsive spacing and a `z-index` high enough to stay above the eBay page UI.

## Components and responsibilities

### `content.js`

- Continue extracting the eBay item ID from the URL.
- Continue listening for changes to the current item's synchronized chat URL.
- Re-render the floating UI when Gemini saves or removes that URL.

### `ui.js`

- Remove all lookup and insertion logic related to eBay's watch-list controls.
- Append the action container directly to `document.body`.
- Render the correct state from `chrome.storage.sync`.
- Reuse one request workflow for both **Ask Gemini** and **Ask again**.
- Keep report URL validation restricted to HTTPS URLs on `gemini.google.com`.
- Remove the current item's chat URL and FIFO entry before a repeated request.

### `content.css`

- Style the container as fixed in the bottom-right corner.
- Style labeled pill-shaped actions rather than the existing icon-only fallback.
- Preserve clear hover, focus, success, and error states.
- Add narrow-viewport offsets so the controls remain usable without consuming excessive space.
- Incorporate the current uncommitted CSS work instead of overwriting it blindly.

## Data flow

### First request

1. The eBay content script renders **Ask Gemini**.
2. The user clicks the button.
3. Listing data is extracted and formatted.
4. The prompt is copied to the clipboard and stored temporarily in `chrome.storage.local` with the item ID and timestamp.
5. The background worker validates the configured URL and opens Gemini.
6. The Gemini content script pastes the prompt and stores the resulting chat URL in `chrome.storage.sync`.
7. The eBay tab receives the storage change and renders **Show report** plus **Ask again**.

### Repeated request

1. The user clicks **Ask again**.
2. The extension removes `chat_<itemId>` and the matching FIFO entry.
3. The extension immediately collects current listing data and starts the first-request flow.
4. A successful new Gemini chat replaces the removed report URL.

## Error handling

- Invalid or non-Gemini saved URLs are never rendered as report links; the UI falls back to **Ask Gemini**.
- Extraction, clipboard, storage, messaging, or tab-opening failures display a temporary error state on the initiating button and restore interactivity afterward.
- A failed repeated request leaves the old report removed, because the user's explicit intent was to replace it with a fresh report.
- Extension-context invalidation removes the injected container and logs the existing reload-required message.

## Verification

- Confirm the floating container is rendered without any watch-list DOM elements.
- Confirm the no-report state shows **Ask Gemini**.
- Confirm a valid saved chat shows **Show report** and **Ask again**.
- Confirm **Show report** opens only a validated Gemini URL.
- Confirm **Ask again** clears the current report and starts a fresh request.
- Confirm a synchronized storage change re-renders the state.
- Run the existing Vitest suite and Biome checks.
- Review the final diff to ensure unrelated local changes are preserved.

## Out of scope

- Changes to extraction selectors or prompt contents.
- Changes to Gemini chat detection or history capacity.
- Restoring or retaining an inline eBay-integrated control.
- README updates, which remain a separate follow-up task.
