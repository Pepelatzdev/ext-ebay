const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PRODUCTION_FILES } = require("./pack.js");

function verifyPackage(zipFile = process.argv[2]) {
	if (!zipFile || !fs.existsSync(zipFile)) {
		throw new Error("ZIP file does not exist");
	}
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eca-verify-"));
	try {
		execFileSync("unzip", ["-q", zipFile, "-d", tempDir]);
		const manifest = JSON.parse(
			fs.readFileSync(path.join(tempDir, "manifest.json"), "utf8"),
		);
		if (manifest.manifest_version !== 3)
			throw new Error("Expected Manifest V3");
		if ("key" in manifest || "update_url" in manifest) {
			throw new Error("Package contains key/update_url");
		}
		const required = ["manifest.json", ...PRODUCTION_FILES];
		for (const file of required) {
			if (!fs.existsSync(path.join(tempDir, file))) {
				throw new Error(`Missing ${file}`);
			}
		}
		for (const icon of Object.values(manifest.icons || {})) {
			if (!fs.existsSync(path.join(tempDir, icon))) {
				throw new Error(`Missing ${icon}`);
			}
		}
		for (const entry of manifest.content_scripts || []) {
			for (const file of [...(entry.js || []), ...(entry.css || [])]) {
				if (!fs.existsSync(path.join(tempDir, file))) {
					throw new Error(`Missing ${file}`);
				}
			}
		}
		for (const forbidden of [
			"tests",
			"docs",
			"scripts",
			"README.md",
			"package.json",
		]) {
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
