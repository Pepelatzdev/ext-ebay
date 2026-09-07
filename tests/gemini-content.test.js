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

function runFlow({ request, editor = document.createElement("div"), respond }) {
	const ECAGeminiEditor = {
		waitForEditor: vi.fn(async () => editor),
		insertPrompt: vi.fn(() => true),
	};
	const sendMessage = vi.fn(async (message) => {
		const response = respond?.(message);
		if (response) return response;
		if (message.type === ECA.MESSAGE.CLAIM) {
			return request ? { success: true, request } : { success: true };
		}
		return { success: true };
	});
	const chrome = { runtime: { sendMessage } };
	const ECAGeminiAttachments = {
		attachFile: vi.fn(async () => ({ ok: true })),
	};
	const ECAPhotoTransfer = {
		fromBase64: (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
	};
	new Function(
		"chrome",
		"ECA",
		"ECAGeminiEditor",
		"ECAGeminiAttachments",
		"ECAPhotoTransfer",
		code,
	)(chrome, ECA, ECAGeminiEditor, ECAGeminiAttachments, ECAPhotoTransfer);
	return { ECAGeminiEditor, ECAGeminiAttachments, sendMessage };
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

	it("does not reattach photos when a waiting request is claimed again", async () => {
		setUrl("https://gemini.google.com/gem/example/chat-id");
		const { ECAGeminiAttachments, sendMessage } = runFlow({
			request: {
				state: "waiting_for_chat",
				requestId: "request-1",
				itemId: "123",
				targetUrl: "https://gemini.google.com/gem/example",
				photos: [{ photoId: "photo-1" }],
			},
		});
		await finishChatPolling();
		expect(ECAGeminiAttachments.attachFile).not.toHaveBeenCalled();
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

describe("photo reconstruction", () => {
	it.each([3, 0, 4])(
		"checks received bytes against the declared size %s",
		async (size) => {
			const { ECAGeminiAttachments, sendMessage } = runFlow({
				request: {
					state: "attaching",
					requestId: "r1",
					photos: [{ photoId: "p1" }],
					targetUrl: "https://gemini.google.com/gem/example",
				},
				respond: (message) => {
					if (message.type === ECA.MESSAGE.PREPARE_PHOTOS)
						return {
							success: true,
							photos: [{ photoId: "p1", mimeType: "image/jpeg", size }],
						};
					if (message.type === ECA.MESSAGE.GET_PHOTO_CHUNK)
						return {
							success: true,
							data: btoa(String.fromCharCode(0, 128, 255)),
							last: true,
						};
				},
			});
			await vi.advanceTimersByTimeAsync(0);
			if (size === 3) {
				const file = ECAGeminiAttachments.attachFile.mock.calls[0][1];
				expect(file.name).toBe("p1.jpg");
				expect(file.type).toBe("image/jpeg");
				expect(file.size).toBe(3);
				vi.clearAllTimers();
				vi.useRealTimers();
				const reader = new FileReader();
				const result = new Promise(
					(resolve) =>
						(reader.onload = () => resolve(new Uint8Array(reader.result))),
				);
				reader.readAsArrayBuffer(file);
				expect(Array.from(await result)).toEqual([0, 128, 255]);
				expect(sendMessage).toHaveBeenCalledWith({
					type: ECA.MESSAGE.PHOTO_READY,
					requestId: "r1",
					photoId: "p1",
				});
			} else {
				expect(ECAGeminiAttachments.attachFile).not.toHaveBeenCalled();
				expect(sendMessage).not.toHaveBeenCalledWith(
					expect.objectContaining({ type: ECA.MESSAGE.PHOTO_READY }),
				);
			}
		},
	);
});
