const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const zipFile = path.resolve(rootDir, "extension.zip");

console.log("📦 Packaging eBay Copy Assistant for Chrome Web Store...");

// 1. Create a clean dist directory
if (fs.existsSync(distDir)) {
	fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 2. Read and modify manifest.json for Web Store
const manifestPath = path.resolve(rootDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Remove fields that Web Store manages automatically or rejects
delete manifest.key;
delete manifest.update_url;

fs.writeFileSync(
	path.resolve(distDir, "manifest.json"),
	JSON.stringify(manifest, null, 2),
);
console.log("✓ Prepared manifest.json (removed local key & update_url)");

// 3. Copy other required production files
const filesToCopy = [
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

for (const file of filesToCopy) {
	fs.copyFileSync(path.resolve(rootDir, file), path.resolve(distDir, file));
}
console.log(`✓ Copied ${filesToCopy.length} core script and style files`);

// Copy icons folder
const iconsSrc = path.resolve(rootDir, "icons");
const iconsDest = path.resolve(distDir, "icons");
fs.mkdirSync(iconsDest, { recursive: true });
const iconFiles = fs.readdirSync(iconsSrc);
for (const file of iconFiles) {
	fs.copyFileSync(path.resolve(iconsSrc, file), path.resolve(iconsDest, file));
}
console.log(`✓ Copied ${iconFiles.length} icons`);

// 4. Archive dist/ into extension.zip
try {
	if (fs.existsSync(zipFile)) {
		fs.unlinkSync(zipFile);
	}
	execSync(`cd "${distDir}" && zip -r "${zipFile}" .`, { stdio: "inherit" });
	console.log(`\n🎉 Success! Created archive: ${zipFile}`);
} catch (err) {
	console.error("❌ Error during zipping:", err.message);
} finally {
	// Clean up dist folder
	fs.rmSync(distDir, { recursive: true, force: true });
	console.log("✓ Cleaned up temporary files");
}
