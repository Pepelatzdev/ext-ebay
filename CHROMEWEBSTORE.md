# Chrome Web Store Listing — eBay Copy Assistant

Last Updated: 2026-10-31

## Store Listing

**Extension Name:** eBay Copy Assistant

**Short Description:** One-click copy of eBay product details as a prompt-ready text for chatbot consultation.

**Detailed Description:**

Send details from an eBay listing to Google Gemini to help evaluate the offer.

Include the title, price, condition, shipping, returns, seller information, visible reviews, item specifics and description. Choose up to ten photos from the listing's main gallery. Open the saved Gemini conversation from the listing, or start a new analysis with Ask again.

Open an eBay listing and click Ask Gemini. Confirm which photos to include. The extension opens your configured Gemini page, prepares the text and selected photos, and sends the message after confirming preparation. If preparation cannot be confirmed, check the message and attachments in Gemini before continuing manually. Existing drafts require an explicit replacement action.

Customize the prompt preamble and Gemini destination in Settings. Listing prompts and photos are processed for this feature; there are no developer-operated servers, analytics or advertising. Settings and report links use Chrome Sync. See the privacy policy for retention and third-party processing details.

Support: https://github.com/Pepelatzdev/ext-ebay/issues

**Single Purpose:** Prepare an eBay listing and selected photos for evaluation in Google Gemini and save its conversation link.

**Category / Primary Language / Distribution:** Retain existing dashboard values. This release updates the package, not the listing configuration; current dashboard values have not been independently exported.

## Graphics & Assets

| Asset | Local file | Release action |
| --- | --- | --- |
| Extension icons | `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` | Retain current icons |
| Promotional image | `ebay_copy_assistant_promo.png` | Retain current listing asset |
| Store screenshots | Existing dashboard assets; no local screenshot set | Retain current assets; this release does not redesign the interface |

## Permissions Justification

| Permission or host | Type | Purpose |
| --- | --- | --- |
| `storage` | permissions | Remember the user's prompt preamble, Gemini destination and saved conversation links; temporarily associate a pending request with its Gemini tab. |
| `alarms` | permissions | Remove expired pending requests and temporary attachments. |
| `https://*.ebaydesc.com/*` | host_permissions | Retrieve the seller description shown in an eBay listing's embedded description frame. |
| `https://*.ebay.com/*` | host_permissions | Retrieve listing descriptions hosted by eBay. |
| `https://i.ebayimg.com/*` | host_permissions | Download only photos the user selected from the listing's main gallery. |
| `https://gemini.google.com/*` | host_permissions | Prepare the requested message and photos in the user's chosen Gemini page and save the resulting conversation link. |

Content scripts run on supported HTTPS eBay item pages and Gemini. Supported eBay domains are `.com`, `.co.uk`, `.de`, `.fr`, `.it`, `.es`, `.com.au`, `.ca`, `.at` and `.pl`. Version 1.1.3 changes script paths, without expanding permissions or site matches.

## Privacy & Data Use

The extension processes website content and the current listing/conversation URLs for its single purpose. It does not collect analytics, authentication credentials, health information, financial account information, precise location or unrelated browsing history. Listing prices are product content, not the user's financial account data. Seller names and visible reviews may contain publicly displayed personal information and are included in the requested listing analysis.

| Data | Storage / transmission | Purpose |
| --- | --- | --- |
| Listing details, seller information, visible reviews and listing URL | Read locally, copied to the clipboard as a fallback, temporarily held in session storage, inserted into Gemini | Requested listing analysis |
| Selected photos | Downloaded from eBay's image CDN; held in temporary memory and inserted into Gemini | Include selected listing images in the analysis |
| Prompt preamble and Gemini destination | Chrome Sync | Remember user settings |
| Saved conversation links | Chrome Sync | Reopen the analysis from its listing |

Pending requests expire after five minutes. Requests with photos use a thirty-minute prepared lifetime after text insertion; text-only requests retain the original lifetime. Prompt text is removed from session storage after insertion is acknowledged. Photo bytes are not written to Sync or session storage. Closing the associated tab or expiry removes request data and cached photos. Saved reports are limited to 200 entries and an approximately 80 KiB Sync budget. Users can clear extension data through Chrome; uninstalling stops further processing.

Google Gemini receives the requested prompt and selected images; Chrome Sync transmits settings and saved links through the user's Google account. The developer operates no receiving backend. Existing store disclosures must reflect these practices; this release does not change the data-processing scope.

- Data is not sold.
- Data is used only for the disclosed listing-analysis feature.
- Data is not used for creditworthiness or lending decisions.

## Privacy Policy

https://pepelatzdev.github.io/ext-ebay/privacy.html

## Developer Info

Publisher identity in repository: Pepelatzdev.

Contact: pepelatzdev@gmail.com

Support: https://github.com/Pepelatzdev/ext-ebay/issues

Homepage: https://pepelatzdev.github.io/ext-ebay/

## Version History

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 1.1.3 | 2026-10-31 | Preserve listing-to-Gemini behavior while reorganizing code, strengthen package checks, retain verified draft and photo handling, and expand regression coverage to 184 tests. | Submitted — PENDING_REVIEW |

The [GitHub Actions release run](https://github.com/Pepelatzdev/ext-ebay/actions/runs/41244464059) completed successfully and returned `PENDING_REVIEW`. Submission is confirmed; store review is not yet complete.

## Review Notes

User confirmed live functionality before authorizing push and publication. Local checks cover 184 tests, code formatting, version consistency and the actual production ZIP. Existing store listing settings and assets are retained. No permission expansion or remote executable code is introduced. All executable extension code ships inside the ZIP. Developer documentation, tests, dependencies and this file are excluded from the ZIP.
