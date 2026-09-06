import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configCode = readFileSync(resolve("config.js"), "utf8");
const code = readFileSync(resolve("gemini-content.js"), "utf8");
const ECA = new Function(`${configCode}; return ECA;`)();

function setUrl(url) {
	Object.defineProperty(window, "location", {
		value: { href: url },
		writable: true,
		configurable: true,
	});
}

function runFlow({ request, editor = document.createElement("div") }) {
	const ECAGeminiEditor = {
		waitForEditor: vi.fn(async () => editor),
		insertPrompt: vi.fn(() => true),
	};
	const sendMessage = vi.fn(async (message) => {
		if (message.type === ECA.MESSAGE.CLAIM) {
			return request ? { success: true, request } : { success: true };
		}
		return { success: true };
	});
	const chrome = { runtime: { sendMessage } };
	new Function("chrome", "ECA", "ECAGeminiEditor", code)(
		chrome,
		ECA,
		ECAGeminiEditor,
	);
	return { ECAGeminiEditor, sendMessage };
}

async function finishChatPolling() {
	for (let index = 0; index < 5; index++) await Promise.resolve();
	await vi.advanceTimersByTimeAsync(1_000);
}

beforeEach(() => {
	vi.useFakeTimers();
	setUrl("https://gemini.google.com/gem/example");
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Gemini tab request flow", () => {
	it("claims, inserts, ACKs and saves a pending request in order", async () => {
		const { sendMessage } = runFlow({
			request: {
				state: "pending",
				itemId: "123",
				prompt: "Analyze item",
				targetUrl: "https://gemini.google.com/gem/example",
			},
		});
		for (let index = 0; index < 5; index++) await Promise.resolve();
		setUrl("https://gemini.google.com/gem/example/chat-id");
		await finishChatPolling();
		expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
			{ type: "CLAIM_GEMINI_REQUEST" },
			{ type: "ACK_PROMPT_INSERTED" },
			{
				type: "SAVE_GEMINI_REPORT",
				url: "https://gemini.google.com/gem/example/chat-id",
			},
		]);
	});

	it("resumes URL monitoring after reload without inserting again", async () => {
		setUrl("https://gemini.google.com/gem/example/chat-id");
		const { ECAGeminiEditor, sendMessage } = runFlow({
			request: {
				state: "waiting_for_chat",
				itemId: "123",
				targetUrl: "https://gemini.google.com/gem/example",
			},
		});
		await finishChatPolling();
		expect(ECAGeminiEditor.insertPrompt).not.toHaveBeenCalled();
		expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
			{ type: "CLAIM_GEMINI_REQUEST" },
			{
				type: "SAVE_GEMINI_REPORT",
				url: "https://gemini.google.com/gem/example/chat-id",
			},
		]);
	});

	it("does not claim a request when the editor times out", async () => {
		const { sendMessage } = runFlow({ request: null, editor: null });
		for (let index = 0; index < 5; index++) await Promise.resolve();
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("does not save the URL used to start the request", async () => {
		setUrl("https://gemini.google.com/app/existing-chat");
		const { sendMessage } = runFlow({
			request: {
				state: "pending",
				itemId: "123",
				prompt: "Analyze item",
				targetUrl: "https://gemini.google.com/app/existing-chat",
			},
		});
		await finishChatPolling();
		expect(sendMessage).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: ECA.MESSAGE.SAVE_REPORT }),
		);
	});
});
