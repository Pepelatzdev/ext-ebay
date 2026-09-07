# eBay → Gemini photo attachments design

**Date:** 2026-09-07

## Goal

Extend eBay Copy Assistant so a user can choose photos from the current listing's main gallery and place those photos, as separate Gemini attachments, alongside the generated text prompt. The user must still press Gemini's send button manually.

The change also hardens the existing request flow: every stage is visible, transient failures are retried in a bounded and idempotent way, text and attachment state are tracked independently, and old reports remain intact until a replacement report is saved successfully.

## Verified browser baseline

The supplied listing `https://www.ebay.com/itm/198610683740` was opened in a real signed-in Chrome session.

- eBay exposed four main-gallery photos in the dedicated image gallery region.
- The existing extension opened the configured Gem and inserted the full text prompt.
- The prompt was not sent automatically.
- A photo copied from the eBay gallery was pasted into the same Gemini editor. Gemini showed an attachment image, then the status `Зображення додано`.

This confirms that Gemini accepts a real image attachment next to the prompt through the browser's paste path. It does not yet confirm that the extension's generated File/DataTransfer event is accepted; that remains an implementation acceptance test.

## Scope and boundaries

In scope:

- main-gallery photo discovery, lazy-loaded image discovery, URL normalization based only on attributes/data confirmed by the page, ordering, and deduplication;
- a compact eBay photo-selection UI with thumbnail previews;
- bounded HTTPS downloads in the service worker;
- JSON-safe runtime transfer of bounded binary chunks;
- Gemini attachment insertion and post-insertion verification;
- per-request attachment state, retries, cleanup, and user-facing progress;
- regression tests, package inclusion, README, and privacy-policy updates.

Out of scope:

- automatic Gemini submission;
- seller-description, recommendation, advertisement, review, avatar, or other non-gallery images;
- a backend, private Gemini API, or direct Gemini API upload;
- persistent storage of image bytes;
- release publication or version changes.

## Approach

Use the approved eBay-side selection flow:

1. `gallery-extractor.js` discovers only image candidates rooted in the listing's primary gallery container. It records stable source identity, the largest URL actually present in the page data, thumbnail URL, order, and a normalized source host.
2. `photo-picker.js` renders a modal/panel on the eBay page. The first ten unique candidates are selected initially. The user may deselect any item and continue with zero photos. If more than ten candidates exist, the UI states the limit and shows the total discovered count.
3. `ui.js` collects the text data and selected photo metadata into one request. It displays preparation and opening status, and only marks the request ready after text and photo preparation have separate successful states.
4. `background.js` validates the originating eBay tab, item ID, exact selected-photo list, and allowed image host. It downloads the selected images with a timeout, byte limit, MIME check, redirect revalidation, and limited concurrency.
5. The service worker stores only request metadata and bounded in-memory attachment bytes for the active operation. It never stores image bytes in `storage.sync` or `storage.session`.
6. `gemini-content.js` claims the request for its exact Gemini tab, inserts text only into an empty editor, then adds each attachment through a dedicated adapter. It verifies both the text and the visible/DOM attachment result before acknowledging each stage.
7. Gemini's send control remains untouched. The user sees the final prompt and ready attachments and submits manually.

The fallback is explicit: if automated attachment insertion is rejected by the live Gemini page, the UI preserves the text prompt, identifies failed photos, and offers retry of failed photos or manual attachment. That fallback is not reported as automated success.

## Gallery extraction

`gallery-extractor.js` will expose a pure function such as `collectGalleryPhotos(document, location)` returning ordered candidates and diagnostic omissions.

Candidate rules:

- start from the eBay primary image-gallery region, using stable gallery semantics and existing selector configuration;
- accept only image elements, source elements, or page data belonging to that region;
- prefer the largest URL explicitly supplied by the element/page data among known size variants;
- never synthesize an original URL by changing a filename or query string;
- support lazy-loaded attributes (`src`, `srcset`, `data-*`) and wait/re-scan after gallery mutations;
- deduplicate by normalized confirmed source URL while keeping first-seen gallery order;
- reject URLs that are not HTTPS, are not on the exact allowed image host, or are outside the gallery root;
- ignore seller-description iframe images, recommendations, sponsored cards, feedback photos, product-review images, payment icons, and avatars.

The extractor returns a stable `photoId` derived from the normalized confirmed source URL. The request carries the item ID and a selected photo manifest; background rejects a manifest whose photo IDs or source URLs do not match the current eBay page's validated request context.

## Photo picker and status UI

The existing floating action remains the entry point. After extraction, show a modal with:

- product title and count of discovered unique gallery photos;
- thumbnails in gallery order;
- selected state and accessible labels containing position and item ID context;
- initial selection of at most ten photos;
- an explicit `Вибрано N із M` summary;
- a clear warning when more than ten photos were found;
- `Продовжити` and `Скасувати` controls;
- a text-only continuation when no gallery photo is available.

During the request, show a stage log or status region with these states:

- `Підготовка даних`;
- `Вставлення тексту`;
- `Додавання фото`;
- `Додано N із M фото`;
- per-photo failure names/positions;
- `Готово до надсилання`;
- `Збережено посилання` or a concrete error.

If the editor contains non-whitespace text before insertion, do not overwrite it. Show a message that the Gemini editor is not empty and offer retry after the user clears it. Retrying text is idempotent because the request remains pending until complete verification succeeds.

## Request schema and lifecycle

Keep request state per Gemini tab, with a generated request ID and item ID. Extend the current states to distinguish:

- `pending_text` — request created, text not yet verified;
- `text_inserted` — text verified, attachment work pending;
- `attaching` — one attachment operation is active;
- `ready_for_chat` — text and all selected attachments verified;
- `waiting_for_chat` — user has the prepared request and may send in Gemini;
- `failed_partial` — one or more attachments failed, with retryable failed IDs;
- `expired`/`removed` — no longer usable.

The prompt is retained for five minutes until confirmed text insertion. After text insertion is acknowledged, prompt text is removed from session state and only the minimum metadata required for attachment/chat tracking remains. The post-preparation chat wait lasts 30 minutes. The request is removed after tab close, successful report save, or expiry. Attachment bytes are released immediately after each attachment is verified or permanently failed.

Retries are limited and keyed by `(requestId, photoId, attempt)`. A retry never re-inserts text and never re-adds an attachment already verified. A repeated message from the same tab is answered from the stored state rather than starting a second download.

## Binary transfer and Gemini adapter

Chrome extension message passing currently uses JSON serialization by default, so `File`, `Blob`, and raw `ArrayBuffer` are not treated as a portable message contract. The implementation will use JSON-safe metadata plus bounded base64 chunks only in active runtime messages; no binary payload is written to Chrome storage. The chunk size and aggregate limits will be explicit and covered by tests. The official Chrome guidance documents the default JSON serialization and the 64 MiB message limit: <https://developer.chrome.com/docs/extensions/develop/concepts/messaging>.

The Gemini attachment adapter will:

1. locate the current usable editor and reject non-empty text before any mutation;
2. insert and fully verify the prompt;
3. reconstruct each downloaded image as a `File` in the Gemini content-script context;
4. attempt a paste event with a `DataTransfer` containing exactly one file;
5. observe the Gemini attachment UI and wait for a completed, non-error attachment state;
6. fall back to a file-input path only if the live DOM exposes a usable input and the browser accepts the operation;
7. report failure unless Gemini visibly/structurally confirms the attachment.

The adapter never dispatches Gemini's send action.

## Secure download rules

The background downloader will use an exact HTTPS image-host allowlist confirmed from the supplied eBay page and regression fixtures. It will:

- validate the initial URL and every redirect target against the same exact host rules;
- use `credentials: omit`;
- enforce an abort timeout;
- reject non-image MIME types and missing/ambiguous types according to the chosen compatibility rule;
- enforce per-file and per-request byte caps while reading the body, independent of `Content-Length`;
- limit concurrent downloads;
- return structured per-photo errors without failing unrelated successful photos;
- never follow arbitrary URLs supplied by Gemini or storage.

Only the confirmed image host permission will be added to `manifest.json`; broad eBay or wildcard permissions will not be added merely to make downloads convenient.

## Message validation

All new messages use exact-key schema validation and sender checks. They include the request ID, Gemini tab ID as verified by the sender, item ID, and photo ID/attempt where applicable. A Gemini tab cannot claim another tab's request, and an eBay page cannot start a request for a different item ID. Attachment progress and retry responses are accepted only for the request that created them.

Every background response is checked by the caller. Save-report failures do not remove the active request or overwrite the previous report. The previous report is changed only after the new report URL has been validated and successfully persisted.

## Testing strategy

Add focused unit tests for:

- gallery-root scoping, lazy attributes, largest confirmed URL selection, order, and duplicate collapse;
- rejection of seller/recommendation/review/avatar images and unsafe/non-HTTPS/redirect URLs;
- zero-photo text-only flow, ten-photo default selection, more-than-ten warning, and byte-limit rejection;
- partial download failure and retry of only failed photos;
- retry idempotency and no duplicate text/attachments;
- non-empty editor protection and complete text verification;
- two eBay/Gemini tab pairs staying isolated;
- five-minute prompt TTL, thirty-minute post-preparation TTL, tab-close cleanup, and successful-save cleanup;
- preserving the old report when a new save fails;
- packaging of all new runtime modules.

Real Chrome checks after implementation:

1. one selected photo is accepted by Gemini as a completed attachment;
2. multiple selected photos appear as separate completed attachments in order;
3. text and attachments coexist before manual send;
4. two products opened concurrently do not mix prompts or photos;
5. Gemini reload, Ask again, empty editor, non-empty editor, partial failure, and retry flows;
6. no automatic send occurs.

The required automated commands remain `npm run check`, `npm test`, `npm run verify:version`, `npm run pack`, and `npm run verify:package`.

## Documentation and privacy

README and Privacy Policy will state that selected listing photos are downloaded by the extension service worker only for the user's current request, passed to the user's chosen Gemini page, never sent to a developer backend, never stored in Sync, and discarded after preparation/failure/expiry according to the request lifecycle. They will also state that Gemini submission remains manual and that automated photo attachment depends on the live Gemini editor.

## Acceptance criteria

The feature is not considered complete unless a real signed-in Gemini session accepts at least one selected eBay gallery photo as a finished attachment next to the inserted prompt. Passing jsdom tests or seeing a synthetic event dispatched is insufficient.
