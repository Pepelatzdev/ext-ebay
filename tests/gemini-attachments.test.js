import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const adapter = new Function(
	`${readFileSync("gemini-attachments.js", "utf8")}; return ECAGeminiAttachments;`,
)();
function preview(root, ready = true) {
	const image = document.createElement("img");
	image.className = "gem-attachment-style-img";
	image.alt = "Попередній перегляд завантаженого зображення";
	image.src = ready ? "blob:photo" : "";
	Object.defineProperties(image, {
		complete: { value: ready, configurable: true },
		naturalWidth: { value: ready ? 800 : 0, configurable: true },
		naturalHeight: { value: ready ? 600 : 0, configurable: true },
	});
	root.append(image);
	return image;
}
beforeEach(() => {
	vi.useFakeTimers();
	document.body.replaceChildren();
});
afterEach(() => vi.useRealTimers());
describe("Gemini attachment confirmation", () => {
	it("confirms a new loaded preview with Ukrainian labels without a fixed delay", async () => {
		const waiting = adapter.waitForAttachment(document.body, new Set());
		preview(document.body);
		await expect(waiting).resolves.toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
	it("does not accept old attachments, toolbar labels, or empty previews", async () => {
		const old = preview(document.body);
		const waiting = adapter.waitForAttachment(
			document.body,
			new Set([old]),
			100,
		);
		const button = document.createElement("button");
		button.setAttribute("aria-label", "Add attachment");
		document.body.append(button);
		preview(document.body, false);
		await vi.advanceTimersByTimeAsync(100);
		await expect(waiting).resolves.toBe(false);
	});
	it("waits for image decoding and for the upload progress to disappear", async () => {
		const root = document.createElement("section");
		document.body.append(root);
		const waiting = adapter.waitForAttachment(root, new Set());
		const image = preview(root, false);
		const progress = document.createElement("div");
		progress.setAttribute("role", "progressbar");
		root.append(progress);
		const done = vi.fn();
		waiting.then(done);
		image.src = "blob:photo";
		Object.defineProperties(image, {
			complete: { value: true },
			naturalWidth: { value: 800 },
			naturalHeight: { value: 600 },
		});
		image.dispatchEvent(new Event("load"));
		await Promise.resolve();
		expect(done).not.toHaveBeenCalled();
		progress.remove();
		await expect(waiting).resolves.toBe(true);
	});
});
