import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(resolve("manifest.json"), "utf8"));

describe("manifest compliance", () => {
	it("uses only approved permissions", () => {
		expect(manifest.permissions).toEqual(["storage", "alarms"]);
	});

	it("uses HTTPS for every host and content-script match", () => {
		const matches = [
			...manifest.host_permissions,
			...manifest.content_scripts.flatMap((entry) => entry.matches),
		];
		expect(matches.every((match) => match.startsWith("https://"))).toBe(true);
	});

	it("declares a self-only extension CSP", () => {
		expect(manifest.content_security_policy.extension_pages).toBe(
			"script-src 'self'; object-src 'self'",
		);
	});
});

it("publishes and links the privacy policy", () => {
	const privacy = readFileSync(resolve("privacy.html"), "utf8");
	const landing = readFileSync(resolve("index.html"), "utf8");
	const options = readFileSync(resolve("options.html"), "utf8");
	expect(privacy).toContain("Google Gemini");
	expect(privacy).toContain("chrome.storage.session");
	expect(privacy).toContain("Chrome Web Store User Data Policy");
	expect(landing).toContain("privacy.html");
	expect(options).toContain(
		"https://pepelatzdev.github.io/ext-ebay/privacy.html",
	);
});

it("contains a complete MIT license", () => {
	const license = readFileSync(resolve("LICENSE"), "utf8");
	expect(license).toContain("MIT License");
	expect(license).toContain("Copyright (c) 2026 Pepelatzdev");
	expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
});
