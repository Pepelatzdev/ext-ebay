# Floating Actions Contrast and Cleanup Design

**Date:** 2026-07-24

## Goal

Improve the readability and visual contrast of the floating Gemini actions while removing only configuration that is demonstrably unused.

## Scope

### Floating action palette

Define component-scoped color tokens on `.ebay-copy-container` so the extension UI does not alter eBay page styles:

- Primary background: cobalt `#3665f3`.
- Primary hover background: darker cobalt `#234fc7`.
- Primary text: white `#ffffff`.
- Secondary background: white `#ffffff`.
- Secondary text and border: near-black `#191919`.

Use these tokens for both rendered states:

- **Ask Gemini** uses the primary treatment.
- **Show report** uses the primary treatment.
- **Ask again** uses the secondary treatment with a clear dark outline.

Keep the existing focus ring and success/error feedback. The new colors must not reduce keyboard focus visibility.

### Link-state protection

`Show report` is an anchor, so host-page `a:link` and `a:visited` rules can override a class-only text color. Apply the primary foreground color explicitly to the action's link and visited states, and keep the darker cobalt background for hover. This ensures the report label remains white and readable before and after the link has been visited.

### Configuration cleanup

Remove `DESC_FETCH_HOST_SUFFIXES` from `config.js`. The complete configuration audit found no runtime consumer for this value.

Retain all other configuration values because each has a runtime consumer. Retain all current selectors in `content.css` because each is used by `ui.js`, state classes, responsive rules, or pseudo-state styling.

## Implementation boundaries

- Do not add cleanup logic for the legacy `#ebay-copy-assistant-btn` element. The duplicate observed by the user was caused outside the current implementation and no compatibility handling is required.
- Do not change container creation, render guards, report persistence, extraction, or Gemini request behavior.
- Do not introduce global `:root` variables or broad anchor styles.
- Do not remove CSS merely because it represents a state or pseudo-class that is absent from the initial DOM.

## Verification

- Verify both primary actions use the cobalt background and white text.
- Verify **Show report** has an explicit visited-link color safeguard.
- Verify **Ask again** uses a white background, dark text, and dark border.
- Verify focus, success, error, and responsive states remain defined.
- Verify `DESC_FETCH_HOST_SUFFIXES` is absent and all remaining configuration values still have consumers.
- Run Biome checks and the complete Vitest suite.
- Review the final diff for unrelated changes and confirm the generated `.superpowers/` visual-preview directory is not included in a commit.

## Success criteria

The floating controls remain functionally unchanged, **Show report** is clearly readable in every link state, the chosen cobalt palette is isolated to the extension container, and only the proven-unused configuration entry is removed.
