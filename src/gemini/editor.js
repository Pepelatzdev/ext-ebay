/* global InputEvent, MutationObserver */
/* biome-ignore-all lint/correctness/noUnusedVariables: Gemini content-script global */
var ECAGeminiEditor = (() => {
	const SELECTORS = [
		'main div[contenteditable="true"][role="textbox"]',
		'div[contenteditable="true"][aria-label*="prompt" i]',
		'div[contenteditable="true"][role="textbox"]',
	];

	function isUsable(element) {
		if (!element || element.getAttribute("aria-disabled") === "true") {
			return false;
		}
		const rect = element.getBoundingClientRect();
		const isEditable =
			element.isContentEditable ||
			element.getAttribute("contenteditable") === "true";
		return isEditable && rect.width > 0 && rect.height > 0;
	}

	function findEditor() {
		for (const selector of SELECTORS) {
			for (const editor of document.querySelectorAll(selector)) {
				if (isUsable(editor)) return editor;
			}
		}
		return null;
	}

	function waitForEditor(timeoutMs = 15_000) {
		const existing = findEditor();
		if (existing) return Promise.resolve(existing);
		return new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				const editor = findEditor();
				if (editor) finish(editor);
			});
			const timer = setTimeout(() => finish(null), timeoutMs);
			function finish(value) {
				clearTimeout(timer);
				observer.disconnect();
				resolve(value);
			}
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
			});
		});
	}

	function comparableText(value) {
		return String(value)
			.replace(/\r\n?/g, "\n")
			.replace(/\u00a0/g, " ")
			.replace(/\n+$/g, "");
	}

	function editorText(editor) {
		// Read logical lines, not innerText: Chromium adds visual paragraph
		// spacing to innerText after Gemini converts the prompt to <p> nodes.
		const blockTags = new Set([
			"ADDRESS",
			"ARTICLE",
			"DIV",
			"LI",
			"P",
			"PRE",
			"SECTION",
		]);
		let result = "";
		function visit(node) {
			if (node.nodeType === 3) {
				result += node.nodeValue;
				return;
			}
			if (node.nodeType !== 1) return;
			if (node.tagName === "BR") {
				result += "\n";
				return;
			}
			const block = blockTags.has(node.tagName);
			const emptyLine =
				block &&
				node.childNodes.length === 1 &&
				node.firstChild.nodeName === "BR";
			// A sole <br> is an empty paragraph placeholder, not a second line.
			if (!emptyLine) for (const child of node.childNodes) visit(child);
			if (block) result += "\n";
		}
		visit(editor);
		return result;
	}

	async function insertPrompt(
		editor,
		prompt,
		timeoutMs = 2000,
		replaceDraft = false,
	) {
		const existing = comparableText(editorText(editor));
		const expected = comparableText(prompt);
		if (existing.trim() && existing !== expected && !replaceDraft) return false;
		if (!existing.trim() || (replaceDraft && existing !== expected)) {
			editor.focus();
			try {
				const range = document.createRange();
				range.selectNodeContents(editor);
				range.deleteContents();
				range.insertNode(document.createTextNode(prompt));
				const selection = window.getSelection();
				selection.removeAllRanges();
				range.collapse(false);
				selection.addRange(range);
			} catch {
				document.execCommand("insertText", false, prompt);
			}
			editor.dispatchEvent(
				new InputEvent("input", {
					bubbles: true,
					inputType: "insertText",
					data: prompt,
				}),
			);
		}
		// Gemini normalizes its editor asynchronously after the input event.
		// Wait for two matching reads, never ACK the transient DOM we inserted.
		const deadline = Date.now() + timeoutMs;
		let matches = 0;
		while (Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 50));
			if (!editor.isConnected) {
				const replacement = findEditor();
				if (!replacement) {
					matches = 0;
					continue;
				}
				editor = replacement;
			}
			const actual = comparableText(editorText(editor));
			matches = actual === expected ? matches + 1 : 0;
			if (matches >= 2) return true;
		}
		console.warn("eBay Copy Assistant: text verification timed out", {
			expectedLength: expected.length,
			actualLength: comparableText(editorText(editor)).length,
		});
		return false;
	}

	async function submitPrompt(editor, timeoutMs = 15_000) {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const root = editor?.closest("input-container") || editor?.parentElement;
			const button = root?.querySelector(
				'button.send-button, button[data-test-id="send-button"], button[aria-label="Send message"], button[aria-label="Надіслати повідомлення"]',
			);
			if (
				button &&
				!button.disabled &&
				button.getAttribute("aria-disabled") !== "true" &&
				!root.querySelector('[role="progressbar"], [aria-busy="true"]')
			) {
				button.click();
				return true;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return false;
	}

	return { submitPrompt, editorText, findEditor, insertPrompt, waitForEditor };
})();
