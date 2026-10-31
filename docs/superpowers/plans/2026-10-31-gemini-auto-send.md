# Gemini automatic submission implementation plan

Goal: Support Gemini URLs, batch photo attachments and automatic submission.

Approved approach: use https://gemini.google.com/app by default; preserve Gem support; paste all files as one clipboard batch and wait for every new preview and no upload progress. Submit using an enabled Gemini send button. On uncertain partial batches stop for manual inspection rather than duplicate attachments.

- [x] Update config.js URL validation and default, options.js and options.html labels.
- [x] Add batch readiness counting and attachFiles in gemini-attachments.js.
- [x] Collect reconstructed files and acknowledge confirmed batches in gemini-content.js.
- [x] Add bounded send-button waiting in gemini-editor.js and invoke after attachments or text-only insertion.
- [x] Update regression tests and README.md.
- [x] Run npm test and npm run check.
