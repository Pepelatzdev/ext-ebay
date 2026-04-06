const DEFAULT_PREAMBLE = 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ preamble: DEFAULT_PREAMBLE });
  }
});
