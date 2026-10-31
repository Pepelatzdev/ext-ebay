import { describe, expect, it, vi } from "vitest";
import { scripts } from "./helpers/scripts.js";

const code = scripts([
	"src/domain/request.js",
	"src/infrastructure/request-repository.js",
	"src/application/requests.js",
]);

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
		`${code}; return ECARequests.create({ repository: ECARequestRepository.create(chrome.storage.session), alarms: chrome.alarms, model: ECARequestModel.create(ECA), now: () => Date.now() });`,
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
