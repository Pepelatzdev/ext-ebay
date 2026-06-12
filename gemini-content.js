/**
 * eBay Copy Assistant — Gemini-side content script.
 *
 * Loaded on gemini.google.com/*. If the user just clicked "Ask Gemini"
 * on an eBay item page (within the TTL), pastes the pre-formatted prompt
 * into Gemini's input box and monitors the URL for the resulting chat,
 * which is then saved back into chrome.storage.sync so the eBay page can
 * link to the report on next visit.
 */

(() => {
	const TAG = "eBay Copy Assistant";
	const MAX_INPUT_WAIT_ATTEMPTS = 50; // 50 * 200ms = 10 s
	const URL_POLL_INTERVAL_MS = 1000;
	const MAX_URL_POLL_ATTEMPTS = 300; // 5 min
	const MAX_HISTORY = 400;
	// Kept in sync with config.js ECA.PENDING_PROMPT_TTL_MS. Not imported
	// because this script runs on Gemini, where config.js is not loaded.
	const PENDING_PROMPT_TTL_MS = 5 * 60 * 1000;
	// Matches a started conversation: /app/<id>, /chat(s)/<id>, or a chat
	// inside a Gem (/gem/<gemId>/<chatId>). A bare Gem landing page
	// (/gem/<gemId>) must NOT match, or we would persist it before the
	// conversation exists.
	const CHAT_PATH_RE = /\/(app|chat|chats)\/[^/?#]|\/gem\/[^/?#]+\/[^/?#]/;

	function safe(fn) {
		try {
			return fn();
		} catch (e) {
			if (!String(e?.message).includes("Extension context invalidated")) {
				console.warn(`${TAG}: storage call failed`, e);
			}
			return undefined;
		}
	}

	safe(() =>
		chrome.storage.local.get(
			["pendingPrompt", "activePromptItemId", "pendingPromptAt"],
			(result) => {
				if (chrome.runtime.lastError) return;

				const promptText = result.pendingPrompt;
				const itemId = result.activePromptItemId;
				const pendingAt = result.pendingPromptAt || 0;

				if (!promptText || !itemId) return;

				// Drop stale pending prompts so we don't paste into an
				// unrelated Gemini session the user opens later.
				if (Date.now() - pendingAt > PENDING_PROMPT_TTL_MS) {
					safe(() =>
						chrome.storage.local.remove([
							"pendingPrompt",
							"activePromptItemId",
							"pendingPromptAt",
						]),
					);
					return;
				}

				waitForInputAndPaste(promptText, itemId);
			},
		),
	);

	function waitForInputAndPaste(promptText, itemId) {
		let attempts = 0;

		const searchInterval = setInterval(() => {
			attempts++;
			const promptBox = document.querySelector('div[contenteditable="true"]');

			if (promptBox) {
				clearInterval(searchInterval);
				pasteIntoBox(promptBox, promptText);

				safe(() =>
					chrome.storage.local.remove(["pendingPrompt", "pendingPromptAt"]),
				);

				monitorChatUrl(itemId);
			} else if (attempts >= MAX_INPUT_WAIT_ATTEMPTS) {
				clearInterval(searchInterval);
				console.warn(
					`${TAG}: Could not find Gemini prompt box after 10 seconds.`,
				);
			}
		}, 200);
	}

	function pasteIntoBox(promptBox, promptText) {
		promptBox.focus();
		try {
			document.execCommand("insertText", false, promptText);
		} catch (e) {
			console.error(
				`${TAG}: execCommand failed, falling back to textContent`,
				e,
			);
			promptBox.textContent = promptText;
		}

		promptBox.dispatchEvent(
			new InputEvent("input", {
				bubbles: true,
				cancelable: true,
				inputType: "insertText",
				data: promptText,
			}),
		);
	}

	function monitorChatUrl(itemId) {
		let attempts = 0;

		const interval = setInterval(() => {
			attempts++;
			const currentUrl = window.location.href;

			if (CHAT_PATH_RE.test(currentUrl)) {
				clearInterval(interval);
				persistChatUrl(itemId, currentUrl);
			} else if (attempts >= MAX_URL_POLL_ATTEMPTS) {
				clearInterval(interval);
				safe(() => chrome.storage.local.remove(["activePromptItemId"]));
				console.warn(
					`${TAG}: URL monitor timed out after 5 minutes without detecting a chat URL.`,
				);
			}
		}, URL_POLL_INTERVAL_MS);
	}

	function persistChatUrl(itemId, chatUrl) {
		safe(() =>
			chrome.storage.sync.get(["chatHistoryOrder"], (syncData) => {
				if (chrome.runtime.lastError) return;

				const order = (syncData.chatHistoryOrder || []).filter(
					(id) => id !== itemId,
				);
				order.push(itemId);

				const toRemove = [];
				while (order.length > MAX_HISTORY) {
					toRemove.push(`chat_${order.shift()}`);
				}

				const updates = {
					[`chat_${itemId}`]: chatUrl,
					chatHistoryOrder: order,
				};

				safe(() =>
					chrome.storage.sync.set(updates, () => {
						if (chrome.runtime.lastError) {
							console.warn(
								`${TAG}: Failed to save chat URL`,
								chrome.runtime.lastError,
							);
							return;
						}
						if (toRemove.length > 0) {
							safe(() => chrome.storage.sync.remove(toRemove));
						}
						safe(() => chrome.storage.local.remove(["activePromptItemId"]));
					}),
				);
			}),
		);
	}
})();
