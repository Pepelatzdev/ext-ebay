import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const manifest = JSON.parse(
	readFileSync(resolve("manifest.json"), "utf8"),
);
export const source = (file) => readFileSync(resolve(file), "utf8");
export const scripts = (files) => files.map(source).join("\n");
export function contentFiles(host) {
	return manifest.content_scripts.find((entry) =>
		entry.matches.some((match) => match.includes(host)),
	).js;
}
export function workerFiles() {
	const entry = manifest.background.service_worker;
	const imports = source(entry).match(/importScripts\(([\s\S]*?)\);/)[1];
	return [
		...Array.from(imports.matchAll(/"([^"]+)"/g), (match) =>
			resolve(dirname(entry), match[1]),
		),
		entry,
	];
}
export function api(files, expression, bindings = {}) {
	return new Function(
		...Object.keys(bindings),
		`${scripts(files)}; return (${expression});`,
	)(...Object.values(bindings));
}
export function ebayModules() {
	return scripts(
		contentFiles("ebay.com").filter((file) => !file.includes("entrypoints/")),
	);
}
export function ebayComposition() {
	return `
 const client = ECAChromeClient.create({ chrome, navigator, policy: ECA });
 const reader = ECAEbayReader.create({ document, location: window.location, config: { ...ECA, ...ECAEbayConfig }, loadDescription: url => client.send(ECA.MESSAGE.FETCH_DESCRIPTION, { url }) });
 const prompt = ECAPrompt.create(ECA);
 const start = ECAStartEbay.create({ policy: ECA, reader, collectPhotos: () => ({ photos: [] }), pickPhotos: async () => ({ confirmed: true, selectedPhotoIds: [] }), getSettings: client.getSettings, formatPrompt: prompt.formatPrompt, pageUrl: () => window.location.href, copy: client.copy, send: client.send, logger: console });
 const view = ECAEbayView.create({ document, config: ECAEbayConfig, getItemId: reader.extractItemId, getReport: client.getReport, isReportUrl: ECA.isGeminiReportUrl, onAsk: start, logger: console });
 `;
}
