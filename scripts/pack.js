const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PRODUCTION_FILES = [
	"src/application/background.js",
	"src/application/gemini.js",
	"src/application/requests.js",
	"src/application/start-ebay.js",
	"src/domain/message-validation.js",
	"src/domain/photo-codec.js",
	"src/domain/policy.js",
	"src/domain/prompt.js",
	"src/domain/report-policy.js",
	"src/domain/request.js",
	"src/ebay/config.js",
	"src/ebay/content.css",
	"src/ebay/gallery.js",
	"src/ebay/photo-picker.js",
	"src/ebay/reader.js",
	"src/ebay/view.js",
	"src/entrypoints/background.js",
	"src/entrypoints/ebay.js",
	"src/entrypoints/gemini.js",
	"src/entrypoints/options.js",
	"src/gemini/attachments.js",
	"src/gemini/chat-observer.js",
	"src/gemini/editor.js",
	"src/gemini/files.js",
	"src/gemini/status.js",
	"src/infrastructure/attachment-cache.js",
	"src/infrastructure/chrome-client.js",
	"src/infrastructure/description-fetcher.js",
	"src/infrastructure/message-router.js",
	"src/infrastructure/photo-downloader.js",
	"src/infrastructure/report-store.js",
	"src/infrastructure/request-repository.js",
	"src/options/options.css",
	"src/options/options.html",
	"src/options/view.js",
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
			fs.mkdirSync(path.dirname(path.join(distDir, file)), { recursive: true });
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
