/* biome-ignore-all lint/correctness/noUnusedVariables: classic script module API */
var ECAOptionsView = (() => {
	function create({ document, client, policy: ECA }) {
		const preambleTextarea = document.getElementById("preamble");
		const geminiUrlInput = document.getElementById("gemini-url");
		const saveBtn = document.getElementById("save-btn");
		const resetBtn = document.getElementById("reset-btn");
		const statusEl = document.getElementById("status");

		let statusTimer = null;

		async function load() {
			const result = await client.getSettings();
			preambleTextarea.value = result.preamble;
			geminiUrlInput.value = result.geminiUrl;
		}
		load().catch((error) =>
			showStatus(`Load failed: ${error.message}`, "error"),
		);

		function isValidGeminiUrl(rawUrl) {
			return ECA.isGeminiGemUrl(rawUrl);
		}

		// Save button
		saveBtn.addEventListener("click", async () => {
			const preambleValue = preambleTextarea.value.trim();
			const geminiUrlValue = geminiUrlInput.value.trim();

			if (!preambleValue) {
				showStatus("Preamble cannot be empty.", "error");
				return;
			}
			if (!geminiUrlValue) {
				showStatus("Gemini URL cannot be empty.", "error");
				return;
			}
			if (!isValidGeminiUrl(geminiUrlValue)) {
				showStatus(
					`Use a Gemini URL such as https://${ECA.GEMINI_HOST}/app.`,
					"error",
				);
				return;
			}

			try {
				await client.saveSettings({
					preamble: preambleValue,
					geminiUrl: geminiUrlValue,
				});
				showStatus("✓ Saved!", "success");
			} catch (error) {
				showStatus(`Save failed: ${error.message}`, "error");
			}
		});

		// Reset to default button
		resetBtn.addEventListener("click", async () => {
			preambleTextarea.value = ECA.DEFAULT_PREAMBLE;
			geminiUrlInput.value = ECA.DEFAULT_GEMINI_URL;
			try {
				await client.saveSettings({
					preamble: ECA.DEFAULT_PREAMBLE,
					geminiUrl: ECA.DEFAULT_GEMINI_URL,
				});
				showStatus("✓ Reset to default!", "success");
			} catch (error) {
				showStatus(`Reset failed: ${error.message}`, "error");
			}
		});

		// Reflect changes made in another tab/device.
		client.onChanged((changes, area) => {
			if (area !== "sync") return;
			if (changes.preamble) preambleTextarea.value = changes.preamble.newValue;
			if (changes.geminiUrl) geminiUrlInput.value = changes.geminiUrl.newValue;
		});

		function showStatus(message, type) {
			if (statusTimer) clearTimeout(statusTimer);
			statusEl.textContent = message;
			statusEl.className = `status visible ${type}`;
			statusTimer = setTimeout(() => {
				statusEl.className = "status";
				statusTimer = null;
			}, 2500);
		}

		return { showStatus };
	}
	return { create };
})();
