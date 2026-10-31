# Clean Architecture Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in the approved session.

**Goal:** Separate rules, workflows and browser adapters while preserving the current extension behavior.

**Architecture:** Classic script modules expose one API or factory each. Entry points inject concrete dependencies; domain and application modules do not access browser globals. Manifest V3 still runs directly from the repository without a build step.

**Tech Stack:** JavaScript, Chrome Manifest V3, Vitest, jsdom, Biome, existing ZIP packaging.

---

### Task 1: Baseline and loading helpers
- [x] Run `npm test` and `npm run check`; expected: current 153 regression tests and lint pass.
- [x] Add `tests/helpers/scripts.js` to read ordered script sources from manifest and worker imports. Keep test-only aliases out of production code.
- [x] Create branch `codex/clean-architecture`, preserving the existing dirty working tree.

### Task 2: Domain and request persistence
- [x] Extract `src/domain/policy.js`, `prompt.js`, `request.js`, and `report-policy.js` from config, extractors, request-store and report-store.
- [x] Make prompt formatting accept `(preamble, data, pageUrl)` and inject limits through a factory. Test normalization, truncation and the supplied URL independently of the DOM.
- [x] Give the request model `create`, `inserted`, `expired`, `deadline`, `photoReady`, `retryResult` operations with explicit time/policy inputs; retain existing photo/no-photo record shapes.
- [x] Add `src/infrastructure/request-repository.js` with only `read`, `write`, `remove`. Add `src/application/requests.js` to apply domain rules, schedule alarms and notify cache cleanup.
- [x] Keep report quota and ordering logic pure; inject sync storage into `src/infrastructure/report-store.js`.
- [x] Run request/report tests and domain tests; require preserved TTL, prompt deletion and quota behavior.

### Task 3: Background workflows
- [x] Extract network description fetching, attachment cache, and message routing into `src/infrastructure/description-fetcher.js`, `attachment-cache.js`, `message-router.js`.
- [x] Move message actions into named handlers in `src/application/background.js`, receiving request store, report store, tab creator, downloader, cache and description fetcher.
- [x] Keep validation in `src/domain/message-validation.js` with explicit policy injection; invoke it in the router before handlers.
- [x] Wire imports, factories and Chrome event listeners in `src/entrypoints/background.js` only. Catch asynchronous event errors at this boundary.
- [x] Run all background and validation regression tests, including closed-tab photo downloads and cache cleanup.

### Task 4: eBay and options
- [x] Extract `src/ebay/config.js`, `reader.js`, `view.js`; move gallery, picker and CSS under `src/ebay`.
- [x] Inject description messaging into the reader; remove prompt formatting from DOM extraction.
- [x] Add `src/application/start-ebay.js`; inject reader, photo picker, settings, clipboard, prompt formatter and request sender. Return a cancellation result without creating a request.
- [x] Add `src/infrastructure/chrome-client.js` for options/report reads, settings writes, messaging and clipboard. UI receives actions through callbacks.
- [x] Wire `src/entrypoints/ebay.js` and `options.js`; move options HTML/CSS and implement `src/options/view.js` using injected settings operations.
- [x] Run eBay extraction, UI, gallery, picker, compliance and workflow tests; preserve existing labels and busy states.

### Task 5: Gemini
- [x] Move current editor and attachment adapters to `src/gemini`, preserving existing local changes.
- [x] Extract `src/gemini/status.js`, `chat-observer.js`, `files.js`; inject these operations into `src/application/gemini.js`.
- [x] Keep the editor separate from the request record. Preserve insertion/ACK/attachment/submit/save order and recovery controls.
- [x] Split shared photo encoding into `src/domain/photo-codec.js`; load the downloader only in the worker.
- [x] Wire `src/entrypoints/gemini.js`; test draft replacement, partial failures, reload without duplicate submission and manual-send monitoring.

### Task 6: Packaging, documentation, verification
- [x] Update manifest, worker imports, options script URLs and all test paths together. Remove old runtime modules after callers migrate.
- [x] Support nested paths in `scripts/pack.js`; verify worker imports, options assets, content scripts and icons in ZIP. Keep a production allowlist and reject unexpected archive files.
- [x] Add architecture tests that reject browser globals in domain/application and smoke-load actual entrypoints in their declared order.
- [x] Replace outdated README architecture/file references and add module responsibilities and dependency rules.
- [x] Run `npm test`, `npm run check`, `npm run verify:version`; pack and verify a ZIP in a temporary directory.
- [x] Review diff for unintended behavior, retained user changes and stale root paths. Report live browser coverage accurately.


## Execution notes

- Completed in `codex/clean-architecture` in the existing workspace to retain the user's uncommitted changes. Runtime and test changes that existed before the refactor were carried into their new locations; skill files and `skills-lock.json` were left outside the implementation.
- `tests/helpers/scripts.js` keeps regression fixtures aligned with manifest and worker declarations. Node VM smoke tests also execute individual files in their actual order.
- Renamed the Vitest configuration to `.mjs` to match its existing ESM syntax and eliminate the startup warning.
- Options initialization now reports a storage read failure at the UI boundary instead of leaving a rejected promise unhandled. Existing successful load/save/reset behavior is preserved.
- Final validation: 184 tests in 17 files; Biome and version consistency checks pass; production ZIP built and verified in a temporary location. No live eBay/Gemini browser session was used.
