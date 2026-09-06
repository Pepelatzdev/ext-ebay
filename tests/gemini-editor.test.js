import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("gemini-editor.js"), "utf8");
const editorApi = () => new Function(`${code}; return ECAGeminiEditor;`)();

describe("Gemini editor adapter", () => {
	it("selects a visible main composer", () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(editorApi().findEditor()).toBe(editor);
	});

	it("inserts and verifies prompt text", () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(editorApi().insertPrompt(editor, "Hello Gemini")).toBe(true);
		expect(editor.textContent).toContain("Hello Gemini");
	});

	it("rejects an editor that retains only the prompt prefix", () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.addEventListener("input", () => {
			editor.textContent = editor.textContent.slice(0, 200);
		});
		expect(editorApi().insertPrompt(editor, "x".repeat(1000))).toBe(false);
	});

	it("accepts equivalent line endings and spaces", () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.addEventListener("input", () => {
			editor.textContent = editor.textContent
				.replace(/\n/g, "\r\n")
				.replace(/ /g, "\u00a0");
		});
		expect(
			editorApi().insertPrompt(editor, "First line\nSecond line with space"),
		).toBe(true);
	});
});
