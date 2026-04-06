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

  const tooltip = document.createElement('div');
  tooltip.id = 'ebay-copy-assistant-tooltip';
  tooltip.textContent = '✓ Copied!';

  // Insert button next to the watchlist heart in the image carousel
  const imgBtnContainer = document.querySelector(
    '.ux-image-carousel-buttons.ux-image-carousel-buttons__top-right'
  );
  if (imgBtnContainer) {
    imgBtnContainer.prepend(btn);
    imgBtnContainer.appendChild(tooltip);
  } else {
    // Fallback: floating button
    btn.classList.add('ebay-copy--floating');
    document.body.appendChild(btn);
    document.body.appendChild(tooltip);
    tooltip.classList.add('ebay-copy--floating-tooltip');
  }

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
    let best = '';

    // Strategy 1: Item Specifics "Condition" row (has full expandable text)
    const specRows = document.querySelectorAll('.ux-layout-section-evo__item--table-view .ux-labels-values');
    for (const row of specRows) {
      const label = row.querySelector('.ux-labels-values__labels .ux-textspans')?.textContent?.trim();
      if (label === 'Condition') {
        const spans = row.querySelectorAll('.ux-labels-values__values .ux-textspans');
        spans.forEach((span) => {
          const text = span.textContent?.trim() || '';
          if (/^(Read more|See all)/i.test(text)) return;
          if (text.length > best.length) best = text;
        });
        break;
      }
    }

    // Strategy 2: Standalone condition element (top of page)
    if (!best) {
      const container =
        document.querySelector('.x-item-condition-text') ||
        document.querySelector('[data-testid*="condition"]');
      if (container) {
        const spans = container.querySelectorAll('.ux-textspans');
        spans.forEach((span) => {
          const text = span.textContent?.trim() || '';
          if (/^(Read more|See all)/i.test(text)) return;
          if (text.length > best.length) best = text;
        });
      }
    }

    return best;
  }

  function extractItemSpecifics() {
    const specs = [];
    const rows = document.querySelectorAll(
      '.ux-layout-section-evo__item--table-view .ux-labels-values'
    );
    rows.forEach((row) => {
      const labelEl = row.querySelector('.ux-labels-values__labels .ux-textspans');
      const label = labelEl?.textContent?.trim();
      if (!label) return;

      // Skip "Condition" row — extracted separately by extractCondition()
      if (label === 'Condition') return;

      const valueEls = row.querySelectorAll('.ux-labels-values__values .ux-textspans');
      const values = Array.from(valueEls)
        .map((el) => el.textContent.trim())
        .filter((t) => t && !/^(Read more|See all)/i.test(t));
      const value = values.join(', ');
      if (value) {
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

    // eBay renders feedback cards twice (visible + hidden duplicate).
    // Use .fdbk-container for individual cards and filter by visibility.
    const allCards = Array.from(document.querySelectorAll('.fdbk-container'))
      .filter((card) => card.offsetWidth > 0 && card.offsetHeight > 0);

    for (const card of allCards) {
      if (reviews.length >= 10) break;

      const user = card.querySelector('.fdbk-container__details__info__username')
        ?.textContent?.replace(/- Feedback left by buyer\./i, '')?.trim() || '';
      const time = card.querySelector('.fdbk-container__details__info__divide__time')
        ?.textContent?.trim() || '';
      const comment = card.querySelector('.fdbk-container__details__comment')
        ?.textContent?.trim() || '';
      const item = card.querySelector('.fdbk-container__details__item-link')
        ?.textContent?.trim() || '';

      if (!comment) continue;

      let review = '';
      if (user) review += `[${user}]`;
      if (time) review += ` (${time})`;
      review += `: ${comment}`;
      if (item) review += ` — ${item}`;

      reviews.push(review.trim());
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

      // Fetch via background service worker (bypasses CORS)
      if (iframe.src) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'FETCH_DESCRIPTION',
            url: iframe.src,
          });
          if (response?.success && response.html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.html, 'text/html');
            doc.querySelectorAll('script, style, link').forEach((el) => el.remove());
            const text = doc.body?.textContent?.trim() || '';
            if (text) return text;
          }
        } catch (_) {
          // Message passing failed — try other strategies
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
    if (data.shipping) output += `**Shipping:** ${data.shipping}\n`;
    if (data.condition) output += `**Condition:** ${data.condition}\n`;
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

    if (data.specs.length > 0) {
      output += '\n**Item Specifics:**\n';
      data.specs.forEach((s) => {
        output += `- ${s.label}: ${s.value}\n`;
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
