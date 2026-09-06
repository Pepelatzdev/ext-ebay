import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("report-store.js"), "utf8");
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

function createStore(initial = {}) {
	const data = structuredClone(initial);
	const sync = {
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
				(total, [key, value]) => total + bytes(key) + bytes(value),
				0,
			),
		),
	};
	const chrome = { __data: data, storage: { sync } };
	const store = new Function("chrome", `${code}; return ECAReportStore;`)(
		chrome,
	);
	return { chrome, data, store };
}

describe("quota-aware report store", () => {
	it("deduplicates history and keeps the newest occurrence", async () => {
		const { data, store } = createStore({
			chat_1: "https://gemini.google.com/app/one",
			chat_2: "https://gemini.google.com/app/two",
			chatHistoryOrder: ["1", "2", "1", "missing"],
		});
		await store.save("1", "https://gemini.google.com/app/replacement");
		expect(data.chatHistoryOrder).toEqual(["2", "1"]);
	});

	it("prunes to at most 200 reports", async () => {
		const initial = { chatHistoryOrder: [] };
		for (let index = 0; index < 200; index++) {
			initial.chatHistoryOrder.push(String(index));
			initial[`chat_${index}`] = `https://gemini.google.com/app/${index}`;
		}
		const { data, store } = createStore(initial);
		await store.save("new", "https://gemini.google.com/app/new");
		expect(data.chatHistoryOrder).toHaveLength(200);
		expect(data.chatHistoryOrder.at(-1)).toBe("new");
		expect(data.chat_0).toBeUndefined();
	});

	it("prunes large oldest URLs to the 80 KiB target", async () => {
		const initial = { chatHistoryOrder: [] };
		for (let index = 0; index < 100; index++) {
			initial.chatHistoryOrder.push(String(index));
			initial[`chat_${index}`] =
				`https://gemini.google.com/app/${"x".repeat(1000)}${index}`;
		}
		const { chrome, data, store } = createStore(initial);
		await store.save("new", "https://gemini.google.com/app/new");
		expect(await chrome.storage.sync.getBytesInUse(null)).toBeLessThanOrEqual(
			80 * 1024,
		);
		expect(data.chat_new).toBeTruthy();
	});

	it("retries once after a quota error", async () => {
		const { chrome, store } = createStore({
			chat_old: "https://gemini.google.com/app/old",
			chatHistoryOrder: ["old"],
		});
		chrome.storage.sync.set
			.mockRejectedValueOnce(new Error("QUOTA_BYTES quota exceeded"))
			.mockImplementationOnce(async (updates) =>
				Object.assign(chrome.__data, updates),
			);
		await store.save("new", "https://gemini.google.com/app/new");
		expect(chrome.storage.sync.set).toHaveBeenCalledTimes(2);
	});

	it("serializes simultaneous saves against the latest history", async () => {
		const initial = { chatHistoryOrder: [] };
		for (let index = 0; index < 200; index++) {
			initial.chatHistoryOrder.push(String(index));
			initial[`chat_${index}`] = `https://gemini.google.com/app/${index}`;
		}
		const { data, store } = createStore(initial);

		await Promise.all([
			store.save("new-a", "https://gemini.google.com/app/new-a"),
			store.save("new-b", "https://gemini.google.com/app/new-b"),
		]);

		expect(data.chatHistoryOrder).toHaveLength(200);
		expect(data.chatHistoryOrder.slice(-2)).toEqual(["new-a", "new-b"]);
		expect(data["chat_new-a"]).toBeTruthy();
		expect(data["chat_new-b"]).toBeTruthy();
		expect(data.chat_0).toBeUndefined();
		expect(data.chat_1).toBeUndefined();
	});

	it("continues the save queue after one operation fails", async () => {
		const { chrome, data, store } = createStore({ chatHistoryOrder: [] });
		chrome.storage.sync.set.mockRejectedValueOnce(new Error("write failed"));

		await expect(
			store.save("failed", "https://gemini.google.com/app/failed"),
		).rejects.toThrow("write failed");
		await store.save("next", "https://gemini.google.com/app/next");

		expect(data.chat_next).toBe("https://gemini.google.com/app/next");
	});
});
