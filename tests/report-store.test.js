import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

const code = readFileSync(resolve("report-store.js"), "utf8");

it("stores a report and keeps current FIFO behavior", async () => {
	const data = { chatHistoryOrder: ["old", "123"] };
	const chrome = {
		storage: {
			sync: {
				get: vi.fn(async () => ({ ...data })),
				set: vi.fn(async (value) => Object.assign(data, value)),
				remove: vi.fn(async () => {}),
			},
		},
	};
	const store = new Function("chrome", `${code}; return ECAReportStore;`)(
		chrome,
	);
	await store.save("123", "https://gemini.google.com/app/report");
	expect(data.chat_123).toBe("https://gemini.google.com/app/report");
	expect(data.chatHistoryOrder).toEqual(["old", "123"]);
});
