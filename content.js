(function () {
  'use strict';

  // Prevent double injection
  if (document.getElementById('ebay-copy-assistant-btn')) return;

  const DEFAULT_PREAMBLE = 'Ось інформація про товар з eBay. Допоможи мені оцінити цю пропозицію:';

  // ============================================================
  // UI: Create Floating Button & Tooltip
  // ============================================================

  const btn = document.createElement('button');
  btn.id = 'ebay-copy-assistant-btn';
  btn.title = 'Copy product info for chatbot';
  btn.textContent = '📋';
  document.body.appendChild(btn);

  const tooltip = document.createElement('div');
  tooltip.id = 'ebay-copy-assistant-tooltip';
  tooltip.textContent = '✓ Copied!';
  document.body.appendChild(tooltip);

  let feedbackTimer = null;

  function showSuccess() {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    btn.textContent = '✓';
    btn.classList.add('ebay-copy--success');
    tooltip.textContent = '✓ Copied!';
    tooltip.classList.add('ebay-copy--visible');

    feedbackTimer = setTimeout(() => {
      btn.textContent = '📋';
      btn.classList.remove('ebay-copy--success');
      tooltip.classList.remove('ebay-copy--visible');
      feedbackTimer = null;
    }, 2000);
  }

  function showError(msg) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    btn.textContent = '✗';
    tooltip.textContent = msg || '✗ Copy failed';
    tooltip.classList.add('ebay-copy--visible');

    feedbackTimer = setTimeout(() => {
      btn.textContent = '📋';
      tooltip.textContent = '✓ Copied!';
      tooltip.classList.remove('ebay-copy--visible');
      feedbackTimer = null;
    }, 2500);
  }

  // ============================================================
  // Data Extraction Functions
  // ============================================================

  function extractTitle() {
    const el =
      document.querySelector('.x-item-title__mainTitle .ux-textspans') ||
      document.querySelector('h1.x-item-title__mainTitle') ||
      document.querySelector('h1[itemprop="name"]') ||
      document.querySelector('.x-item-title h1');
    return el?.textContent?.trim() || '';
  }

  function extractPrice() {
    const el =
      document.querySelector('.x-price-primary .ux-textspans') ||
      document.querySelector('[itemprop="price"]') ||
      document.querySelector('.x-bin-price__content .ux-textspans');
    return el?.textContent?.trim() || '';
  }

  function extractCondition() {
    const el =
      document.querySelector('.x-item-condition-text .ux-textspans') ||
      document.querySelector('[data-testid*="condition"] .ux-textspans');
    return el?.textContent?.trim() || '';
  }

  function extractItemSpecifics() {
    const specs = [];
    const rows = document.querySelectorAll(
      '.ux-layout-section-evo__item--table-view .ux-labels-values'
    );
    rows.forEach((row) => {
      const labelEl = row.querySelector('.ux-labels-values__labels .ux-textspans');
      const valueEls = row.querySelectorAll('.ux-labels-values__values .ux-textspans');
      const label = labelEl?.textContent?.trim();
      const values = Array.from(valueEls)
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      const value = values.join(', ');
      if (label && value) {
        specs.push({ label, value });
      }
    });
    return specs;
  }

  function extractShipping() {
    const els = document.querySelectorAll(
      '.ux-labels-values--shipping .ux-labels-values__values .ux-textspans'
    );
    return (
      Array.from(els)
        .map((el) => el.textContent.trim())
        .filter(Boolean)
        .join(' · ') || ''
    );
  }

  function extractReturns() {
    const els = document.querySelectorAll(
      '.ux-labels-values--returns .ux-labels-values__values .ux-textspans'
    );
    return (
      Array.from(els)
        .map((el) => el.textContent.trim())
        .filter(Boolean)
        .join(' ') || ''
    );
  }

  function extractSellerInfo() {
    const nameEl =
      document.querySelector('.x-sellercard-atf__info__about-seller .ux-textspans') ||
      document.querySelector('[data-testid*="seller"] a.ux-textspans');
    const feedbackEls = document.querySelectorAll(
      '.x-sellercard-atf__info__about-seller .ux-textspans--SECONDARY'
    );
    const feedbackTexts = Array.from(feedbackEls)
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    return {
      name: nameEl?.textContent?.trim() || '',
      feedback: feedbackTexts.join(', '),
    };
  }

  function extractSellerReviews() {
    const reviews = [];

    // Try feedback detail cards
    const feedbackCards = document.querySelectorAll('.fdbk-detail-list .card');
    feedbackCards.forEach((card) => {
      const text = card.querySelector('.card__comment .ux-textspans')?.textContent?.trim();
      if (text && reviews.length < 15) reviews.push(text);
    });

    // Try alternate feedback card structures
    if (reviews.length === 0) {
      document.querySelectorAll('.fdbk-detail-list__card').forEach((card) => {
        const text = card.querySelector('.ux-textspans')?.textContent?.trim();
        if (text && text.length > 15 && reviews.length < 15) reviews.push(text);
      });
    }

    // Try data-testid based feedback
    if (reviews.length === 0) {
      document.querySelectorAll('[data-testid*="feedback"] .ux-textspans').forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 20 && reviews.length < 15) {
          reviews.push(text);
        }
      });
    }

    return reviews;
  }

  async function extractDescription() {
    // Strategy 1: Try iframe first (most common on eBay — description is in #desc_ifr)
    const iframe = document.querySelector(
      'iframe#desc_ifr, iframe[src*="ebaydesc"], iframe[src*="vi/description"]'
    );
    if (iframe) {
      // Try same-origin access first
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc?.body?.textContent?.trim()) {
          return iframeDoc.body.textContent.trim();
        }
      } catch (_) {
        // Cross-origin — expected for ebaydesc.com
      }

      // Fetch iframe src content
      if (iframe.src) {
        try {
          const resp = await fetch(iframe.src, { credentials: 'omit' });
          if (resp.ok) {
            const html = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Remove script/style elements for cleaner text
            doc.querySelectorAll('script, style, link').forEach((el) => el.remove());
            const text = doc.body?.textContent?.trim() || '';
            if (text) return text;
          }
        } catch (_) {
          // Fetch blocked — will try other strategies
        }
      }
    }

    // Strategy 2: Direct description container (some listings render inline)
    const descSelectors = [
      '[data-testid="x-item-description-child"]',
      '.d-item-description',
      '.x-item-description',
      '#desc_div',
      '[data-testid="d-item-description"]',
    ];
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Skip if only contains the section heading (~30 chars)
        const text = el.textContent?.trim() || '';
        if (text.length > 60) return text;
      }
    }

    return '';
  }

  // ============================================================
  // Prompt Formatting
  // ============================================================

  function formatPrompt(preamble, data) {
    let output = preamble + '\n\n---\n\n';

    if (data.title) output += `**Product:** ${data.title}\n`;
    output += `**URL:** ${window.location.href}\n`;
    if (data.price) output += `**Price:** ${data.price}\n`;
    if (data.condition) output += `**Condition:** ${data.condition}\n`;

    if (data.specs.length > 0) {
      output += '\n**Item Specifics:**\n';
      data.specs.forEach((s) => {
        output += `- ${s.label}: ${s.value}\n`;
      });
    }

    if (data.shipping) output += `\n**Shipping:** ${data.shipping}\n`;
    if (data.returns) output += `**Returns:** ${data.returns}\n`;

    if (data.seller.name) {
      output += `\n**Seller:** ${data.seller.name}`;
      if (data.seller.feedback) output += ` (${data.seller.feedback})`;
      output += '\n';
    }

    if (data.reviews.length > 0) {
      output += '\n**Seller Reviews:**\n';
      data.reviews.forEach((r) => {
        output += `- "${r}"\n`;
      });
    }

    if (data.description) {
      output += `\n**Description:**\n${data.description}\n`;
    }

    return output.trim();
  }

  // ============================================================
  // Click Handler
  // ============================================================

  btn.addEventListener('click', async () => {
    try {
      btn.style.pointerEvents = 'none'; // Prevent double-clicks

      const data = {
        title: extractTitle(),
        price: extractPrice(),
        condition: extractCondition(),
        specs: extractItemSpecifics(),
        shipping: extractShipping(),
        returns: extractReturns(),
        seller: extractSellerInfo(),
        reviews: extractSellerReviews(),
        description: await extractDescription(),
      };

      // Get preamble from storage
      const storage = await chrome.storage.sync.get({ preamble: DEFAULT_PREAMBLE });
      const prompt = formatPrompt(storage.preamble, data);

      // Copy to clipboard
      await navigator.clipboard.writeText(prompt);
      showSuccess();
    } catch (err) {
      console.error('eBay Copy Assistant: Failed to copy', err);

      // Fallback: try execCommand
      try {
        const ta = document.createElement('textarea');
        ta.value = 'Copy failed — check console for details';
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {
        // ignore fallback failure
      }
      showError('✗ Copy failed');
    } finally {
      btn.style.pointerEvents = 'auto';
    }
  });
})();
