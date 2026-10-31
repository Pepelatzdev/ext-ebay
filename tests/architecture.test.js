import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { contentFiles, manifest, source } from "./helpers/scripts.js";

describe("dependency boundaries", () => {
	for (const layer of ["domain", "application"]) {
		for (const file of readdirSync(`src/${layer}`).filter((file) =>
			file.endsWith(".js"),
		)) {
			it(`${layer}/${file} has no direct browser dependencies`, () => {
				const code = source(`src/${layer}/${file}`).replace(
					/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
					"",
				);
				expect(code).not.toMatch(
					/\b(?:chrome|window|document|navigator|localStorage|sessionStorage)\s*\./,
				);
				expect(code).not.toMatch(
					/\b(?:fetch|DOMParser|File|MutationObserver)\s*\(/,
				);
				expect(code).not.toMatch(/\bDate\s*\.\s*now\s*\(/);
			});
		}
	}
});

describe("declared entrypoints", () => {
	it("loads real worker imports individually in service-worker order", async () => {
		const listeners = {};
		const event = (name) => ({
			addListener: (fn) => {
				listeners[name] = fn;
			},
		});
		const sync = { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) };
		const chrome = {
			storage: { session: {}, sync },
			alarms: { onAlarm: event("alarm") },
			tabs: { onRemoved: event("removed") },
			runtime: { onMessage: event("message"), onInstalled: event("installed") },
		};
		const entry = manifest.background.service_worker;
		const context = createContext({
			chrome,
			TextEncoder,
			btoa,
			atob,
			fetch: vi.fn(),
			console,
		});
		context.importScripts = (...files) => {
			for (const file of files) {
				const path = resolve(dirname(entry), file);
				runInContext(source(path), context, { filename: path });
			}
		};
		runInContext(source(entry), context, { filename: entry });
		expect(Object.keys(listeners).sort()).toEqual([
			"alarm",
			"installed",
			"message",
			"removed",
		]);
		const response = vi.fn();
		expect(listeners.message({ type: "unknown" }, {}, response)).toBe(true);
		await vi.waitFor(() => expect(response).toHaveBeenCalledWith(null));
		const inheritedName = vi.fn();
		listeners.message({ type: "toString" }, {}, inheritedName);
		await vi.waitFor(() => expect(inheritedName).toHaveBeenCalledWith(null));
		listeners.installed({ reason: "install" });
		await vi.waitFor(() =>
			expect(sync.set).toHaveBeenCalledWith(
				expect.objectContaining({ geminiUrl: "https://gemini.google.com/app" }),
			),
		);
	});
	it("loads the actual eBay entrypoint and connects its photo picker to START", async () => {
		document.body.innerHTML = '<h1 itemprop="name">Camera</h1>';
		const sendMessage = vi.fn(async () => ({ success: true }));
		const get = vi.fn(async (query) =>
			Array.isArray(query) ? {} : { ...query },
		);
		const changed = { addListener: vi.fn() };
		const clipboard = { writeText: vi.fn(async () => {}) };
		const context = createContext({
			document,
			window: { location: { href: "https://www.ebay.com/itm/123" } },
			navigator: { clipboard },
			chrome: {
				runtime: { sendMessage },
				storage: { sync: { get }, onChanged: changed },
			},
			console,
			URL,
			DOMParser,
			setTimeout,
			clearTimeout,
		});
		for (const file of contentFiles("ebay.com"))
			runInContext(source(file), context, { filename: file });
		await vi.waitFor(() =>
			expect(document.getElementById("ebay-copy-assistant-btn")).not.toBeNull(),
		);
		document.getElementById("ebay-copy-assistant-btn").click();
		expect(
			document.querySelector(".eca-photo-picker__continue"),
		).not.toBeNull();
		document.querySelector(".eca-photo-picker__continue").click();
		await vi.waitFor(() =>
			expect(sendMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "START_GEMINI_REQUEST",
					itemId: "123",
					photos: [],
				}),
			),
		);
		expect(clipboard.writeText).toHaveBeenCalledOnce();
		expect(changed.addListener).toHaveBeenCalledOnce();
	});
	it("loads settings scripts from their HTML and saves via the Chrome adapter", async () => {
		const htmlPath = manifest.options_page;
		const html = source(htmlPath);
		document.body.innerHTML = html;
		const sync = {
			get: vi.fn(async (query) => ({ ...query, preamble: "Existing" })),
			set: vi.fn(async () => {}),
		};
		const context = createContext({
			document,
			chrome: { storage: { sync, onChanged: { addListener: vi.fn() } } },
			navigator: {},
			URL,
			setTimeout,
			clearTimeout,
		});
		for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
			const path = resolve(dirname(htmlPath), file);
			runInContext(source(path), context, { filename: path });
		}
		await vi.waitFor(() =>
			expect(document.getElementById("preamble").value).toBe("Existing"),
		);
		document.getElementById("preamble").value = "New preamble";
		document.getElementById("save-btn").click();
		await vi.waitFor(() =>
			expect(sync.set).toHaveBeenCalledWith({
				preamble: "New preamble",
				geminiUrl: "https://gemini.google.com/app",
			}),
		);
		await vi.waitFor(() =>
			expect(document.getElementById("status").textContent).toContain("Saved"),
		);
	});
});
