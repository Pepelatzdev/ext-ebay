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
		"ECAPhotoTransfer",
		`${scripts}; return { ECA, handleMessage, attachmentCache, ECAPhotoTransfer };`,
	)(chrome, () => {}, vi.fn(), {
		downloadSelected: vi.fn(async (photos) => ({
			succeeded: photos.map((p) => ({
				...p,
				bytes: new Uint8Array([1]),
				size: 1,
				mimeType: "image/jpeg",
			})),
			failed: [],
		})),
	});
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

	it("cleans requests on tab close and expired TTL alarm", async () => {
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
		vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
		await listeners.alarm({ name: "eca-request:102" });
		expect(session["geminiRequest:102"]).toBeUndefined();
		vi.useRealTimers();
	});
});

describe("photo recovery regressions", () => {
	function setup() {
		const worker = createWorker();
		worker.session["geminiRequest:101"] = {
			requestId: "r1",
			itemId: "123",
			createdAt: Date.now(),
			preparedAt: Date.now(),
			state: "failed_partial",
			photos: [{ photoId: "p1" }, { photoId: "p2" }],
			completedPhotoIds: [],
			failedPhotoIds: ["p2"],
		};
		worker.attachmentCache.set("r1:p1", { bytes: new Uint8Array([1]) });
		worker.attachmentCache.set("other:p1", { bytes: new Uint8Array([2]) });
		return {
			...worker,
			sender: { url: "https://gemini.google.com/app", tab: { id: 101 } },
		};
	}
	it.each(["RETRY_PHOTOS", "CONTINUE_WITH_FAILED_PHOTOS"])(
		"allows %s after acknowledging a successful photo",
		async (action) => {
			const w = setup();
			await w.handleMessage(
				{ type: w.ECA.MESSAGE.PHOTO_READY, requestId: "r1", photoId: "p1" },
				w.sender,
			);
			expect(w.session["geminiRequest:101"].state).toBe("failed_partial");
			const result = await w.handleMessage(
				{
					type: w.ECA.MESSAGE[action],
					requestId: "r1",
					...(action === "RETRY_PHOTOS" ? { photoIds: ["p2"] } : {}),
				},
				w.sender,
			);
			expect(result.success).toBe(true);
			if (action === "RETRY_PHOTOS") {
				expect(w.session["geminiRequest:101"].state).toBe("attaching");
				await w.handleMessage(
					{ type: w.ECA.MESSAGE.PHOTO_READY, requestId: "r1", photoId: "p2" },
					w.sender,
				);
				expect(w.session["geminiRequest:101"].state).toBe("waiting_for_chat");
				expect(w.session["geminiRequest:101"].completedPhotoIds).toEqual([
					"p1",
					"p2",
				]);
			}
		},
	);
	it.each(["alarm", "read", "close"])(
		"clears expired photo bytes on %s",
		async (action) => {
			const w = setup();
			w.session["geminiRequest:101"].preparedAt = Date.now() - 31 * 60 * 1000;
			if (action === "alarm")
				await w.listeners.alarm({ name: "eca-request:101" });
			if (action === "read")
				await w.handleMessage({ type: w.ECA.MESSAGE.CLAIM }, w.sender);
			if (action === "close") await w.listeners.removed(101);
			expect(w.session["geminiRequest:101"]).toBeUndefined();
			expect(w.attachmentCache.has("r1:p1")).toBe(false);
			expect(w.attachmentCache.has("other:p1")).toBe(true);
		},
	);
	it.each(["PREPARE_PHOTOS", "RETRY_PHOTOS"])(
		"discards %s results after tab closure",
		async (action) => {
			const w = setup();
			if (action === "PREPARE_PHOTOS")
				w.session["geminiRequest:101"].state = "attaching";
			let finish;
			w.ECAPhotoTransfer.downloadSelected.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			const pending = w.handleMessage(
				{
					type: w.ECA.MESSAGE[action],
					requestId: "r1",
					...(action === "RETRY_PHOTOS" ? { photoIds: ["p2"] } : {}),
				},
				w.sender,
			);
			for (let i = 0; i < 5; i++) await Promise.resolve();
			expect(finish).toBeTypeOf("function");
			await w.listeners.removed(101);
			finish({
				succeeded: [
					{
						photoId: "p2",
						bytes: new Uint8Array([1]),
						size: 1,
						mimeType: "image/jpeg",
					},
				],
				failed: [],
			});
			expect((await pending).success).toBe(false);
			expect(w.attachmentCache.has("r1:p2")).toBe(false);
			expect(w.session["geminiRequest:101"]).toBeUndefined();
		},
	);
	it("clears remaining photo bytes when a report is saved", async () => {
		const w = setup();
		w.session["geminiRequest:101"].state = "waiting_for_chat";
		const response = await w.handleMessage(
			{
				type: w.ECA.MESSAGE.SAVE_REPORT,
				url: "https://gemini.google.com/app/report",
			},
			w.sender,
		);
		expect(response.success).toBe(true);
		expect(w.attachmentCache.has("r1:p1")).toBe(false);
		expect(w.attachmentCache.has("other:p1")).toBe(true);
	});
});
