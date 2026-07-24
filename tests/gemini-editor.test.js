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
});
