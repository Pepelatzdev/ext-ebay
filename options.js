const DEFAULT_PREAMBLE =
	"Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:";
const DEFAULT_GEMINI_URL = "https://gemini.google.com/gem/cb9c9074ac8d";

const preambleTextarea = document.getElementById("preamble");
const geminiUrlInput = document.getElementById("gemini-url");
const saveBtn = document.getElementById("save-btn");
const resetBtn = document.getElementById("reset-btn");
const statusEl = document.getElementById("status");

let statusTimer = null;

// Load saved options on page load
chrome.storage.sync
	.get({ preamble: DEFAULT_PREAMBLE, geminiUrl: DEFAULT_GEMINI_URL })
	.then((result) => {
		preambleTextarea.value = result.preamble;
		geminiUrlInput.value = result.geminiUrl;
	});

// Save button
saveBtn.addEventListener("click", () => {
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

	chrome.storage.sync
		.set({ preamble: preambleValue, geminiUrl: geminiUrlValue })
		.then(() => {
			showStatus("✓ Saved!", "success");
		});
});

// Reset to default button
resetBtn.addEventListener("click", () => {
	preambleTextarea.value = DEFAULT_PREAMBLE;
	geminiUrlInput.value = DEFAULT_GEMINI_URL;
	chrome.storage.sync
		.set({ preamble: DEFAULT_PREAMBLE, geminiUrl: DEFAULT_GEMINI_URL })
		.then(() => {
			showStatus("✓ Reset to default!", "success");
		});
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
