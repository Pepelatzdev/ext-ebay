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
