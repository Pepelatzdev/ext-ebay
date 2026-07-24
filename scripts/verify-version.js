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
	const landing = index.match(
		/class=["']version-tag["'][^>]*>\s*VERSION\s+([0-9]+(?:\.[0-9]+){1,3})/i,
	)?.[1];
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
