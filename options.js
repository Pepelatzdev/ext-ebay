const DEFAULT_PREAMBLE = 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:';

const preambleTextarea = document.getElementById('preamble');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const statusEl = document.getElementById('status');

let statusTimer = null;

// Load saved preamble on page load
chrome.storage.sync.get({ preamble: DEFAULT_PREAMBLE }).then((result) => {
  preambleTextarea.value = result.preamble;
});

// Save button
saveBtn.addEventListener('click', () => {
  const value = preambleTextarea.value.trim();
  if (!value) {
    showStatus('Preamble cannot be empty.', 'error');
    return;
  }
  chrome.storage.sync.set({ preamble: value }).then(() => {
    showStatus('✓ Saved!', 'success');
  });
});

// Reset to default button
resetBtn.addEventListener('click', () => {
  preambleTextarea.value = DEFAULT_PREAMBLE;
  chrome.storage.sync.set({ preamble: DEFAULT_PREAMBLE }).then(() => {
    showStatus('✓ Reset to default!', 'success');
  });
});

function showStatus(message, type) {
  if (statusTimer) clearTimeout(statusTimer);
  statusEl.textContent = message;
  statusEl.className = 'status visible ' + type;
  statusTimer = setTimeout(() => {
    statusEl.className = 'status';
    statusTimer = null;
  }, 2500);
}
