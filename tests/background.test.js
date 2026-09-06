import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const scripts = [
	"config.js",
	"message-validation.js",
	"request-store.js",
	"report-store.js",
	"background.js",
]
	.map((file) => readFileSync(resolve(file), "utf8"))
	.join("\n");

function createWorker() {
	const session = {};
	const sync = { chatHistoryOrder: [] };
	let nextTabId = 101;
	const listeners = {};
	const area = (data) => ({
		get: vi.fn(async (query) => {
			if (query === null) return { ...data };
			const keys = Array.isArray(query) ? query : [query];
			return Object.fromEntries(
				keys.filter((key) => key in data).map((key) => [key, data[key]]),
			);
		}),
		set: vi.fn(async (updates) => Object.assign(data, updates)),
		remove: vi.fn(async (keys) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
		}),
		getBytesInUse: vi.fn(async () =>
			Object.entries(data).reduce(
				(total, [key, value]) =>
					total +
					new TextEncoder().encode(key).length +
					new TextEncoder().encode(JSON.stringify(value)).length,
				0,
			),
		),
	});
	const chrome = {
		alarms: {
			create: vi.fn(),
			clear: vi.fn(async () => true),
			onAlarm: { addListener: (listener) => (listeners.alarm = listener) },
		},
		runtime: {
			onInstalled: { addListener: vi.fn() },
			onMessage: { addListener: (listener) => (listeners.message = listener) },
		},
		storage: { session: area(session), sync: area(sync) },
		tabs: {
			create: vi.fn(async () => ({ id: nextTabId++ })),
			onRemoved: { addListener: (listener) => (listeners.removed = listener) },
		},
	};
	const worker = new Function(
		"chrome",
		"importScripts",
		"fetch",
		`${scripts}; return { ECA, handleMessage };`,
	)(chrome, () => {}, vi.fn());
	return { chrome, listeners, session, sync, ...worker };
}

describe("background Gemini request flow", () => {
	it("rejects forged privileged payloads before opening a tab", async () => {
		const { ECA, chrome, handleMessage, session } = createWorker();
		const result = await handleMessage(
			{
				type: ECA.MESSAGE.START,
				itemId: "111",
				prompt: "A",
				url: "https://gemini.google.com/gem/id",
				tabId: 999,
			},
			{ url: "https://www.ebay.com/itm/111", tab: { id: 1 } },
		);
		expect(result).toMatchObject({ success: false });
		expect(chrome.tabs.create).not.toHaveBeenCalled();
		expect(session).toEqual({});
	});

	it("keeps two simultaneous requests bound to their Gemini tabs", async () => {
		const { ECA, handleMessage } = createWorker();
		const gemUrl = "https://gemini.google.com/gem/id";
		const ebay = (itemId) => ({
			url: `https://www.ebay.com/itm/${itemId}`,
			tab: { id: 1 },
		});
		const first = await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "111", prompt: "A", url: gemUrl },
			ebay("111"),
		);
		const second = await handleMessage(
			{ type: ECA.MESSAGE.START, itemId: "222", prompt: "B", url: gemUrl },
			ebay("222"),
		);
		expect(first.tabId).toBe(101);
		expect(second.tabId).toBe(102);
		const claim = (tabId) =>
			handleMessage(
				{ type: ECA.MESSAGE.CLAIM },
				{ url: "https://gemini.google.com/gem/id", tab: { id: tabId } },
			);
		expect(await claim(101)).toMatchObject({
			request: { itemId: "111", prompt: "A" },
		});
		expect(await claim(102)).toMatchObject({
			request: { itemId: "222", prompt: "B" },
		});
	});

	it("ACKs and saves only the report mapped to the sender tab", async () => {
		const { ECA, handleMessage, sync } = createWorker();
		const gemSender = {
			url: "https://gemini.google.com/app/report-111",
			tab: { id: 101 },
		};
		await handleMessage(
			{
				type: ECA.MESSAGE.START,
				itemId: "111",
				prompt: "A",
				url: "https://gemini.google.com/gem/id",
			},
			{ url: "https://www.ebay.com/itm/111", tab: { id: 1 } },
		);
		expect(
			await handleMessage({ type: ECA.MESSAGE.ACK_INSERTED }, gemSender),
		).toEqual({ success: true });
		expect(
			await handleMessage(
				{
					type: ECA.MESSAGE.SAVE_REPORT,
					url: "https://gemini.google.com/app/report-111",
				},
				gemSender,
			),
		).toEqual({ success: true });
		expect(sync.chat_111).toBe("https://gemini.google.com/app/report-111");
	});

	it("cleans requests on tab close and TTL alarm", async () => {
		const { ECA, handleMessage, listeners, session } = createWorker();
		await handleMessage(
			{
				type: ECA.MESSAGE.START,
				itemId: "111",
				prompt: "A",
				url: "https://gemini.google.com/gem/id",
			},
			{ url: "https://www.ebay.com/itm/111", tab: { id: 1 } },
		);
		await listeners.removed(101);
		expect(session["geminiRequest:101"]).toBeUndefined();
		await handleMessage(
			{
				type: ECA.MESSAGE.START,
				itemId: "222",
				prompt: "B",
				url: "https://gemini.google.com/gem/id",
			},
			{ url: "https://www.ebay.com/itm/222", tab: { id: 2 } },
		);
		await listeners.alarm({ name: "eca-request:102" });
		expect(session["geminiRequest:102"]).toBeUndefined();
	});
});
