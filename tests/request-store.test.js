import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const code = readFileSync(resolve("request-store.js"), "utf8");

function createStore() {
	const data = {};
	const chrome = {
		alarms: { create: vi.fn(), clear: vi.fn(async () => true) },
		storage: {
			session: {
				get: vi.fn(async (key) => ({ [key]: data[key] })),
				set: vi.fn(async (value) => Object.assign(data, value)),
				remove: vi.fn(async (key) => delete data[key]),
			},
		},
	};
	const ECA = { PENDING_PROMPT_TTL_MS: 300_000 };
	const store = new Function(
		"chrome",
		"ECA",
		`${code}; return ECARequestStore;`,
	)(chrome, ECA);
	return { chrome, data, store };
}

describe("request store", () => {
	it("creates and reads a request by tab ID", async () => {
		const { store } = createStore();
		await store.create(42, {
			itemId: "123",
			prompt: "Prompt",
			targetUrl: "https://gemini.google.com/gem/example",
			createdAt: Date.now(),
		});
		expect(await store.get(42)).toMatchObject({
			state: "pending",
			itemId: "123",
			targetUrl: "https://gemini.google.com/gem/example",
		});
	});

	it("removes prompt but keeps item mapping after ACK", async () => {
		const { store } = createStore();
		await store.create(42, {
			itemId: "123",
			prompt: "Prompt",
			targetUrl: "https://gemini.google.com/gem/example",
			createdAt: Date.now(),
		});
		await store.markInserted(42);
		expect(await store.get(42)).toEqual({
			itemId: "123",
			targetUrl: "https://gemini.google.com/gem/example",
			createdAt: expect.any(Number),
			state: "waiting_for_chat",
		});
	});

	it("clears both session data and alarm", async () => {
		const { chrome, store } = createStore();
		await store.create(42, {
			itemId: "123",
			prompt: "Prompt",
			createdAt: Date.now(),
		});
		await store.remove(42);
		expect(await store.get(42)).toBeUndefined();
		expect(chrome.alarms.clear).toHaveBeenCalledWith("eca-request:42");
	});

	it("removes and rejects an expired request during get", async () => {
		const { chrome, store } = createStore();
		await store.create(42, {
			itemId: "123",
			prompt: "Prompt",
			targetUrl: "https://gemini.google.com/gem/example",
			createdAt: Date.now() - 300_000,
		});
		expect(await store.get(42)).toBeUndefined();
		expect(chrome.storage.session.remove).toHaveBeenCalledWith(
			"geminiRequest:42",
		);
		expect(chrome.alarms.clear).toHaveBeenCalledWith("eca-request:42");
	});

	it.each([undefined, "invalid", Number.NaN])(
		"removes a request with invalid createdAt %s",
		async (createdAt) => {
			const { data, store } = createStore();
			data["geminiRequest:42"] = {
				itemId: "123",
				prompt: "Prompt",
				targetUrl: "https://gemini.google.com/gem/example",
				createdAt,
				state: "pending",
			};
			expect(await store.get(42)).toBeUndefined();
		},
	);
});
