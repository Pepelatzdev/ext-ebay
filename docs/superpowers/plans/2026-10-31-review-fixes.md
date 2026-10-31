# Review fixes implementation plan

**Goal:** Fix the five reviewed extension defects without changing the user's existing auto-send work.

**Approved design:** The review and user instruction authorize recovery controls for partial photo requests, preserving failed state across acknowledgements, separating submission from report monitoring, clearing photo bytes whenever a request is removed, and grouping CDN sizes by image identity. A resumed request must never auto-send a restored or unrelated draft; manual sending remains available.

**Architecture:** Keep the existing content script / worker / session store boundaries. Add a removal callback to the request store so TTL reads, alarms, tab closure and successful report persistence share cleanup. Reject late download results after request removal. Keep fresh auto-send separate from resumed URL monitoring. Normalize only recognized eBay CDN size paths; retain exact URL identity elsewhere.

**Tech Stack:** JavaScript, Chrome extension APIs, Vitest/jsdom.

- [x] Add regression tests in tests/gemini-content.test.js for failed_partial reload and manual sending after auto-send failure; assert resumed waiting requests never call submitPrompt.
- [x] Add worker tests in tests/background.test.js for mixed photo results, retry state before attachment acknowledgement, and scoped cache cleanup on alarm/read/close.
- [x] Add gallery fixture in tests/gallery-extractor.test.js with ABC thumbnail, XYZ image, and larger ABC variants; expect two unique photos in original order.
- [x] Run npm test and confirm the new assertions fail on the reviewed code.
- [x] Fix state transitions in background.js; downloaded bytes alone must not mean attachments are acknowledged.
- [x] Separate waitAndSave monitoring from optional submission in gemini-content.js and restore partial recovery controls with auto-send disabled on reload.
- [x] Centralize request removal notifications in request-store.js, subscribe in background.js, and discard downloads that finish after closure or expiry.
- [x] Group recognized CDN sizes in gallery-extractor.js, preserving first occurrence and largest observed resolution.
- [x] Align README auto-send and recovery guidance with behavior.
- [x] Run npm test, npm run check, npm run verify:version, and pack/verify a temporary archive. Inspect the final diff; do not commit unrelated user changes.

Validation: the new regressions initially produced nine failing assertions; after fixes all 141 tests across 14 files pass. Biome, version verification, temporary package verification, and git diff --check pass. No live eBay/Gemini browser smoke test was performed. Existing user changes were retained; no commit or publication was made.

Release validation: user confirmed the live Chrome/eBay/Gemini smoke test passed and authorized commit and publication on 2026-10-31.
