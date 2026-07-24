const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PRODUCTION_FILES = [
	"background.js",
	"message-validation.js",
	"request-store.js",
	"report-store.js",
	"config.js",
	"extractors.js",
	"ui.js",
	"content.js",
	"gemini-editor.js",
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
