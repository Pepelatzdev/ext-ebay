# eBay Gemini Photo Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable, user-selected eBay gallery photo attachments to the existing text-prompt Gemini flow without automatic submission or persistent image storage.

**Architecture:** Keep the existing Manifest V3 boundaries. Add a pure gallery extractor and eBay picker, a bounded service-worker downloader using JSON-safe base64 chunks, a Gemini attachment adapter, and explicit per-tab request states. Keep report history and text-only operation backward compatible.

**Tech Stack:** Manifest V3, vanilla JavaScript, Chrome Storage/Alarms/Messaging APIs, jsdom, Vitest, Biome, real Chrome smoke tests.

---

## File map

- Create `gallery-extractor.js`: pure primary-gallery discovery, URL candidate selection, ordering, deduplication, and diagnostics.
- Create `photo-picker.js`: eBay modal/panel, thumbnail selection, limits, accessible status, and cancel/continue events.
- Create `photo-transfer.js`: bounded image fetching, redirect validation, MIME/byte checks, limited concurrency, and base64 chunking helpers.
- Create `gemini-attachments.js`: Gemini-side File/DataTransfer paste adapter, attachment completion detection, retry-safe attachment identity, and progress results.
- Modify `config.js`: photo limits, timeouts, attachment states, new message names, and exact image-host configuration.
- Modify `manifest.json`: add only the confirmed gallery-image host permission and new content-script/service-worker files as needed.
- Modify `extractors.js`: return missing-field diagnostics and keep listing-type detection unknown when evidence is insufficient.
- Modify `ui.js`: picker entry point, stage status, response validation, retries, and text-only continuation.
- Modify `background.js`: request preparation, secure downloads, attachment chunk protocol, stage responses, cleanup, and save-report error handling.
- Modify `message-validation.js`: exact schemas for photo metadata, request IDs, sender tabs, and attachment operations.
- Modify `request-store.js`: separate five-minute prompt TTL from thirty-minute prepared-request TTL and preserve attachment metadata only.
- Modify `gemini-editor.js`: reject non-empty editors and retain full-content verification.
- Modify `gemini-content.js`: claim/insert/attach state machine, reload-safe retry behavior, and visible progress reporting.
- Modify `scripts/pack.js` and `scripts/verify-package.js`: include and validate all new runtime files.
- Modify `README.md` and `privacy.html`: document photo transfer, temporary retention, permissions, manual submission, and limitations.
- Add/modify tests under `tests/` for each task below.

## Task 1: Establish photo limits and exact runtime contracts

**Files:**
- Modify: `config.js`, `manifest.json`, `message-validation.js`
- Test: `tests/message-validation.test.js`, `tests/compliance.test.js`

- [ ] **Step 1: Add failing schema tests** for `START_GEMINI_REQUEST` with `requestId`, `photos`, and `photoLimit`, plus tests rejecting an unknown photo host, non-HTTPS URL, duplicate photo ID, item mismatch, oversized manifest, and wrong sender tab.

- [ ] **Step 2: Run the focused validation tests**

Run: `npm test -- tests/message-validation.test.js tests/compliance.test.js`

Expected: FAIL because the new message fields and image-host checks do not exist.

- [ ] **Step 3: Add explicit constants**

Add constants with these contracts:

```js
PHOTO_LIMIT = 10;
MAX_PHOTO_BYTES = 8 * 1024 * 1024;
MAX_PHOTO_REQUEST_BYTES = 32 * 1024 * 1024;
PHOTO_FETCH_TIMEOUT_MS = 15_000;
PHOTO_FETCH_CONCURRENCY = 2;
PHOTO_CHUNK_BYTES = 256 * 1024;
PREPARED_REQUEST_TTL_MS = 30 * 60 * 1000;
```

Define messages for `PREPARE_PHOTOS`, `GET_PHOTO_CHUNK`, `PHOTO_PROGRESS`, `RETRY_PHOTOS`, and `PHOTO_READY`, while retaining all existing message names.

- [ ] **Step 4: Validate exact image origins**

Record the actual host observed in the live eBay gallery as the only image host in `ECA.PHOTO_HOSTS`. `isAllowedPhotoUrl()` must require `https:`, an exact hostname match, and no credentials. Add tests for the confirmed host and for sibling/subdomain/HTTP rejection.

- [ ] **Step 5: Run focused tests and static checks**

Run: `npm test -- tests/message-validation.test.js tests/compliance.test.js && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add config.js manifest.json message-validation.js tests/message-validation.test.js tests/compliance.test.js && git commit -m "feat: define photo request contracts"`

## Task 2: Implement and test main-gallery extraction

**Files:**
- Create: `gallery-extractor.js`
- Modify: `config.js`
- Test: `tests/gallery-extractor.test.js`

- [ ] **Step 1: Write fixture-driven failing tests** covering four gallery images, `srcset`/lazy attributes, largest confirmed URL selection, duplicate size variants, order preservation, no-photo pages, more-than-ten photos, seller-description images, recommendations, sponsored images, review photos, avatars, HTTP URLs, foreign hosts, and synthesized-original rejection.

- [ ] **Step 2: Run the new test file**

Run: `npm test -- tests/gallery-extractor.test.js`

Expected: FAIL because `gallery-extractor.js` does not exist.

- [ ] **Step 3: Implement pure extraction**

Export a global `ECAGalleryExtractor` with:

```js
collectGalleryPhotos(document, pageUrl) -> {
  photos: [{ photoId, sourceUrl, thumbnailUrl, order }],
  omitted: [{ reason, url }],
  totalDiscovered: number
}
```

Resolve candidates only beneath the configured primary gallery root. Parse only URLs explicitly present in `src`, `srcset`, `data-src`, `data-srcset`, and known page-data attributes. Normalize fragments, keep query strings unless the page confirms an alternate, deduplicate by normalized source URL, and never replace size tokens with guessed originals.

- [ ] **Step 4: Add lazy-gallery rescanning helper** that merges newly observed gallery candidates without reordering existing ones or admitting images from outside the root.

- [ ] **Step 5: Run tests and format**

Run: `npm test -- tests/gallery-extractor.test.js && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add gallery-extractor.js config.js tests/gallery-extractor.test.js && git commit -m "feat: extract ordered eBay gallery photos"`

## Task 3: Add the eBay photo picker and status UI

**Files:**
- Create: `photo-picker.js`
- Modify: `content.css`, `ui.js`, `manifest.json`
- Test: `tests/photo-picker.test.js`, `tests/ui.test.js`

- [ ] **Step 1: Add failing UI tests** for initial selection of the first ten, deselecting any item, explicit over-limit text, zero-photo continuation, cancel, disabled busy state, accessible labels, and no gallery-photo text-only continuation.

- [ ] **Step 2: Implement picker API**

Expose:

```js
ECAPhotoPicker.open({ title, photos, limit }) -> Promise<{
  confirmed: boolean,
  selectedPhotoIds: string[]
}>
```

Render only with safe DOM methods and `textContent`; never use `innerHTML`. Keep the selected IDs in DOM state, update the count after every toggle, and make keyboard focus return to the Ask button after close.

- [ ] **Step 3: Integrate picker into `requestGemini()`**

Extract text data, collect gallery photos, open the picker, and continue with an empty photo list when the user confirms none. Do not create a background request on cancel.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/photo-picker.test.js tests/ui.test.js && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add photo-picker.js content.css ui.js manifest.json tests/photo-picker.test.js tests/ui.test.js && git commit -m "feat: let users choose eBay gallery photos"`

## Task 4: Build the bounded photo downloader and chunk protocol

**Files:**
- Create: `photo-transfer.js`
- Modify: `background.js`, `message-validation.js`, `manifest.json`
- Test: `tests/photo-transfer.test.js`, `tests/background.test.js`

- [ ] **Step 1: Add failing downloader tests** for successful image fetch, timeout, redirect to an unapproved host, wrong MIME, per-file cap, aggregate cap, short-body accounting, limited concurrency, and one failed photo among successful photos.

- [ ] **Step 2: Implement download contracts**

Expose:

```js
ECAPhotoTransfer.downloadSelected(photos, options) -> {
  succeeded: [{ photoId, mimeType, size, bytes }],
  failed: [{ photoId, code, message }],
  totalBytes
}
```

Use `AbortController`, `credentials: "omit"`, manual body reads, actual-byte counting, and a worker pool capped at `PHOTO_FETCH_CONCURRENCY`. Revalidate every redirect URL before accepting the response.

- [ ] **Step 3: Implement JSON-safe chunking**

Convert bytes only for active messages. `encodeChunk(bytes)` returns a base64 string no larger than `PHOTO_CHUNK_BYTES` decoded bytes; `decodeChunk()` reconstructs a `Uint8Array`. Keep the attachment map in service-worker memory keyed by `requestId/photoId`, and delete entries after ACK or terminal failure.

- [ ] **Step 4: Add background handlers** for `PREPARE_PHOTOS`, `GET_PHOTO_CHUNK`, and `PHOTO_READY`, each requiring exact request/item/tab identity.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/photo-transfer.test.js tests/background.test.js && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add photo-transfer.js background.js message-validation.js manifest.json tests/photo-transfer.test.js tests/background.test.js && git commit -m "feat: download selected photos safely"`

## Task 5: Separate request lifetimes and preserve isolation

**Files:**
- Modify: `request-store.js`, `config.js`, `background.js`
- Test: `tests/request-store.test.js`, `tests/background.test.js`

- [ ] **Step 1: Add failing lifecycle tests** for five-minute pending text, thirty-minute prepared request, expiry during delayed alarm, tab-close cleanup, successful report cleanup, two simultaneous item/tab pairs, and removal of in-memory photo bytes.

- [ ] **Step 2: Implement explicit request shape**

Use:

```js
{
  requestId, itemId, targetUrl, createdAt, preparedAt,
  state, selectedPhotos, completedPhotoIds, failedPhotoIds
}
```

Keep prompt text only while `state === "pending_text"`. `get(tabId)` must enforce the correct TTL for the state, remove expired state, clear alarms, and never return another tab's request.

- [ ] **Step 3: Update alarms and tab removal**

Create alarms with a request ID, remove only the matching tab/request, and make repeated cleanup idempotent.

- [ ] **Step 4: Run lifecycle tests**

Run: `npm test -- tests/request-store.test.js tests/background.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add request-store.js config.js background.js tests/request-store.test.js tests/background.test.js && git commit -m "fix: separate prompt and prepared request lifetimes"`

## Task 6: Implement Gemini attachment insertion and non-empty protection

**Files:**
- Create: `gemini-attachments.js`
- Modify: `gemini-editor.js`, `gemini-content.js`, `manifest.json`
- Test: `tests/gemini-attachments.test.js`, `tests/gemini-editor.test.js`, `tests/gemini-content.test.js`

- [ ] **Step 1: Add failing editor tests** for whitespace-only editor acceptance, non-empty editor rejection without mutation, complete prompt verification, CRLF/NBSP normalization, and prefix-only failure.

- [ ] **Step 2: Implement attachment adapter API**

Expose:

```js
ECAGeminiAttachments.attachFile(editor, file, identity, options) -> {
  ok, status, error
}
```

Create one `File` per photo from reconstructed bytes, dispatch a paste event with a one-file `DataTransfer`, observe the attachment chip/status, and return success only after Gemini reports a completed attachment. Do not treat a dispatched event, a changed input, or a thumbnail placeholder alone as success.

- [ ] **Step 3: Implement chunk retrieval in Gemini content**

Request chunks by exact `requestId/photoId`, reconstruct the file, call the adapter once per unverified photo, and ACK only after completion. Repeated progress messages must not add a verified photo again.

- [ ] **Step 4: Add file-input fallback only when available**

Use a real page-exposed file input if present; otherwise return a structured manual-fallback error. Never claim success from a synthetic input event without a confirmed Gemini attachment.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/gemini-attachments.test.js tests/gemini-editor.test.js tests/gemini-content.test.js && npm run check`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add gemini-attachments.js gemini-editor.js gemini-content.js manifest.json tests/gemini-attachments.test.js tests/gemini-editor.test.js tests/gemini-content.test.js && git commit -m "feat: attach selected photos in Gemini"`

## Task 7: Integrate stages, retries, report persistence, and Ask again

**Files:**
- Modify: `ui.js`, `background.js`, `gemini-content.js`, `report-store.js`
- Test: `tests/ui.test.js`, `tests/background.test.js`, `tests/gemini-content.test.js`, `tests/report-store.test.js`

- [ ] **Step 1: Add failing orchestration tests** for stage-by-stage status, rejected non-empty editor, text-only request, all-success photos, partial failure, retry-only-failed photos, no duplicate attachment on retry, invalid background response, save-report failure retaining the old report, and Ask again using fresh page data.

- [ ] **Step 2: Implement response guards**

Every caller must require `response?.success === true`, matching `requestId`, matching item ID, and a valid state transition before updating UI. Use bounded retry counts with exponential delays capped below the request TTL.

- [ ] **Step 3: Implement partial-failure continuation**

Move successful photos to `completedPhotoIds`, preserve failed IDs, display concrete photo positions, and offer `Повторити невдалі` and `Продовжити без них`. The latter reaches `ready_for_chat` only with the user’s explicit choice.

- [ ] **Step 4: Preserve report history**

Save the new report first through `ECAReportStore.save()`. Remove the request only after the save resolves. If saving fails, retain the previous report and show the failure.

- [ ] **Step 5: Run orchestration tests**

Run: `npm test -- tests/ui.test.js tests/background.test.js tests/gemini-content.test.js tests/report-store.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add ui.js background.js gemini-content.js report-store.js tests/ui.test.js tests/background.test.js tests/gemini-content.test.js tests/report-store.test.js && git commit -m "fix: make Gemini photo flow observable and retryable"`

## Task 8: Package and document the new data flow

**Files:**
- Modify: `scripts/pack.js`, `scripts/verify-package.js`, `README.md`, `privacy.html`
- Test: `tests/release-scripts.test.js`, `tests/compliance.test.js`

- [ ] **Step 1: Add failing package tests** requiring every new runtime file in `PRODUCTION_FILES`, manifest content-script order, and absence of tests/docs from the ZIP.

- [ ] **Step 2: Update packaging**

Add `gallery-extractor.js`, `photo-picker.js`, `photo-transfer.js`, and `gemini-attachments.js` to the production file list and required-file checks.

- [ ] **Step 3: Update documentation**

Document the main-gallery-only scope, selection limit, temporary background transfer, exact image permission, no Sync/session image storage, manual Gemini send, partial-failure behavior, and the real-Gemini acceptance requirement. Update the privacy policy date and external recipient description to include selected photos.

- [ ] **Step 4: Run docs/package tests**

Run: `npm test -- tests/release-scripts.test.js tests/compliance.test.js && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add scripts/pack.js scripts/verify-package.js README.md privacy.html tests/release-scripts.test.js tests/compliance.test.js && git commit -m "docs: document and package photo attachments"`

## Task 9: Full automated verification and real Chrome acceptance

**Files:**
- Modify: any files needed for test fixes only
- Test: all test files

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npm run check
npm test
npm run verify:version
npm run pack
npm run verify:package
```

Expected: all commands succeed and `extension.zip` contains the new runtime modules.

- [ ] **Step 2: Run the real Chrome one-photo check**

On the supplied eBay listing, select one main-gallery photo, open the configured Gem, verify the text and one completed attachment coexist, and verify the send button remains untouched.

- [ ] **Step 3: Run the real Chrome multi-photo check**

Select at least two photos, verify separate completed attachments appear in gallery order, then deselect one and confirm only the selected set is transferred.

- [ ] **Step 4: Run isolation and recovery checks**

Open two listing tabs, start both requests, reload Gemini once, exercise Ask again, test a non-empty editor, and verify no prompt/photo mixing, duplicate attachment, or automatic send.

- [ ] **Step 5: Record limitations**

If a real attachment path fails, record the exact Gemini UI state and preserve manual attachment as a clearly labeled fallback. Do not mark the feature complete or claim browser success from unit tests alone.

- [ ] **Step 6: Final status review**

Run `git status --short`, confirm only intended source/tests/docs/package changes remain, and report automated and browser results separately.
