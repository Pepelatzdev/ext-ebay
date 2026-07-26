# Chrome Web Store Workload Identity Federation Design

**Date:** 2026-07-26

## Goal

Replace the Chrome Web Store OAuth refresh-token release flow with keyless Google Cloud service-account authentication through GitHub Actions Workload Identity Federation (WIF), without changing the extension runtime or the existing upload, polling, and publish behavior.

## Authentication architecture

GitHub Actions authenticates to Google Cloud through its OIDC identity. A repository-scoped Workload Identity Provider permits that identity to impersonate one dedicated Google Cloud service account. The service account is registered in the Chrome Web Store Developer Dashboard and therefore has authority to manage the publisher's items.

The release workflow uses `google-github-actions/auth@v3` to mint a short-lived OAuth access token with only this scope:

```text
https://www.googleapis.com/auth/chromewebstore
```

The authentication step runs after all quality, version, packaging, and package-verification gates and immediately before the Chrome Web Store request. It uses:

- `token_format: access_token`;
- `access_token_lifetime: 900s`;
- `create_credentials_file: false`;
- the WIF provider and service-account email from GitHub environment variables.

The resulting token is passed only to the publishing process as `CHROME_ACCESS_TOKEN`. It is not written to disk or logged.

## External Google Cloud configuration

Use a dedicated Google Cloud project or an explicitly selected existing project. Enable:

- Chrome Web Store API;
- Security Token Service API;
- IAM Service Account Credentials API.

Create one dedicated service account without unrelated project-level roles. Add its email under the Account section of the Chrome Web Store Developer Dashboard. Chrome Web Store currently supports only one service account for a publisher, so any existing association must be reviewed before replacement.

Create a Workload Identity Pool and GitHub OIDC provider. The provider must map the repository claim and reject identities outside:

- repository `Pepelatzdev/ext-ebay`;
- tag refs beginning with `refs/tags/v`;
- branch ref `refs/heads/main`, which supports manual release workflow runs.

Grant the repository principal set only `roles/iam.workloadIdentityUser` on the dedicated service account. Do not create or download a service-account JSON key.

## GitHub environment configuration

Keep the existing `chrome-web-store` environment and any configured deployment reviewers. Store these non-secret values as environment variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — full provider resource name using the Google Cloud project number;
- `GCP_SERVICE_ACCOUNT` — dedicated service-account email;
- `CHROME_PUBLISHER_ID` — Chrome Web Store publisher ID;
- `CHROME_EXTENSION_ID` — `ekchfjieilkcaajpefdacpmibbglikip`.

The workflow job adds `id-token: write` alongside `contents: read`. Environment reviewers, when configured, must approve the job before GitHub can mint the OIDC token.

## Repository changes

### `.github/workflows/release.yml`

- Add `id-token: write` to job permissions.
- Keep all existing pre-release quality gates.
- Authenticate with `google-github-actions/auth@v3` immediately before publication.
- Read WIF, service-account, publisher, and extension identifiers through `${{ vars.* }}`.
- Pass `${{ steps.google-auth.outputs.access_token }}` to the publishing step as `CHROME_ACCESS_TOKEN`.
- Remove references to `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN`.

### `scripts/cws-publish.js`

- Require `CHROME_ACCESS_TOKEN`, `CHROME_PUBLISHER_ID`, and `CHROME_EXTENSION_ID`.
- Remove the refresh-token request to `https://oauth2.googleapis.com/token`.
- Use the supplied short-lived access token as the Bearer token.
- Preserve ZIP validation, upload, bounded status polling, `blockOnWarnings`, response validation, and publish behavior.
- Never print or persist the access token.

### Tests

- Update the successful publication test to inject a ready access token.
- Assert that the first network request is the Chrome Web Store upload rather than the OAuth token endpoint.
- Preserve async-upload polling and failed-upload coverage.
- Add missing-access-token coverage.
- Add static workflow assertions for `id-token: write`, `google-github-actions/auth@v3`, the exact Chrome Web Store scope, environment variables, and absence of the three retired OAuth secrets.

### Documentation

- Update the current README release and one-time setup instructions for service account plus WIF.
- Document the exact four GitHub environment variables and the external Google Cloud/Chrome Web Store setup.
- Document that old OAuth secrets remain unused during the first WIF verification and can be deleted after a successful WIF-authenticated workflow.
- Retain older design specs and implementation plans as historical records of the previous OAuth decision. This specification supersedes that decision for current behavior.

## Failure handling and migration safety

- Missing WIF variables, missing access token, failed OIDC exchange, or failed service-account impersonation stops the release before upload.
- A Chrome Web Store authorization failure is surfaced without exposing token material.
- Existing upload timeout, invalid state, and publish-response checks remain authoritative after authentication.
- There is no OAuth fallback. A broken WIF configuration must fail explicitly instead of silently using retired credentials.
- Existing OAuth secrets are not deleted until the first WIF authentication succeeds. The workflow stops referencing them immediately, so retaining them temporarily does not affect behavior.
- Creating and pushing a release tag remains a separate explicit checkpoint because a `v*` tag triggers upload and publish.
- A failed authentication attempt cannot change the currently published extension version.

## Verification

### Local

- Run focused release-script tests.
- Run Biome, the complete Vitest suite, high-severity dependency audit, version verification, packaging, and package verification.
- Confirm no active code, workflow, or README section references the retired OAuth secrets or token endpoint.

### External

- Confirm the selected Google Cloud project and authenticated `gcloud` account before mutations.
- Confirm all three required APIs are enabled.
- Inspect the Workload Identity Provider attribute mapping and condition.
- Inspect the service-account IAM policy for the exact `Pepelatzdev/ext-ebay` repository principal.
- Confirm the service-account email is registered with the intended Chrome Web Store publisher.
- Confirm all four GitHub environment variables exist without printing sensitive runtime tokens.
- Use the first approved tag release to verify the complete GitHub OIDC → WIF → service account → Chrome Web Store chain.

## Implementation boundaries

- No changes to the Manifest V3 runtime, permissions, content scripts, background worker, UI, extraction, Gemini integration, or storage.
- No service-account JSON key or long-lived Google credential is stored in GitHub.
- No new Node authentication dependency or `gcloud` installation is added to the release workflow.
- No automatic tag creation or push is introduced.
- No release tag is pushed without a separate explicit user checkpoint.

## Success criteria

The release workflow publishes through a short-lived service-account token obtained by repository-scoped WIF, no active release path depends on user OAuth credentials, all local release gates pass, and the first approved release reaches Chrome Web Store without storing a long-lived Google credential in GitHub.

## References

- [Chrome Web Store service accounts](https://developer.chrome.com/docs/webstore/service-accounts)
- [Google GitHub Actions authentication](https://github.com/google-github-actions/auth)
- [Google Cloud workload identities](https://docs.cloud.google.com/iam/docs/workload-identities)
