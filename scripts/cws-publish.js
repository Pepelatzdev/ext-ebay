const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ENV = [
	"CHROME_ACCESS_TOKEN",
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

	const itemName = `publishers/${env.CHROME_PUBLISHER_ID}/items/${env.CHROME_EXTENSION_ID}`;
	const headers = { Authorization: `Bearer ${env.CHROME_ACCESS_TOKEN}` };
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
	for (
		let attempt = 0;
		uploadState === "IN_PROGRESS" && attempt < 20;
		attempt++
	) {
		await sleep(15000);
		const status = await jsonRequest(
			fetchImpl,
			`https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`,
			{ method: "GET", headers },
		);
		uploadState = status.lastAsyncUploadState;
	}
	if (uploadState !== "SUCCEEDED") {
		throw new Error(`Upload failed: ${uploadState}`);
	}

	const published = await jsonRequest(
		fetchImpl,
		`https://chromewebstore.googleapis.com/v2/${itemName}:publish`,
		{
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify({
				publishType: "DEFAULT_PUBLISH",
				blockOnWarnings: true,
			}),
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
		.then((result) =>
			console.log(`Submitted ${result.itemId}: ${result.state}`),
		)
		.catch((error) => {
			console.error(`Chrome Web Store release failed: ${error.message}`);
			process.exitCode = 1;
		});
}
