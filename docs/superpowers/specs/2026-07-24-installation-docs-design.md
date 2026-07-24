# Chrome Web Store Installation Documentation Design

**Date:** 2026-07-24

## Goal

Replace all obsolete CRX installation guidance with a consistent Chrome Web Store-first experience in the GitHub Pages landing page and README, while preserving unpacked installation instructions for development.

## Authoritative installation URL

Both documents must use this exact public listing URL:

`https://chromewebstore.google.com/detail/ebay-copy-assistant/ekchfjieilkcaajpefdacpmibbglikip`

## Landing page

The existing visual design and responsive layout in `index.html` remain in place. The content changes are focused and do not introduce a redesign.

- Replace the `extension.crx` download link with a primary **Install from Chrome Web Store** link.
- Open the store listing in a new tab with `rel="noopener noreferrer"`.
- Replace the four-step CRX drag-and-drop instructions with a short summary of the current extension workflow:
  1. install from Chrome Web Store;
  2. open a supported eBay item page;
  3. use **Ask Gemini**;
  4. return to **Show report** or use **Ask again**.
- Add a compact developer note linking to the GitHub repository for unpacked installation instructions.
- Keep the current version tag, visual theme, repository footer, and responsive behavior.
- Remove every reference to `extension.crx`, manual CRX installation, and CRX downloads.

## README

The current comprehensive README structure remains. Update installation content so that it clearly serves both end users and developers.

- Add a primary **Install from Chrome Web Store** subsection with the verified listing link and normal **Add to Chrome** flow.
- Keep a separate **Unpacked installation for development** subsection.
- Remove the note saying that the public listing URL is unavailable.
- Retain the current sections for features, supported eBay domains, usage, settings, development, testing, Biome checks, packaging, architecture, storage/security, CI/CD, limitations, and license.
- Keep the documented floating actions synchronized with the implementation: **Ask Gemini**, **Show report**, and **Ask again**.

## Verification

- Search `index.html` and `README.md` for stale terms: `extension.crx`, `update.xml`, `View Report`, bold **Copy Assistant**, and `Add to Watchlist`.
- Confirm both files contain the exact verified Chrome Web Store URL.
- Confirm the Web Store link in `index.html` has safe new-tab attributes.
- Run `git diff --check`.
- Run all tests and the repository-wide Biome check because the branch also contains the floating UI implementation.
- Build `extension.zip` with `node scripts/pack.js` and inspect its file list.

## Integration

- Complete the documentation changes on `codex/floating-gemini-actions`.
- Commit the landing page and README changes.
- Switch to `main` and fast-forward merge the feature branch, as explicitly authorized by the user.
- Do not push to the remote repository unless separately requested.

## Out of scope

- A visual redesign of the landing page.
- Changes to the Chrome Web Store listing itself.
- Changes to release credentials or GitHub Actions secrets.
- Pushing `main` to `origin`.
