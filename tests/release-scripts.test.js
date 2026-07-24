import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
