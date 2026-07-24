# Release Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зробити quality, GitHub Pages і Chrome Web Store V2 незалежними та не дозволяти production release без green gates, валідного ZIP і узгодженої версії.

**Architecture:** Локальна release-логіка живе у тестованих CommonJS-модулях у `scripts/`; GitHub Actions лише встановлюють залежності та викликають npm scripts. `manifest.json` є джерелом версії, а `package.json`, `package-lock.json`, landing badge і release tag/input перевіряються перед upload.

**Tech Stack:** Node.js 22, npm, Vitest 4, Biome 2, Chrome Web Store API V2, GitHub Actions, GitHub Pages official actions.

---

**Spec:** `docs/superpowers/specs/2026-07-24-release-foundation-design.md`

## File map

- Modify `package.json` — canonical npm commands and updated dev tools.
- Modify `package-lock.json` — resolved safe transitive versions and version `1.0.2`.
- Create `scripts/verify-version.js` — compare manifest/package/lock/landing/release versions.
- Modify `scripts/pack.js` — deterministic, injectable packaging that throws on failure.
- Create `scripts/verify-package.js` — inspect ZIP contents and packaged manifest.
- Create `scripts/cws-publish.js` — OAuth refresh, V2 upload/poll/publish.
- Delete `scripts/generate-key.js` — obsolete CRX-era key generator.
- Modify `manifest.json` — remove `key` and `update_url`.
- Create `tests/release-scripts.test.js` — unit/integration tests for release helpers.
- Create `.github/workflows/quality.yml` — PR/main quality gates.
- Create `.github/workflows/pages.yml` — independent Pages deployment.
- Replace `.github/workflows/release.yml` — tag/manual Web Store V2 release.
- Modify `README.md` — actual commands, triggers, secrets and API V2.

### Task 1: Refresh dev dependencies and define commands

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update direct dev dependencies and regenerate the lockfile**

Run:

```bash
npm install --save-dev @biomejs/biome@2.5.5 jsdom@29.1.1 vitest@4.1.10
```

Expected: `package-lock.json` resolves at least `vite@8.1.5` and `undici@7.29.0`; its root version becomes `1.0.2`.

Update the `$schema` value in `biome.json` to:

```json
"$schema": "https://biomejs.dev/schemas/2.5.5/schema.json"
```

- [ ] **Step 2: Replace the scripts block in `package.json`**

```json
"scripts": {
	"test": "vitest run",
	"check": "biome check .",
	"pack": "node scripts/pack.js",
	"verify:package": "node scripts/verify-package.js extension.zip",
	"verify:version": "node scripts/verify-version.js"
}
```

Keep package version `1.0.2` and the three exact dev dependency versions installed in Step 1.

- [ ] **Step 3: Run the existing suite and audit**

Run:

```bash
npm run check
npm test
npm audit --audit-level=high
```

Expected: Biome passes; 43 existing tests pass; audit reports zero high or critical vulnerabilities.

- [ ] **Step 4: Commit the dependency baseline**

```bash
git add package.json package-lock.json biome.json
git commit -m "build: update release tooling dependencies"
```

### Task 2: Add strict version verification

**Files:**
- Create: `scripts/verify-version.js`
- Create: `tests/release-scripts.test.js`

- [ ] **Step 1: Create failing tests for internal and release-version mismatches**

Create `tests/release-scripts.test.js` with:

```javascript
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function versionFixture(overrides = {}) {
	const rootDir = mkdtempSync(join(tmpdir(), "eca-version-"));
	const version = overrides.manifest ?? "1.2.3";
	mkdirSync(join(rootDir, "scripts"));
	writeFileSync(
		join(rootDir, "manifest.json"),
		JSON.stringify({ manifest_version: 3, version }),
	);
	writeFileSync(
		join(rootDir, "package.json"),
		JSON.stringify({ version: overrides.package ?? "1.2.3" }),
	);
	writeFileSync(
		join(rootDir, "package-lock.json"),
		JSON.stringify({
			version: overrides.lock ?? "1.2.3",
			packages: { "": { version: overrides.lockRoot ?? "1.2.3" } },
		}),
	);
	writeFileSync(
		join(rootDir, "index.html"),
		`<div class="version-tag">VERSION ${overrides.landing ?? "1.2.3"}</div>`,
	);
	return rootDir;
}

describe("verify-version", () => {
	it("accepts matching project and expected versions", () => {
		const { verifyProjectVersion } = require("../scripts/verify-version.js");
		expect(
			verifyProjectVersion({ rootDir: versionFixture(), expectedVersion: "v1.2.3" }),
		).toBe("1.2.3");
	});

	it("rejects a stale package-lock root version", () => {
		const { verifyProjectVersion } = require("../scripts/verify-version.js");
		expect(() =>
			verifyProjectVersion({
				rootDir: versionFixture({ lockRoot: "1.2.2" }),
			}),
		).toThrow(/package-lock root=1\.2\.2/);
	});

	it("rejects a release tag that differs from manifest", () => {
		const { verifyProjectVersion } = require("../scripts/verify-version.js");
		expect(() =>
			verifyProjectVersion({ rootDir: versionFixture(), expectedVersion: "v1.2.4" }),
		).toThrow(/release=1\.2\.4/);
	});
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL because `scripts/verify-version.js` does not exist.

- [ ] **Step 3: Implement `scripts/verify-version.js`**

```javascript
const fs = require("node:fs");
const path = require("node:path");

function readJson(rootDir, filename) {
	return JSON.parse(fs.readFileSync(path.join(rootDir, filename), "utf8"));
}

function normalizeExpected(value) {
	if (!value) return null;
	return String(value).trim().replace(/^v/, "");
}

function verifyProjectVersion({
	rootDir = path.resolve(__dirname, ".."),
	expectedVersion = process.argv[2],
} = {}) {
	const manifest = readJson(rootDir, "manifest.json");
	const pkg = readJson(rootDir, "package.json");
	const lock = readJson(rootDir, "package-lock.json");
	const index = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
	const landing = index.match(/class="version-tag">VERSION ([0-9]+(?:\.[0-9]+){1,3})</)?.[1];
	if (!landing) throw new Error("Landing page version badge was not found");

	const expected = normalizeExpected(expectedVersion);
	const versions = {
		manifest: manifest.version,
		package: pkg.version,
		"package-lock": lock.version,
		"package-lock root": lock.packages?.[""]?.version,
		landing,
	};
	if (expected) versions.release = expected;

	const mismatches = Object.entries(versions)
		.filter(([, version]) => version !== manifest.version)
		.map(([name, version]) => `${name}=${version}`);
	if (mismatches.length > 0) {
		throw new Error(
			`Version mismatch; manifest=${manifest.version}; ${mismatches.join("; ")}`,
		);
	}
	return manifest.version;
}

module.exports = { normalizeExpected, verifyProjectVersion };

if (require.main === module) {
	try {
		const version = verifyProjectVersion();
		console.log(`Version verified: ${version}`);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
```

- [ ] **Step 4: Run focused tests and the real-project check**

```bash
npx vitest run tests/release-scripts.test.js
npm run verify:version
```

Expected: 3 tests pass and the CLI prints `Version verified: 1.0.2`.

- [ ] **Step 5: Commit version verification**

```bash
git add scripts/verify-version.js tests/release-scripts.test.js package.json
git commit -m "build: verify release versions"
```

### Task 3: Make packaging fail hard and verify the ZIP

**Files:**
- Modify: `scripts/pack.js`
- Create: `scripts/verify-package.js`
- Modify: `tests/release-scripts.test.js`

- [ ] **Step 1: Append failing package tests**

Append to `tests/release-scripts.test.js`:

```javascript
import { existsSync, readFileSync } from "node:fs";

describe("production package", () => {
	it("packs and verifies the real extension in a temporary location", () => {
		const { packExtension } = require("../scripts/pack.js");
		const { verifyPackage } = require("../scripts/verify-package.js");
		const tempDir = mkdtempSync(join(tmpdir(), "eca-package-"));
		const outputFile = join(tempDir, "extension.zip");
		packExtension({ rootDir: join(import.meta.dirname, ".."), outputFile });
		expect(verifyPackage(outputFile)).toMatchObject({ manifestVersion: 3 });
	});

	it("throws and leaves no archive when the zip executable fails", () => {
		const { packExtension } = require("../scripts/pack.js");
		const outputFile = join(mkdtempSync(join(tmpdir(), "eca-package-")), "bad.zip");
		expect(() =>
			packExtension({
				rootDir: join(import.meta.dirname, ".."),
				outputFile,
				zipCommand: "eca-command-that-does-not-exist",
			}),
		).toThrow();
		expect(existsSync(outputFile)).toBe(false);
	});
});
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL because current packer exports nothing and verifier is absent.

- [ ] **Step 3: Replace `scripts/pack.js` with an injectable packer**

```javascript
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PRODUCTION_FILES = [
	"background.js",
	"config.js",
	"extractors.js",
	"ui.js",
	"content.js",
	"gemini-content.js",
	"options.html",
	"options.css",
	"options.js",
	"content.css",
];

function packExtension({
	rootDir = path.resolve(__dirname, ".."),
	outputFile = path.join(rootDir, "extension.zip"),
	zipCommand = "zip",
} = {}) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eca-pack-"));
	const distDir = path.join(tempRoot, "dist");
	fs.mkdirSync(distDir);
	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(rootDir, "manifest.json"), "utf8"),
		);
		delete manifest.key;
		delete manifest.update_url;
		fs.writeFileSync(
			path.join(distDir, "manifest.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		for (const file of PRODUCTION_FILES) {
			fs.copyFileSync(path.join(rootDir, file), path.join(distDir, file));
		}
		fs.cpSync(path.join(rootDir, "icons"), path.join(distDir, "icons"), {
			recursive: true,
		});
		fs.rmSync(outputFile, { force: true });
		execFileSync(zipCommand, ["-q", "-r", outputFile, "."], { cwd: distDir });
		return outputFile;
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		throw error;
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
}

module.exports = { PRODUCTION_FILES, packExtension };

if (require.main === module) {
	try {
		console.log(`Created ${packExtension()}`);
	} catch (error) {
		console.error(`Packaging failed: ${error.message}`);
		process.exitCode = 1;
	}
}
```

- [ ] **Step 4: Create `scripts/verify-package.js`**

```javascript
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PRODUCTION_FILES } = require("./pack.js");

function verifyPackage(zipFile = process.argv[2]) {
	if (!zipFile || !fs.existsSync(zipFile)) throw new Error("ZIP file does not exist");
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eca-verify-"));
	try {
		execFileSync("unzip", ["-q", zipFile, "-d", tempDir]);
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tempDir, "manifest.json"), "utf8"),
		);
		if (manifest.manifest_version !== 3) throw new Error("Expected Manifest V3");
		if ("key" in manifest || "update_url" in manifest) {
			throw new Error("Package contains key/update_url");
		}
		const required = ["manifest.json", ...PRODUCTION_FILES];
		for (const file of required) {
			if (!fs.existsSync(path.join(tempDir, file))) throw new Error(`Missing ${file}`);
		}
		for (const icon of Object.values(manifest.icons || {})) {
			if (!fs.existsSync(path.join(tempDir, icon))) throw new Error(`Missing ${icon}`);
		}
		for (const entry of manifest.content_scripts || []) {
			for (const file of [...(entry.js || []), ...(entry.css || [])]) {
				if (!fs.existsSync(path.join(tempDir, file))) throw new Error(`Missing ${file}`);
			}
		}
		for (const forbidden of ["tests", "docs", "scripts", "README.md", "package.json"]) {
			if (fs.existsSync(path.join(tempDir, forbidden))) {
				throw new Error(`Forbidden package entry ${forbidden}`);
			}
		}
		return { manifestVersion: 3, version: manifest.version };
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
}

module.exports = { verifyPackage };

if (require.main === module) {
	try {
		const result = verifyPackage();
		console.log(`Package verified: ${result.version}`);
	} catch (error) {
		console.error(`Package verification failed: ${error.message}`);
		process.exitCode = 1;
	}
}
```

- [ ] **Step 5: Run focused and CLI package checks**

```bash
npx vitest run tests/release-scripts.test.js
npm run pack
npm run verify:package
```

Expected: all release-script tests pass; `extension.zip` is created and verified as version `1.0.2`.

- [ ] **Step 6: Commit packaging**

```bash
git add scripts/pack.js scripts/verify-package.js tests/release-scripts.test.js package.json
git commit -m "build: verify production package"
```

### Task 4: Remove obsolete CRX identity configuration

**Files:**
- Modify: `manifest.json`
- Delete: `scripts/generate-key.js`
- Modify: `tests/release-scripts.test.js`

- [ ] **Step 1: Add a manifest-source assertion**

Append inside `describe("production package")`:

```javascript
it("keeps obsolete identity fields out of the source manifest", () => {
	const manifest = JSON.parse(
		readFileSync(join(import.meta.dirname, "../manifest.json"), "utf8"),
	);
	expect(manifest).not.toHaveProperty("key");
	expect(manifest).not.toHaveProperty("update_url");
});
```

- [ ] **Step 2: Verify the assertion fails**

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL because both fields are currently present.

- [ ] **Step 3: Remove the fields and generator**

Delete the top-level `key` and `update_url` properties from `manifest.json`, keeping valid JSON, then delete `scripts/generate-key.js`.

- [ ] **Step 4: Run tests and package verification**

```bash
npx vitest run tests/release-scripts.test.js
npm run pack
npm run verify:package
```

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add manifest.json scripts/generate-key.js tests/release-scripts.test.js
git commit -m "build: remove obsolete CRX identity config"
```

### Task 5: Add a testable Chrome Web Store V2 client

**Files:**
- Create: `scripts/cws-publish.js`
- Modify: `tests/release-scripts.test.js`

- [ ] **Step 1: Append failing OAuth/upload/poll/publish tests**

Append:

```javascript
describe("Chrome Web Store V2 publisher", () => {
	it("refreshes OAuth, polls an async upload and publishes", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		const responses = [
			{ access_token: "secret-token" },
			{ uploadState: "IN_PROGRESS" },
			{ lastAsyncUploadState: "SUCCEEDED" },
			{ itemId: "extension-id", state: "PENDING_REVIEW" },
		];
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => responses.shift(),
			text: async () => "",
		});
		const zipPath = join(mkdtempSync(join(tmpdir(), "eca-cws-")), "extension.zip");
		writeFileSync(zipPath, "zip-bytes");
		const result = await publishExtension({
			env: {
				CHROME_CLIENT_ID: "client",
				CHROME_CLIENT_SECRET: "client-secret",
				CHROME_REFRESH_TOKEN: "refresh",
				CHROME_PUBLISHER_ID: "publisher",
				CHROME_EXTENSION_ID: "extension-id",
			},
			fetchImpl,
			sleep: async () => {},
			zipPath,
		});
		expect(result.state).toBe("PENDING_REVIEW");
	});

	it("rejects a failed upload without publishing", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		const responses = [{ access_token: "token" }, { uploadState: "FAILED" }];
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => responses.shift(),
			text: async () => "",
		});
		const zipPath = join(mkdtempSync(join(tmpdir(), "eca-cws-")), "extension.zip");
		writeFileSync(zipPath, "zip-bytes");
		await expect(
			publishExtension({
				env: {
					CHROME_CLIENT_ID: "client",
					CHROME_CLIENT_SECRET: "secret",
					CHROME_REFRESH_TOKEN: "refresh",
					CHROME_PUBLISHER_ID: "publisher",
					CHROME_EXTENSION_ID: "extension-id",
				},
				fetchImpl,
				zipPath,
			}),
		).rejects.toThrow(/Upload failed/);
	});
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: FAIL because `scripts/cws-publish.js` does not exist.

- [ ] **Step 3: Implement `scripts/cws-publish.js`**

```javascript
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ENV = [
	"CHROME_CLIENT_ID",
	"CHROME_CLIENT_SECRET",
	"CHROME_REFRESH_TOKEN",
	"CHROME_PUBLISHER_ID",
	"CHROME_EXTENSION_ID",
];

async function jsonRequest(fetchImpl, url, options) {
	const response = await fetchImpl(url, options);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`HTTP ${response.status}: ${body}`);
	}
	return response.json();
}

async function publishExtension({
	env = process.env,
	fetchImpl = fetch,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	zipPath = process.argv[2] || path.resolve("extension.zip"),
} = {}) {
	for (const name of REQUIRED_ENV) {
		if (!env[name]) throw new Error(`Missing environment variable ${name}`);
	}
	if (!fs.existsSync(zipPath)) throw new Error(`ZIP not found: ${zipPath}`);

	const tokenBody = new URLSearchParams({
		client_id: env.CHROME_CLIENT_ID,
		client_secret: env.CHROME_CLIENT_SECRET,
		refresh_token: env.CHROME_REFRESH_TOKEN,
		grant_type: "refresh_token",
	});
	const tokenResponse = await jsonRequest(
		fetchImpl,
		"https://oauth2.googleapis.com/token",
		{ method: "POST", body: tokenBody },
	);
	if (!tokenResponse.access_token) throw new Error("OAuth response has no access_token");

	const itemName = `publishers/${env.CHROME_PUBLISHER_ID}/items/${env.CHROME_EXTENSION_ID}`;
	const headers = { Authorization: `Bearer ${tokenResponse.access_token}` };
	const upload = await jsonRequest(
		fetchImpl,
		`https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload`,
		{
			method: "POST",
			headers: { ...headers, "Content-Type": "application/zip" },
			body: fs.readFileSync(zipPath),
		},
	);

	let uploadState = upload.uploadState;
	for (let attempt = 0; uploadState === "IN_PROGRESS" && attempt < 20; attempt++) {
		await sleep(15000);
		const status = await jsonRequest(
			fetchImpl,
			`https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`,
			{ method: "GET", headers },
		);
		uploadState = status.lastAsyncUploadState;
	}
	if (uploadState !== "SUCCEEDED") throw new Error(`Upload failed: ${uploadState}`);

	const published = await jsonRequest(
		fetchImpl,
		`https://chromewebstore.googleapis.com/v2/${itemName}:publish`,
		{
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({ publishType: "DEFAULT_PUBLISH", blockOnWarnings: true }),
		},
	);
	if (published.itemId !== env.CHROME_EXTENSION_ID || !published.state) {
		throw new Error("Publish response is missing itemId/state");
	}
	return published;
}

module.exports = { jsonRequest, publishExtension };

if (require.main === module) {
	publishExtension()
		.then((result) => console.log(`Submitted ${result.itemId}: ${result.state}`))
		.catch((error) => {
			console.error(`Chrome Web Store release failed: ${error.message}`);
			process.exitCode = 1;
		});
}
```

- [ ] **Step 4: Run focused tests**

```bash
npx vitest run tests/release-scripts.test.js
```

Expected: all release-script tests pass without network access.

- [ ] **Step 5: Commit the V2 client**

```bash
git add scripts/cws-publish.js tests/release-scripts.test.js
git commit -m "build: add Chrome Web Store V2 publisher"
```

### Task 6: Split GitHub Actions by responsibility

**Files:**
- Create: `.github/workflows/quality.yml`
- Create: `.github/workflows/pages.yml`
- Replace: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/quality.yml`**

```yaml
name: Quality

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm audit --audit-level=high
      - run: npm run verify:version
      - run: npm run pack
      - run: npm run verify:package
```

- [ ] **Step 2: Create `.github/workflows/pages.yml`**

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v6
      - name: Prepare site
        run: |
          mkdir -p build
          cp index.html build/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: build
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Replace `.github/workflows/release.yml`**

```yaml
name: Publish Chrome Extension

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version:
        description: Version to publish, without the v prefix
        required: true
        type: string

permissions:
  contents: read

concurrency:
  group: chrome-web-store-release
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    environment: chrome-web-store
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm audit --audit-level=high
      - name: Resolve release version
        id: version
        shell: bash
        env:
          MANUAL_VERSION: ${{ inputs.version }}
        run: |
          if [[ "$GITHUB_REF_TYPE" == "tag" ]]; then
            release_version="${GITHUB_REF_NAME#v}"
          else
            release_version="$MANUAL_VERSION"
          fi
          echo "value=$release_version" >> "$GITHUB_OUTPUT"
      - run: npm run verify:version -- "${{ steps.version.outputs.value }}"
      - run: npm run pack
      - run: npm run verify:package
      - name: Upload and publish through Chrome Web Store API V2
        env:
          CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
          CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
          CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
          CHROME_PUBLISHER_ID: ${{ secrets.CHROME_PUBLISHER_ID }}
          CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
        run: node scripts/cws-publish.js extension.zip
```

- [ ] **Step 4: Confirm triggers and permissions statically**

Run:

```bash
rg -n "branches: \[main\]|tags:|workflow_dispatch|pages: write|contents: read|chromewebstore.googleapis.com" .github scripts/cws-publish.js
```

Expected: only `release.yml` contains the `v*` tag trigger; Pages has `pages: write`; quality/release have `contents: read`; only the V2 client contains Web Store endpoints.

- [ ] **Step 5: Commit workflows**

```bash
git add .github/workflows/quality.yml .github/workflows/pages.yml .github/workflows/release.yml
git commit -m "ci: separate quality pages and Web Store release"
```

### Task 7: Update release documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace development command examples**

Document these commands exactly:

```bash
npm ci
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
```

- [ ] **Step 2: Replace the CI/CD section**

State that:

```text
quality.yml runs for pull requests and pushes to main.
pages.yml deploys index.html independently for pushes to main or manual dispatch.
release.yml publishes only for v* tags or manual dispatch after repeating all gates.
Chrome Web Store publication uses API V2 with OAuth refresh-token credentials.
Required secrets: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET,
CHROME_REFRESH_TOKEN, CHROME_PUBLISHER_ID, CHROME_EXTENSION_ID.
```

Also document the manual repository setup: select GitHub Actions as the Pages source and optionally require reviewers for the `chrome-web-store` environment.

- [ ] **Step 3: Run documentation and version checks**

```bash
npm run check
npm run verify:version
```

Expected: PASS and version `1.0.2`.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: document gated release workflow"
```

### Task 8: Final release-foundation verification

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run the complete local gate**

```bash
npm ci
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
git diff --check
```

Expected: all commands pass; test count is at least 43 plus the new release-script tests.

- [ ] **Step 2: Inspect the archive and trigger separation**

```bash
unzip -l extension.zip
rg -n "push:|pull_request:|workflow_dispatch:|tags:" .github/workflows
```

Expected: ZIP contains runtime files only; normal `main` push has no path to `cws-publish.js`.

- [ ] **Step 3: Confirm repository state**

```bash
git status --short
git log --oneline -8
```

Expected: clean worktree and the release-foundation commits listed above.

- [ ] **Step 4: Complete manual repository configuration before first tag**

In GitHub repository settings:

```text
Pages source: GitHub Actions
Environment: chrome-web-store
Optional protection: required reviewer
Secrets: CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN,
         CHROME_PUBLISHER_ID, CHROME_EXTENSION_ID
```

Expected: `quality.yml` and `pages.yml` may run on `main`; do not create a `v*` tag until these settings and secrets are confirmed.
