(() => {
	// Check if there is a pending prompt from eBay
	chrome.storage.local.get(
		["pendingPrompt", "activePromptItemId"],
		(result) => {
			const promptText = result.pendingPrompt;
			const itemId = result.activePromptItemId;

			if (!promptText || !itemId) return;

			let attempts = 0;
			const maxAttempts = 50; // 10 seconds total (50 * 200ms)

			const searchInterval = setInterval(() => {
				attempts++;

				// Gemini's input field is a contenteditable div
				const promptBox = document.querySelector('div[contenteditable="true"]');

				if (promptBox) {
					clearInterval(searchInterval);

					// Focus the input box
					promptBox.focus();

					// Use execCommand to insert text, which simulates typing and keeps React/editor state in sync
					try {
						document.execCommand("insertText", false, promptText);
					} catch (e) {
						console.error(
							"eBay Copy Assistant: execCommand failed, falling back to textContent",
							e,
						);
						promptBox.textContent = promptText;
					}

					// Dispatch events to notify Gemini's front-end framework of the changes
					const inputEvent = new InputEvent("input", {
						bubbles: true,
						cancelable: true,
						inputType: "insertText",
						data: promptText,
					});
					promptBox.dispatchEvent(inputEvent);

					// Remove the prompt from storage so it won't paste again on reload/manual navigation
					chrome.storage.local.remove(["pendingPrompt"], () => {
						console.log(
							"eBay Copy Assistant: Prompt successfully pasted. Starting URL monitor...",
						);
					});

					// Monitor the URL. Once it changes to a chat URL, save the link
					const initialUrl = window.location.href;
					const urlCheckInterval = setInterval(() => {
						const currentUrl = window.location.href;
						const isNewChat =
							currentUrl !== initialUrl ||
							currentUrl.includes("/chat/") ||
							currentUrl.includes("/chats/");

						if (isNewChat) {
							clearInterval(urlCheckInterval);

							// Load the current order from sync storage
							chrome.storage.sync.get(["chatHistoryOrder"], (syncData) => {
								let order = syncData.chatHistoryOrder || [];

								// Move item to the end (LRU behavior)
								order = order.filter((id) => id !== itemId);
								order.push(itemId);

								const toRemove = [];
								// If it exceeds the limit (400), shift out the oldest
								while (order.length > 400) {
									const oldestId = order.shift();
									toRemove.push(`chat_${oldestId}`);
								}

								const updates = {
									[`chat_${itemId}`]: currentUrl,
									chatHistoryOrder: order,
								};

								// Save to sync storage
								chrome.storage.sync.set(updates, () => {
									console.log(
										`eBay Copy Assistant: Saved Gemini chat URL to sync: ${currentUrl}`,
									);
									// Delete oldest entries from sync storage if needed
									if (toRemove.length > 0) {
										chrome.storage.sync.remove(toRemove, () => {
											console.log(
												"eBay Copy Assistant: Cleaned up oldest chat links from sync storage:",
												toRemove,
											);
										});
									}
									// Remove activePromptItemId from local storage
									chrome.storage.local.remove(["activePromptItemId"]);
								});
							});
						}
					}, 1000);
				} else if (attempts >= maxAttempts) {
					clearInterval(searchInterval);
					console.warn(
						"eBay Copy Assistant: Could not find Gemini prompt box after 10 seconds.",
					);
				}
			}, 200);
		},
	);
})();
