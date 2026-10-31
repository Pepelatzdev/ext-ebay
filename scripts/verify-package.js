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
		function requireAsset(file, parent = "manifest.json") {
			const absolute = path.resolve(tempDir, path.dirname(parent), file);
			const relative = path.relative(tempDir, absolute);
			if (relative.startsWith("..") || path.isAbsolute(relative))
				throw new Error(`Asset escapes package: ${file}`);
			if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile())
				throw new Error(`Missing ${relative}`);
			return relative;
		}
		for (const file of required) requireAsset(file);
		const iconFiles = [
			...Object.values(manifest.icons || {}),
			...Object.values(manifest.action?.default_icon || {}),
		];
		for (const file of iconFiles) requireAsset(file);
		for (const entry of manifest.content_scripts || []) {
			for (const file of [...(entry.js || []), ...(entry.css || [])])
				requireAsset(file);
		}
		const worker = requireAsset(manifest.background.service_worker);
		const workerCode = fs.readFileSync(path.join(tempDir, worker), "utf8");
		const imports = workerCode.match(/importScripts\(([\s\S]*?)\);/);
		if (!imports) throw new Error("Missing worker imports");
		for (const match of imports[1].matchAll(/"([^"]+)"/g))
			requireAsset(match[1], worker);
		const options = requireAsset(manifest.options_page);
		const html = fs.readFileSync(path.join(tempDir, options), "utf8");
		for (const match of html.matchAll(
			/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g,
		))
			requireAsset(match[1], options);
		const allowed = new Set([...required, ...iconFiles]);
		function verifyDirectory(directory) {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const absolute = path.join(directory, entry.name);
				if (entry.isDirectory()) verifyDirectory(absolute);
				else {
					const relative = path.relative(tempDir, absolute);
					if (!allowed.has(relative))
						throw new Error(`Forbidden package entry ${relative}`);
				}
			}
		}
		verifyDirectory(tempDir);
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
