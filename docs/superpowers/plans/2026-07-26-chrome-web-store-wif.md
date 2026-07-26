# Chrome Web Store Workload Identity Federation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OAuth refresh-token authentication in the Chrome Web Store release path with a short-lived service-account access token obtained through repository-scoped GitHub Actions Workload Identity Federation.

**Architecture:** GitHub Actions completes every release gate, exchanges its OIDC identity for a 15-minute Google service-account access token through `google-github-actions/auth@v3`, and passes that token directly to the existing Node publisher. The Node publisher remains responsible only for Chrome Web Store upload, polling, and publish; Google Cloud, Chrome Web Store publisher access, and GitHub environment variables are provisioned once through their web consoles because `gcloud` and `gh` are not installed locally.

**Tech Stack:** GitHub Actions OIDC, Google Cloud Workload Identity Federation, Google Cloud service accounts, Chrome Web Store API V2, Node.js 22 CommonJS, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-07-26-chrome-web-store-wif-design.md`

---

## File map

- Modify `scripts/cws-publish.js` — accept a ready short-lived access token and keep upload/poll/publish responsibilities.
- Modify `tests/release-scripts.test.js` — cover supplied-token publication, missing-token rejection, and the WIF workflow contract.
- Modify `.github/workflows/release.yml` — request GitHub OIDC permission, mint a scoped service-account token, and use environment variables.
- Modify `tests/compliance.test.js` — prevent current README documentation from returning to refresh-token credentials.
- Modify `README.md` — document WIF architecture, one-time external setup, four environment variables, migration cleanup, and release checkpoints.

Historical files under `docs/superpowers/specs/` and `docs/superpowers/plans/` remain unchanged because they record the earlier OAuth decision.

### Task 1: Make the publisher consume a short-lived access token

**Files:**
- Modify: `tests/release-scripts.test.js:131-194`
- Modify: `scripts/cws-publish.js:4-48`

- [ ] **Step 1: Replace the OAuth publisher tests with supplied-token tests**

Replace the existing `Chrome Web Store V2 publisher` describe block in `tests/release-scripts.test.js` with:

```js
describe("Chrome Web Store V2 publisher", () => {
	it("uses a supplied access token, polls an async upload and publishes", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		const calls = [];
		const responses = [
			{ uploadState: "IN_PROGRESS" },
			{ lastAsyncUploadState: "SUCCEEDED" },
			{ itemId: "extension-id", state: "PENDING_REVIEW" },
		];
		const fetchImpl = async (url, options) => {
			calls.push({ url, options });
			return {
				ok: true,
				status: 200,
				json: async () => responses.shift(),
				text: async () => "",
			};
		};
		const zipPath = join(
			mkdtempSync(join(tmpdir(), "eca-cws-")),
			"extension.zip",
		);
		writeFileSync(zipPath, "zip-bytes");
		const result = await publishExtension({
			env: {
				CHROME_ACCESS_TOKEN: "secret-token",
				CHROME_PUBLISHER_ID: "publisher",
				CHROME_EXTENSION_ID: "extension-id",
			},
			fetchImpl,
			sleep: async () => {},
			zipPath,
		});

		expect(result.state).toBe("PENDING_REVIEW");
		expect(calls[0].url).toBe(
			"https://chromewebstore.googleapis.com/upload/v2/publishers/publisher/items/extension-id:upload",
		);
		expect(calls[0].options.headers.Authorization).toBe(
			"Bearer secret-token",
		);
		expect(calls.map(({ url }) => url)).not.toContain(
			"https://oauth2.googleapis.com/token",
		);
	});

	it("rejects a failed upload without publishing", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		const responses = [{ uploadState: "FAILED" }];
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => responses.shift(),
			text: async () => "",
		});
		const zipPath = join(
			mkdtempSync(join(tmpdir(), "eca-cws-")),
			"extension.zip",
		);
		writeFileSync(zipPath, "zip-bytes");
		await expect(
			publishExtension({
				env: {
					CHROME_ACCESS_TOKEN: "secret-token",
					CHROME_PUBLISHER_ID: "publisher",
					CHROME_EXTENSION_ID: "extension-id",
				},
				fetchImpl,
				zipPath,
			}),
		).rejects.toThrow(/Upload failed/);
	});

	it("rejects a missing short-lived access token before reading the ZIP", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		await expect(
			publishExtension({
				env: {
					CHROME_PUBLISHER_ID: "publisher",
					CHROME_EXTENSION_ID: "extension-id",
				},
			}),
		).rejects.toThrow(
			"Missing environment variable CHROME_ACCESS_TOKEN",
		);
	});
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for the old OAuth contract**

Run:

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL in the publisher tests because the implementation still requires `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN`.

- [ ] **Step 3: Replace OAuth exchange with the supplied token**

In `scripts/cws-publish.js`, replace `REQUIRED_ENV` with:

```js
const REQUIRED_ENV = [
	"CHROME_ACCESS_TOKEN",
	"CHROME_PUBLISHER_ID",
	"CHROME_EXTENSION_ID",
];
```

Delete the `URLSearchParams` token body, the request to `https://oauth2.googleapis.com/token`, and the access-token response validation. Replace the old `headers` initialization with:

```js
	const itemName = `publishers/${env.CHROME_PUBLISHER_ID}/items/${env.CHROME_EXTENSION_ID}`;
	const headers = { Authorization: `Bearer ${env.CHROME_ACCESS_TOKEN}` };
```

Do not change `jsonRequest`, ZIP existence checking, upload body, polling limits, publish request, `blockOnWarnings`, or response validation.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: PASS with 10 tests in `tests/release-scripts.test.js`.

- [ ] **Step 5: Check and commit the publisher migration**

Run:

```bash
npx biome check scripts/cws-publish.js tests/release-scripts.test.js
git diff --check
git add scripts/cws-publish.js tests/release-scripts.test.js
git commit -m "build: accept service account access token"
```

Expected: Biome and whitespace checks pass; the commit contains only the publisher and its tests.

### Task 2: Authenticate the release workflow through WIF

**Files:**
- Modify: `tests/release-scripts.test.js:194`
- Modify: `.github/workflows/release.yml:13-56`

- [ ] **Step 1: Add a failing WIF workflow contract test**

Append this block to `tests/release-scripts.test.js`:

```js
describe("Chrome Web Store WIF workflow", () => {
	it("mints a scoped service-account token without OAuth secrets", () => {
		const workflow = readFileSync(
			join(import.meta.dirname, "../.github/workflows/release.yml"),
			"utf8",
		);
		expect(workflow).toContain("id-token: write");
		expect(workflow).toContain("google-github-actions/auth@v3");
		expect(workflow).toContain("token_format: access_token");
		expect(workflow).toContain(
			"access_token_scopes: https://www.googleapis.com/auth/chromewebstore",
		);
		expect(workflow).toContain("access_token_lifetime: 900s");
		expect(workflow).toContain("create_credentials_file: false");
		expect(workflow).toContain("vars.GCP_WORKLOAD_IDENTITY_PROVIDER");
		expect(workflow).toContain("vars.GCP_SERVICE_ACCOUNT");
		expect(workflow).toContain("steps.google-auth.outputs.access_token");
		expect(workflow).toContain("vars.CHROME_PUBLISHER_ID");
		expect(workflow).toContain("vars.CHROME_EXTENSION_ID");
		expect(workflow).not.toContain("CHROME_CLIENT_ID");
		expect(workflow).not.toContain("CHROME_CLIENT_SECRET");
		expect(workflow).not.toContain("CHROME_REFRESH_TOKEN");
	});
});
```

- [ ] **Step 2: Run the focused tests and verify the workflow contract fails**

Run:

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL because `.github/workflows/release.yml` does not contain `id-token: write`.

- [ ] **Step 3: Replace the OAuth workflow wiring**

In `.github/workflows/release.yml`, change permissions to:

```yaml
permissions:
  contents: read
  id-token: write
```

Update the release job checkout step to the version required by the current auth action documentation:

```yaml
      - uses: actions/checkout@v7
```

Replace the existing upload/publish step with:

```yaml
      - name: Authenticate to Google Cloud through Workload Identity Federation
        id: google-auth
        uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ vars.GCP_SERVICE_ACCOUNT }}
          token_format: access_token
          access_token_scopes: https://www.googleapis.com/auth/chromewebstore
          access_token_lifetime: 900s
          create_credentials_file: false
      - name: Upload and publish through Chrome Web Store API V2
        env:
          CHROME_ACCESS_TOKEN: ${{ steps.google-auth.outputs.access_token }}
          CHROME_PUBLISHER_ID: ${{ vars.CHROME_PUBLISHER_ID }}
          CHROME_EXTENSION_ID: ${{ vars.CHROME_EXTENSION_ID }}
        run: node scripts/cws-publish.js extension.zip
```

Keep authentication after `npm run verify:package`, so the token lifetime is not consumed by tests or packaging.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
npx vitest run tests/release-scripts.test.js
npx biome check .github/workflows/release.yml tests/release-scripts.test.js
git diff --check
```

Expected: PASS with 11 release-script tests; Biome and whitespace checks pass.

- [ ] **Step 5: Commit the workflow migration**

Run:

```bash
git add .github/workflows/release.yml tests/release-scripts.test.js
git commit -m "ci: authenticate Web Store release through WIF"
```

Expected: the commit contains only the release workflow and its contract test.

### Task 3: Replace current OAuth documentation with WIF instructions

**Files:**
- Modify: `tests/compliance.test.js:65-68`
- Modify: `README.md:154-191`

- [ ] **Step 1: Add a failing README compliance test**

Append this test to `tests/compliance.test.js`:

```js
it("documents keyless Chrome Web Store publication", () => {
	const readme = readFileSync(resolve("README.md"), "utf8");
	expect(readme).toContain("Workload Identity Federation");
	expect(readme).toContain("GCP_WORKLOAD_IDENTITY_PROVIDER");
	expect(readme).toContain("GCP_SERVICE_ACCOUNT");
	expect(readme).toContain("CHROME_PUBLISHER_ID");
	expect(readme).toContain("CHROME_EXTENSION_ID");
	expect(readme).toContain("roles/iam.workloadIdentityUser");
	expect(readme).not.toContain("CHROME_CLIENT_ID");
	expect(readme).not.toContain("CHROME_CLIENT_SECRET");
	expect(readme).not.toContain("CHROME_REFRESH_TOKEN");
});
```

- [ ] **Step 2: Run the compliance tests and verify the documentation contract fails**

Run:

```bash
npx vitest run tests/compliance.test.js
```

Expected: FAIL because the README still documents OAuth Refresh Token and the three retired secrets.

- [ ] **Step 3: Update the architecture description**

In the architecture file list, replace the `scripts/cws-publish.js` line with:

```markdown
- `scripts/cws-publish.js` — upload, polling і publish через Chrome Web Store API V2 із короткоживучим service-account access token.
```

- [ ] **Step 4: Replace the CI/CD authentication and setup section**

Replace the README content from “Публікація у Chrome Web Store використовує…” through the numbered one-time setup list with:

```markdown
Публікація у Chrome Web Store використовує API V2 та keyless service-account автентифікацію через GitHub Actions Workload Identity Federation. Release job отримує короткоживучий access token зі scope `https://www.googleapis.com/auth/chromewebstore`; JSON-ключі, OAuth client secret і refresh token у GitHub не зберігаються.

Для GitHub environment `chrome-web-store` потрібні environment variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — повне ім'я provider у форматі `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`;
- `GCP_SERVICE_ACCOUNT` — email service account, доданого до Chrome Web Store publisher;
- `CHROME_PUBLISHER_ID` — Publisher ID із Chrome Web Store Developer Dashboard;
- `CHROME_EXTENSION_ID` — `ekchfjieilkcaajpefdacpmibbglikip`.

Одноразове налаштування:

1. У **GitHub → Settings → Pages → Build and deployment → Source** виберіть **GitHub Actions**.
2. У Google Cloud project увімкніть Chrome Web Store API, Security Token Service API та IAM Service Account Credentials API.
3. Створіть окремий service account без зайвих project-level ролей і додайте його email у **Chrome Web Store Developer Dashboard → Account**. Publisher може мати лише один service account.
4. Створіть Workload Identity Pool і GitHub OIDC provider з issuer `https://token.actions.githubusercontent.com`.
5. Налаштуйте attribute mapping для `google.subject=assertion.sub`, `attribute.repository=assertion.repository` і `attribute.ref=assertion.ref`.
6. Встановіть provider condition: repository має дорівнювати `Pepelatzdev/ext-ebay`, а ref — `refs/heads/main` або починатися з `refs/tags/v`.
7. Надайте principal set цього repository роль `roles/iam.workloadIdentityUser` лише на release service account.
8. У **GitHub → Settings → Environments → chrome-web-store** додайте чотири перелічені environment variables. За потреби залиште required reviewers.
9. Не створюйте service-account JSON key. Після першого успішного WIF release видаліть старі OAuth secrets, якщо вони залишилися в environment.
```

Keep the existing release-version paragraph immediately after this block.

- [ ] **Step 5: Run focused documentation tests and checks**

Run:

```bash
npx vitest run tests/compliance.test.js
npx biome check README.md tests/compliance.test.js
git diff --check
```

Expected: PASS with 9 compliance tests; Biome and whitespace checks pass.

- [ ] **Step 6: Commit the documentation migration**

Run:

```bash
git add README.md tests/compliance.test.js
git commit -m "docs: document keyless Web Store releases"
```

Expected: the commit contains only README and its compliance test.

### Task 4: Run the complete local release gate and review scope

**Files:**
- Verify only; no source changes are expected.

- [ ] **Step 1: Run all quality and release checks**

Run:

```bash
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
```

Expected: Biome reports no diagnostics, all 95 tests pass, audit reports no high-severity vulnerability, version remains consistent, and `extension.zip` passes package verification.

- [ ] **Step 2: Confirm active OAuth references are gone**

Run:

```bash
rg -n "CHROME_CLIENT_ID|CHROME_CLIENT_SECRET|CHROME_REFRESH_TOKEN|oauth2.googleapis.com/token" scripts .github README.md
```

Expected: no matches. Regression tests and historical design/spec files are deliberately outside this scan because they contain the retired names in negative assertions or historical records.

- [ ] **Step 3: Review the exact implementation diff and clean state**

Run:

```bash
git diff HEAD~3 -- scripts/cws-publish.js tests/release-scripts.test.js .github/workflows/release.yml tests/compliance.test.js README.md
git diff --check
git status --short
```

Expected: the three implementation commits contain only the five planned files and the worktree is clean. `extension.zip` remains ignored.

### Task 5: Provision Google Cloud WIF and Chrome Web Store access

**Files:**
- External configuration only; no repository files change.

- [ ] **Step 1: Confirm the authenticated Google account and select the Cloud project**

Open Google Cloud Console in the authenticated browser session. Display the current account and project selector. If more than one suitable project exists, stop and ask the user which project to use before enabling APIs or creating resources.

Expected: one explicitly confirmed project is selected and its project ID and numeric project number are recorded for later verification.

- [ ] **Step 2: Enable the three required APIs**

In **APIs & Services → Library**, enable and confirm enabled status for:

```text
Chrome Web Store API
Security Token Service API
IAM Service Account Credentials API
```

Expected: each API page shows **API enabled** for the selected project.

- [ ] **Step 3: Create or validate the dedicated service account**

In **IAM & Admin → Service Accounts**, create:

```text
Service account name: eBay Copy Assistant Web Store Publisher
Service account ID: ext-ebay-cws-publisher
Description: Keyless Chrome Web Store publishing from Pepelatzdev/ext-ebay
```

Assign no project-level role. If `ext-ebay-cws-publisher` already exists, inspect it and reuse it only if its purpose and permissions match exactly.

Expected: the account email ends with `ext-ebay-cws-publisher@<selected-project-id>.iam.gserviceaccount.com` and it has no unrelated project roles or user-managed keys.

- [ ] **Step 4: Register the service account with the intended Chrome Web Store publisher**

Open Chrome Web Store Developer Dashboard with the publisher-owner account, go to **Account**, and inspect the service-account field before changing it.

- If empty, add the new service-account email.
- If it already contains the same email, keep it.
- If it contains a different service account, stop and ask the user before replacing it because only one service account can be associated with the publisher.

Expected: the selected publisher account shows the dedicated service-account email, and the extension `ekchfjieilkcaajpefdacpmibbglikip` is visible under that publisher.

- [ ] **Step 5: Create or validate the repository-scoped Workload Identity Provider**

In **IAM & Admin → Workload Identity Federation**, create or validate:

```text
Pool ID: github-actions
Pool display name: GitHub Actions
Provider ID: ext-ebay
Provider display name: Pepelatzdev ext-ebay
Provider type: OpenID Connect (OIDC)
Issuer URL: https://token.actions.githubusercontent.com
```

Configure these attribute mappings:

```text
google.subject=assertion.sub
attribute.repository=assertion.repository
attribute.ref=assertion.ref
```

Configure this exact attribute condition:

```text
assertion.repository == 'Pepelatzdev/ext-ebay' && (assertion.ref == 'refs/heads/main' || assertion.ref.startsWith('refs/tags/v'))
```

Expected: the provider is enabled and its full resource name contains `/workloadIdentityPools/github-actions/providers/ext-ebay`.

- [ ] **Step 6: Grant only repository-scoped impersonation**

Grant the WIF principal set filtered by `attribute.repository/Pepelatzdev/ext-ebay` the role:

```text
roles/iam.workloadIdentityUser
```

Grant it on the `ext-ebay-cws-publisher` service account, not project-wide. Do not grant Owner, Editor, Service Account Admin, or Service Account Token Creator.

Expected: the service account IAM policy contains one repository-scoped Workload Identity User binding and no newly added broad role.

### Task 6: Configure the GitHub environment and prepare validation

**Files:**
- External configuration only; no repository files change.

- [ ] **Step 1: Create or inspect the release environment**

Open `Pepelatzdev/ext-ebay` on GitHub and go to **Settings → Environments → chrome-web-store**. Preserve existing required reviewers and deployment protection unless they block both `main` manual runs and `v*` tag runs.

Expected: the environment name is exactly `chrome-web-store`.

- [ ] **Step 2: Add the four environment variables**

Under **Environment variables**, create or update:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER = full provider resource name from Task 5
GCP_SERVICE_ACCOUNT = ext-ebay-cws-publisher service-account email
CHROME_PUBLISHER_ID = Publisher ID shown in Chrome Web Store Dashboard
CHROME_EXTENSION_ID = ekchfjieilkcaajpefdacpmibbglikip
```

Expected: all four variable names are visible. Values are copied directly from their authoritative consoles; no access token, OAuth client secret, refresh token, or JSON key is stored.

- [ ] **Step 3: Retain but do not use old OAuth secrets until validation**

Inspect the environment secrets list. Do not delete `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, or `CHROME_REFRESH_TOKEN` yet. Confirm the updated workflow no longer references them.

Expected: old secrets, if present, are inert and unavailable to the new publish step because the workflow has no `${{ secrets.* }}` reference for them.

- [ ] **Step 4: Present the pre-push checkpoint**

Report:

```text
Local quality gate: passed
Google Cloud project: confirmed
Service account: registered with Chrome Web Store publisher
WIF provider: restricted to Pepelatzdev/ext-ebay and main/v* refs
GitHub environment variables: four configured
Old OAuth secrets: retained but unused
```

Also report that local `main` was ahead of `origin/main` before this migration. Ask for explicit approval before pushing `main`; do not push a release tag in this step.

### Task 7: Push, observe CI, and stop before the publishing tag

**Files:**
- External Git and GitHub actions only.

- [ ] **Step 1: Reconcile remote state without force pushing**

Run:

```bash
git fetch origin
git status --short --branch
git log --left-right --oneline origin/main...main
```

Expected: the worktree is clean. If `origin/main` has commits not present locally, stop and reconcile them before continuing; never force push.

- [ ] **Step 2: Push the approved `main` state**

Only after explicit user approval, run:

```bash
git push origin main
```

Expected: push succeeds and starts **Quality** and **Deploy GitHub Pages**, but not **Publish Chrome Extension**.

- [ ] **Step 3: Observe the two main-branch workflows**

Use the GitHub Actions web UI to wait for the exact pushed commit in:

```text
Quality
Deploy GitHub Pages
```

Expected: both workflows are green. If either fails, stop; do not create a tag.

- [ ] **Step 4: Present the release-tag checkpoint**

Confirm that creating a `v*` tag will immediately run the WIF-authenticated upload and publish path. Do not create or push a tag until:

- a higher synchronized extension version has been committed;
- the Privacy Policy URL is live and configured in Chrome Web Store Dashboard;
- the user explicitly authorizes the exact tag.

Expected: execution stops with the repository and external WIF setup ready for a later approved release. The old OAuth secrets remain available for cleanup only after a successful WIF release.
