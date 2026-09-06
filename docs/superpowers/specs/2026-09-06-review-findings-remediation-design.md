# Review Findings Remediation Design

**Date:** 2026-09-06

## Goal

Resolve the release-blocking dependency advisories and the four runtime correctness issues found during the project review, then update the README so its guarantees match the implemented behavior.

## Scope

The change covers:

- development dependency updates required for a clean high-severity npm audit;
- serialized report-history writes in the Manifest V3 service worker;
- strict separation between a configured Gemini Gem URL and a saved Gemini report URL;
- complete prompt-insertion verification;
- request expiry enforcement at read time;
- regression tests and README corrections identified by the review.

It does not change the extension's supported eBay domains, permissions, user-facing controls, report limits, prompt limits, or Chrome Web Store authentication method.

## Dependency Remediation

Update the lockfile through npm's supported dependency resolution so the resolved `nanoid` and `postcss` versions no longer match the reported advisories. Do not add runtime dependencies. The resulting dependency tree must pass `npm audit --audit-level=high`, the existing static checks, and all tests.

## Serialized Report Writes

`report-store.js` remains the only writer for report history. Add an in-memory promise queue around the complete read, prune, write, and post-write quota check. Each `save()` call must observe all earlier completed saves handled by the same service-worker lifetime, including saves triggered close together by multiple Gemini tabs.

The queue must continue processing after a failed save. A failure from one operation is returned to that caller and must not leave the queue permanently rejected.

Regression coverage will start with a full 200-report history, issue two saves without awaiting the first one, and verify that both new reports remain represented while the oldest two reports are removed. A subsequent save must not unexpectedly delete either newly saved report.

## Gemini URL Lifecycle

Introduce separate validation rules for two URL roles:

- a configured target must be an HTTPS URL on `gemini.google.com` with a Gemini Gem path;
- a saved report must be an HTTPS URL on `gemini.google.com` with a recognized chat path.

The options page and privileged START message use the Gem-target validator. The SAVE_REPORT message uses the report validator.

The Gemini content script records the URL from which it starts monitoring. It saves a report only after the URL changes and the new URL matches the report pattern. This prevents an existing or placeholder chat URL from being accepted immediately after prompt insertion. Query parameters and fragments do not establish chat identity; comparison uses the normalized origin and pathname.

If no qualifying transition occurs before the existing monitoring deadline, the script leaves the request unsaved and lets normal expiry cleanup remove it.

## Complete Prompt Verification

After dispatching the editor input event, compare the editor's complete text with the complete prompt. Normalize only representation differences that do not alter content, specifically CRLF versus LF and non-breaking versus ordinary spaces. Prefix matches and partial content are failures.

The content script sends `ACK_PROMPT_INSERTED` only after this full comparison succeeds. A failed comparison preserves the pending request until its normal expiry, allowing clipboard fallback or a later retry rather than discarding the prompt.

## Request Expiry

`request-store.get()` checks `createdAt` against the five-minute TTL. Missing, invalid, or expired timestamps are treated as invalid requests. The store removes invalid state and clears its alarm before returning no request.

Because `markInserted()` and report saving both read through this method, a delayed alarm cannot allow an expired prompt to be inserted or an expired item mapping to save a report. The TTL remains anchored to request creation and does not restart after insertion.

## README Updates

Update the README to state that:

- clipboard copying is attempted automatically on each request and is a fallback rather than a configurable option;
- Chrome Sync must be enabled for cross-device synchronization;
- the request's five-minute lifetime begins when the Gemini tab is opened and does not restart after insertion;
- privileged message validation accurately reflects which messages require a sender tab;
- packaging uses a temporary staging directory but writes `extension.zip` to the repository root;
- Node.js 22.13 or newer within the Node 22 line and both `zip` and `unzip` are required by the documented local workflow.

The current OAuth Refresh Token release instructions remain unchanged because WIF exists only as a future design document, not as active workflow behavior.

## Verification

Add focused regression tests for every changed behavior, then run:

1. `npm run check`
2. `npm test`
3. `npm audit --audit-level=high`
4. `npm run verify:version`
5. `npm run pack`
6. `npm run verify:package`

The implementation is complete when all commands succeed and the working-tree diff contains only the intended source, test, documentation, and dependency-lock changes.
