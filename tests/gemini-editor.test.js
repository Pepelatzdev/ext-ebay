import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const code = readFileSync(resolve("src/gemini/editor.js"), "utf8");
const editorApi = () => new Function(`${code}; return ECAGeminiEditor;`)();

describe("Gemini editor adapter", () => {
	it("selects a visible main composer", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(editorApi().findEditor()).toBe(editor);
	});

	it("inserts and verifies prompt text", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(await editorApi().insertPrompt(editor, "Hello Gemini")).toBe(true);
		expect(editor.textContent).toContain("Hello Gemini");
	});

	it("does not overwrite a non-empty editor", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox">Existing draft</div>';
		const editor = document.querySelector("div");
		editor.getBoundingClientRect = () => ({ width: 100, height: 40 });
		expect(await editorApi().insertPrompt(editor, "New prompt")).toBe(false);
		expect(editor.textContent).toBe("Existing draft");
	});

	it("rejects an editor that retains only the prompt prefix", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.addEventListener("input", () => {
			editor.textContent = editor.textContent.slice(0, 200);
		});
		expect(await editorApi().insertPrompt(editor, "x".repeat(1000))).toBe(
			false,
		);
	});

	it("accepts equivalent line endings and spaces", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.addEventListener("input", () => {
			editor.textContent = editor.textContent
				.replace(/\n/g, "\r\n")
				.replace(/ /g, "\u00a0");
		});
		expect(
			await editorApi().insertPrompt(
				editor,
				"First line\nSecond line with space",
			),
		).toBe(true);
	});

	it("accepts paragraph and br DOM line breaks", async () => {
		document.body.innerHTML =
			'<div contenteditable="true" role="textbox"></div>';
		const editor = document.querySelector("div");
		editor.addEventListener("input", () => {
			editor.innerHTML =
				"<div>First line</div><div>Second line<br>Third line</div>";
		});
		expect(
			await editorApi().insertPrompt(
				editor,
				"First line\nSecond line\nThird line",
			),
		).toBe(true);
	});
});

it("verifies Gemini paragraphs without counting visual paragraph spacing", async () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		editor.innerHTML =
			"<p>First line</p><p><br></p><p>Second line</p><p>Third line</p>";
		Object.defineProperty(editor, "innerText", {
			value: "First line\n\n\n\n\nSecond line\n\nThird line",
			configurable: true,
		});
	});
	expect(
		await editorApi().insertPrompt(
			editor,
			"First line\n\nSecond line\nThird line",
		),
	).toBe(true);
});

it("does not hide missing blank lines when verifying paragraph text", async () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		editor.innerHTML = "<p>First line</p><p>Second line</p>";
	});
	expect(
		await editorApi().insertPrompt(editor, "First line\n\nSecond line"),
	).toBe(false);
});

it("waits for asynchronous editor normalization before confirming insertion", async () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		editor.innerHTML = "<p>First</p><p><br></p><p><br></p>";
		setTimeout(() => {
			editor.innerHTML = "<p>First</p><p><br></p><p>Last</p>";
		}, 80);
	});
	expect(await editorApi().insertPrompt(editor, "First\n\nLast")).toBe(true);
});
it("does not acknowledge text discarded asynchronously by the editor", async () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () =>
		setTimeout(() => {
			editor.textContent = "First";
		}, 0),
	);
	expect(await editorApi().insertPrompt(editor, "First\nLast", 150)).toBe(
		false,
	);
});

it("resumes an identical draft restored by Gemini without inserting it twice", async () => {
	document.body.innerHTML =
		'<div contenteditable="true" role="textbox"><p>First</p><p><br></p><p>Last</p></div>';
	const editor = document.querySelector("div");
	let inputs = 0;
	editor.addEventListener("input", () => inputs++);
	expect(await editorApi().insertPrompt(editor, "First\n\nLast")).toBe(true);
	expect(inputs).toBe(0);
});

it("verifies a replacement composer after Gemini rerenders", async () => {
	document.body.innerHTML = '<div contenteditable="true" role="textbox"></div>';
	const editor = document.querySelector("div");
	editor.addEventListener("input", () => {
		const replacement = editor.cloneNode(true);
		replacement.getBoundingClientRect = () => ({ width: 100, height: 40 });
		editor.replaceWith(replacement);
	});
	expect(await editorApi().insertPrompt(editor, "Exact prompt")).toBe(true);
});

it("replaces a different draft only when explicitly requested", async () => {
	document.body.innerHTML =
		'<div contenteditable="true" role="textbox"><p>Old product</p></div>';
	const editor = document.querySelector("div");
	expect(await editorApi().insertPrompt(editor, "New product")).toBe(false);
	expect(editor.textContent).toBe("Old product");
	expect(
		await editorApi().insertPrompt(editor, "New product", 2000, true),
	).toBe(true);
	expect(editor.textContent).toBe("New product");
});
