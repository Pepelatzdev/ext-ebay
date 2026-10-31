import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
			verifyProjectVersion({
				rootDir: versionFixture(),
				expectedVersion: "v1.2.3",
			}),
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
			verifyProjectVersion({
				rootDir: versionFixture(),
				expectedVersion: "v1.2.4",
			}),
		).toThrow(/release=1\.2\.4/);
	});
});

describe("production package", () => {
	it("keeps obsolete identity fields out of the source manifest", () => {
		const manifest = JSON.parse(
			readFileSync(join(import.meta.dirname, "../manifest.json"), "utf8"),
		);
		expect(manifest).not.toHaveProperty("key");
		expect(manifest).not.toHaveProperty("update_url");
	});

	it("wires every reliable request module into the manifest and package", () => {
		const manifest = JSON.parse(
			readFileSync(join(import.meta.dirname, "../manifest.json"), "utf8"),
		);
		const geminiScripts = manifest.content_scripts.find((entry) =>
			entry.matches.includes("https://gemini.google.com/*"),
		);
		const { PRODUCTION_FILES } = require("../scripts/pack.js");
		expect(manifest.permissions).toContain("alarms");
		expect(geminiScripts.js.at(-1)).toBe("src/entrypoints/gemini.js");
		expect(geminiScripts.js).toContain("src/application/gemini.js");
		expect(PRODUCTION_FILES).toEqual(
			expect.arrayContaining([
				...geminiScripts.js,
				manifest.background.service_worker,
				manifest.options_page,
				"src/domain/message-validation.js",
				"src/infrastructure/request-repository.js",
			]),
		);
	});

	it("packs and verifies the real extension in a temporary location", () => {
		const { packExtension } = require("../scripts/pack.js");
		const { verifyPackage } = require("../scripts/verify-package.js");
		const tempDir = mkdtempSync(join(tmpdir(), "eca-package-"));
		const outputFile = join(tempDir, "extension.zip");
		packExtension({ rootDir: join(import.meta.dirname, ".."), outputFile });
		expect(verifyPackage(outputFile)).toMatchObject({ manifestVersion: 3 });
	});

	it.each(["worker import", "options stylesheet", "unexpected file"])(
		"rejects a package with %s problems",
		(problem) => {
			const { packExtension } = require("../scripts/pack.js");
			const { verifyPackage } = require("../scripts/verify-package.js");
			const tempDir = mkdtempSync(join(tmpdir(), "eca-package-invalid-"));
			try {
				const outputFile = join(tempDir, "extension.zip");
				const unpacked = join(tempDir, "unpacked");
				packExtension({ rootDir: join(import.meta.dirname, ".."), outputFile });
				execFileSync("unzip", ["-q", outputFile, "-d", unpacked]);
				if (problem === "worker import") {
					const file = join(unpacked, "src/entrypoints/background.js");
					writeFileSync(
						file,
						readFileSync(file, "utf8").replace(
							"importScripts(",
							'importScripts("../domain/missing.js",',
						),
					);
				}
				if (problem === "options stylesheet") {
					const file = join(unpacked, "src/options/options.html");
					writeFileSync(
						file,
						readFileSync(file, "utf8").replace(
							'href="options.css"',
							'href="missing.css"',
						),
					);
				}
				if (problem === "unexpected file")
					writeFileSync(join(unpacked, "debug.txt"), "debug output");
				rmSync(outputFile);
				execFileSync("zip", ["-q", "-r", outputFile, "."], { cwd: unpacked });
				expect(() => verifyPackage(outputFile)).toThrow(
					problem === "unexpected file"
						? /Forbidden package entry debug.txt/
						: /Missing .*missing/,
				);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		},
	);

	it("throws and leaves no archive when the zip executable fails", () => {
		const { packExtension } = require("../scripts/pack.js");
		const outputFile = join(
			mkdtempSync(join(tmpdir(), "eca-package-")),
			"bad.zip",
		);
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

describe("Chrome Web Store V2 publisher", () => {
	it("uses an access token, polls an async upload and publishes", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		const responses = [
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
		const zipPath = join(
			mkdtempSync(join(tmpdir(), "eca-cws-")),
			"extension.zip",
		);
		writeFileSync(zipPath, "zip-bytes");
		const result = await publishExtension({
			env: {
				CHROME_ACCESS_TOKEN: "access-token",
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
					CHROME_ACCESS_TOKEN: "token",
					CHROME_PUBLISHER_ID: "publisher",
					CHROME_EXTENSION_ID: "extension-id",
				},
				fetchImpl,
				zipPath,
			}),
		).rejects.toThrow(/Upload failed/);
	});

	it("requires the short-lived access token", async () => {
		const { publishExtension } = require("../scripts/cws-publish.js");
		await expect(
			publishExtension({
				env: {
					CHROME_PUBLISHER_ID: "publisher",
					CHROME_EXTENSION_ID: "extension-id",
				},
			}),
		).rejects.toThrow(/CHROME_ACCESS_TOKEN/);
	});
});
