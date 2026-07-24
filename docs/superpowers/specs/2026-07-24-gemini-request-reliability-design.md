# Gemini Request Reliability Design

## Мета

Зробити Gemini flow надійним для одночасної роботи в кількох eBay-вкладках, не вставляти промпт у випадкову Gemini-сесію та не втрачати старий звіт під час Ask again.

Це другий етап hardening-проєкту. Він починається після завершення Release Foundation і не змінює політику storage.sync history, яка належить третьому етапу.

## Основне архітектурне рішення

Service worker стає власником життєвого циклу Gemini-запиту. Один глобальний `pendingPrompt` у `chrome.storage.local` більше не використовується.

Кожний запит прив'язується до конкретної створеної Gemini-вкладки через її `tabId` і зберігається у `chrome.storage.session` під ключем `geminiRequest:<tabId>`.

Session-запис має таку модель:

```text
{
  itemId: string,
  prompt: string | absent,
  createdAt: number,
  state: "pending" | "waiting_for_chat"
}
```

Поле `prompt` видаляється після підтвердженого вставлення. `itemId` залишається до збереження нового URL, закриття вкладки або TTL.

## Компоненти

### eBay UI/content context

Відповідає за:

- збирання даних поточної сторінки;
- нормалізацію та форматування промпту;
- резервне копіювання промпту в clipboard;
- надсилання `START_GEMINI_REQUEST`;
- локальні UI states кнопок.

Він не записує pending request у Chrome storage і не видаляє старий report URL.

### Service worker

Відповідає за:

- перевірку sender, повідомлення, Gemini URL і розміру промпту;
- створення Gemini-вкладки;
- створення request session за отриманим `tabId`;
- видачу запиту лише content script тієї самої вкладки;
- ACK-переходи між request states;
- збереження нового report URL;
- TTL та tab-close cleanup.

### Request store

Окремий `request-store.js` ізолює роботу з `chrome.storage.session`. Він не знає про DOM або UI і надає операції create, read-for-tab, mark-inserted та remove.

### Report store boundary

На цьому етапі створюється мінімальний `report-store.js`, щоб лише service worker записував `chat_<itemId>` і `chatHistoryOrder`. Він зберігає чинну політику history без зміни лімітів. Третій етап розширює цей самий модуль контролем 200 записів, 80 КБ, відновленням order і quota retry.

### Gemini editor adapter

Окремий `gemini-editor.js` відповідає за пошук composer, очікування його появи, вставлення тексту та перевірку результату. `gemini-content.js` залишається оркестратором URL-monitoring і повідомлень.

## Data flow

1. eBay UI формує промпт і намагається записати його в clipboard.
2. UI надсилає `START_GEMINI_REQUEST` з `itemId`, `prompt` і `geminiUrl`.
3. Service worker валідовує повідомлення та відкриває Gemini через `chrome.tabs.create`.
4. Після отримання `tabId` worker створює session-запис і TTL alarm.
5. Gemini content script очікує валідний editor.
6. Після появи editor він надсилає `CLAIM_GEMINI_REQUEST`.
7. Worker використовує `sender.tab.id`, повертає лише відповідний request і не приймає tab ID із payload.
8. Adapter вставляє промпт і перевіряє, що editor містить очікуваний текст.
9. Gemini content script надсилає `ACK_PROMPT_INSERTED`; worker видаляє prompt із session-запису та переводить його в `waiting_for_chat`.
10. Content script спостерігає за URL поточної вкладки.
11. Після появи валідного chat URL він надсилає `SAVE_GEMINI_REPORT`.
12. Worker повторно звіряє sender/tab/session, передає запис report store і після успіху видаляє session-запис та alarm.

Якщо сторінка Gemini перезавантажилася після ACK, новий content script бачить `waiting_for_chat` для власної вкладки та продовжує URL-monitoring без повторного вставлення промпту.

## TTL і cleanup

Request TTL становить 5 хвилин. Для гарантованого очищення використовується `chrome.alarms`, оскільки MV3 service worker може бути призупинений.

Cleanup відбувається при:

- TTL alarm;
- `tabs.onRemoved` для Gemini tab;
- успішному `SAVE_GEMINI_REPORT`;
- виявленні невалідного або пошкодженого session-запису.

Manifest отримує дозвіл `alarms`. Нових host permissions цей механізм не потребує.

## Prompt normalization і limits

Перед форматуванням:

- нерозривні та повторні пробіли нормалізуються;
- пробіли на краях рядків видаляються;
- більше двох послідовних порожніх рядків стискаються до одного розділювача;
- непотрібні порожні рядки на початку та в кінці видаляються.

Опис обмежується 100 000 символами. Якщо він був скорочений, кінець description section обов'язково містить окремий маркер:

```text
[Description truncated]
```

Повний промпт обмежується 120 000 символами. Скорочення спочатку застосовується до description, а структуровані поля товару, URL, ціна, seller, shipping, returns і item specifics мають пріоритет. Фінальний промпт не може втратити маркер truncation, якщо description був скорочений.

## Gemini editor adapter

Adapter:

- використовує впорядкований список конкретних Gemini composer selectors;
- відкидає приховані, disabled або неосновні contenteditable-елементи;
- очікує DOM-зміни через `MutationObserver` з обмеженим таймаутом;
- фокусує editor і використовує Selection/Range та `InputEvent` як основний механізм;
- використовує `document.execCommand("insertText")` лише як compatibility fallback;
- повертає success лише після перевірки вставленого вмісту.

Content script не claim-ить request до появи валідного editor. Якщо editor не з'явився, request залишається до TTL, а clipboard дає можливість ручного вставлення.

## Ask Gemini та Ask again UI

Локальна модель кнопки:

```text
idle -> extracting -> opening -> opened -> idle
                         -> error -> idle
```

Під час активної операції button має `disabled`, `aria-disabled="true"` і `aria-busy="true"`. Це блокує повторну активацію мишею та клавіатурою.

Ask again не викликає видалення старого report URL. Show report залишається активним. Новий URL замінює старий лише після успішного `SAVE_GEMINI_REPORT`.

Clipboard є fallback. Помилка clipboard не блокує автоматичний flow. Якщо Gemini tab відкрився, але session-запис не створився, worker повертає структуровану partial-failure відповідь, щоб UI не показував повний success.

## Обробка помилок

- invalid sender або malformed message отримує контрольовану error response без privileged action;
- disallowed Gemini URL не відкривається;
- tab-create failure не створює session-запис;
- session-create failure не видаляє старий report URL;
- editor timeout не claim-ить і не споживає request;
- insert verification failure не надсилає ACK;
- report-save failure залишає старий report URL і не виконує нескінченних retry;
- закриття Gemini tab очищає лише request цієї вкладки;
- request з однієї Gemini-вкладки не може бути прочитаний іншою вкладкою.

## Тестування

Unit tests покривають:

- request-store state transitions і TTL;
- prompt normalization та обидва limits;
- truncation marker;
- editor selection, timeout, primary insertion і fallback;
- UI disabled/aria states;
- Ask again без видалення старого URL.

Integration tests з fake Chrome API моделюють:

- два одночасні eBay-запити і дві Gemini-вкладки;
- правильне зіставлення prompt/tab/item;
- reload після ACK;
- закриття вкладки;
- TTL cleanup;
- clipboard failure із успішним автоматичним flow;
- невдалий report save без втрати старого звіту.

## Критерії готовності

- глобальні `pendingPrompt` і `activePromptItemId` більше не використовуються;
- два паралельні запити ніколи не обмінюються промптами або item IDs;
- інша Gemini-вкладка не може claim-нути request;
- Ask again не видаляє чинний звіт до появи нового;
- description і prompt limits дотримуються;
- `[Description truncated]` присутній у кожному скороченому описі;
- усі request records гарантовано очищаються за TTL, tab close або success;
- existing extractor та floating UI tests залишаються green.
