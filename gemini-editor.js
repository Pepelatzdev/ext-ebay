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

	function insertPrompt(editor, prompt) {
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
		return (editor.textContent || "").includes(prompt.slice(0, 200));
	}

	return { findEditor, insertPrompt, waitForEditor };
})();
