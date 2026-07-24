# Storage, Security and Compliance Design

## Мета

Завершити hardening eBay Copy Assistant: контролювати фактичну квоту синхронізованих звітів, звузити trust boundaries Manifest V3, прибрати небезпечні або застарілі DOM-патерни та опублікувати точну Privacy Policy і MIT license.

Це третій етап. Він починається після Release Foundation і Gemini Request Reliability та використовує створений на другому етапі service-worker report flow.

## Report storage boundary

Усі операції зі звітами виконуються service worker через створений на другому етапі `report-store.js`. На цьому етапі модуль отримує quota policy, нормалізацію history та retry-поведінку. eBay та Gemini content scripts не записують `chat_<itemId>` або `chatHistoryOrder` напряму.

Синхронізовані settings залишаються в `chrome.storage.sync`:

- `preamble`;
- `geminiUrl`.

Report data:

- `chat_<itemId>` — валідований HTTPS URL на `gemini.google.com`;
- `chatHistoryOrder` — впорядкований список item IDs без дублікатів.

## Quota policy

Історія має два обмеження:

- максимум 200 report URLs;
- цільовий загальний бюджет `chrome.storage.sync` — приблизно 80 КБ.

80 КБ включають settings, order і report URLs, залишаючи запас до системної квоти. Перед та після запису store використовує `chrome.storage.sync.getBytesInUse()`.

Алгоритм save:

1. прочитати та нормалізувати order;
2. видалити дублікати й посилання на відсутні report keys;
3. перемістити поточний item ID у кінець order;
4. підготувати новий report URL;
5. якщо count перевищує 200, позначити найстаріші keys для pruning;
6. оцінити projected usage та додати до pruning найстаріші keys, доки projected usage не вкладається в 80 КБ;
7. записати новий URL та order;
8. видалити позначені старі keys;
9. перевірити фактичний bytes-in-use;
10. при quota error виконати додаткове pruning і одну повторну спробу.

Поточний старий `chat_<itemId>` не видаляється до спроби запису replacement. Немає нескінченних retry. Пошкоджений order відновлюється з валідних report keys.

## Message security

Кожний privileged message має окрему schema validation function.

Для eBay sender перевіряються:

- `https:`;
- hostname з явного allowlist підтримуваних eBay-доменів;
- шлях `/itm/<numeric-id>`;
- збіг item ID у URL і message payload, якщо payload містить item ID.

Для Gemini sender перевіряються:

- `https:`;
- точний hostname `gemini.google.com`;
- наявність `sender.tab.id`;
- session-запис для тієї самої вкладки.

Service worker не приймає tab ID від content script як authority. Description fetch приймає лише HTTPS URL з наявного host allowlist. Gemini URL і report URL приймаються лише як HTTPS URL точного домену Gemini.

Невідомі message types і зайві privileged payload fields не запускають дій.

## Manifest hardening

- усі eBay content-script matches використовують `https://`;
- description host permissions використовують HTTPS-only;
- permissions містять лише `storage` та `alarms`;
- додається explicit extension-pages CSP, що дозволяє лише packaged scripts/resources;
- не додаються `tabs`, `scripting`, `unlimitedStorage` або широкі Google permissions;
- manifest не містить `key`, `update_url` або web-accessible resources без фактичної потреби.

## Safe UI construction

`ui.js` більше не збирає button markup через `innerHTML`. Іконки створюються DOM/SVG factory з фіксованими path definitions, а labels — через `textContent`.

Жодний текст із eBay DOM, storage, URL або user settings не інтерпретується як HTML. Dynamic class names обмежені локальними enum-значеннями success/error/state.

Невикористані `SVG.copy`, `FLOATING_CLASS`, `watchContainer`, `watchButton` та застарілі коментарі видаляються.

CSS отримує:

- disabled state;
- `prefers-reduced-motion` fallback;
- наявні focus-visible styles;
- збереження safe-area offsets та mobile layout.

## Privacy Policy

Створюється `privacy.html`, стилістично сумісний з landing page, але придатний для читання без JavaScript.

Політика точно описує:

- читання title, price, condition, shipping, returns, seller information, visible reviews, item specifics, description і listing URL після явного кліку користувача;
- формування prompt локально в браузері;
- копіювання prompt у clipboard;
- тимчасове зберігання prompt у `chrome.storage.session` до 5 хвилин;
- передавання prompt у налаштований користувачем Google Gemini;
- збереження settings і report URLs у Chrome Sync;
- відсутність власного backend, analytics, advertising або продажу даних;
- одержувача даних Google Gemini та залежність від політик Google;
- retention, автоматичне очищення і видалення даних через Chrome settings/uninstall;
- контакт розробника;
- дату останнього оновлення;
- відповідність Chrome Web Store Limited Use requirements.

Посилання на Privacy Policy додаються до:

- footer `index.html`;
- Options page;
- README;
- Chrome Web Store Developer Dashboard як ручний release checklist item.

Landing page має коротке, помітне пояснення, що після кліку розширення передає дані поточного listing у Google Gemini для заявленого аналізу.

## License та документація

У корені створюється повний MIT `LICENSE` із відповідним copyright holder/year.

README оновлюється відповідно до фактичної реалізації:

- API V2 і нові workflows;
- release triggers і secrets;
- per-tab session flow та TTL;
- нові prompt limits і truncation marker;
- максимум 200 reports та 80 КБ quota target;
- дозволи `storage` і `alarms`;
- Privacy Policy URL;
- manual smoke checklist;
- точна поведінка Ask again.

Твердження про cleanup пояснює, що alarm видаляє pending request через 5 хвилин, а не лише ігнорує його під час наступного відкриття Gemini.

## Тестування

Unit tests покривають:

- нормалізацію corrupted/duplicate order;
- count pruning до 200;
- byte-budget pruning до 80 КБ;
- replacement існуючого report;
- quota failure і одну retry;
- sender allowlists і rejection HTTP/unsupported domains;
- message payload limits;
- safe DOM/SVG factory;
- privacy links в landing/options;
- manifest permissions, HTTPS patterns і CSP.

Integration/package tests перевіряють:

- запис нового report через service worker;
- реакцію eBay UI на `storage.onChanged`;
- збереження старого report при failed replacement;
- наявність `privacy.html` у Pages artifact;
- наявність `LICENSE` у repository та посилання в README;
- production ZIP без test/docs/site-only файлів.

Manual smoke checklist включає:

- щонайменше одну Buy It Now і одну Auction listing;
- сторінку з cross-origin description iframe;
- Ask Gemini і Ask again;
- дві одночасні eBay/Gemini пари;
- ручне вставлення з clipboard при editor failure;
- mobile viewport і keyboard navigation;
- Options save/reset і Privacy Policy link.

## Обробка помилок

- storage corruption відновлюється з валідних entries;
- quota error не викликає нескінченний цикл;
- invalid sender або payload не змінює storage й не відкриває tab;
- HTTP description URL відхиляється;
- privacy/site deployment failure не запускає Web Store release;
- відсутній Privacy Policy URL або version mismatch зупиняє release verification після інтеграції цього етапу.

## Критерії готовності

- report history не перевищує 200 записів або 80 КБ target;
- settings і report URLs продовжують синхронізуватися між пристроями;
- усі privileged messages проходять sender/schema validation;
- усі runtime match/fetch URL використовують HTTPS;
- UI не використовує `innerHTML` для побудови кнопок;
- Privacy Policy опублікована й доступна з landing, Options, README та Store Dashboard;
- MIT `LICENSE` присутній;
- README точно відповідає runtime і CI/CD;
- автоматичні тести, Biome, audit, package verification і manual smoke checklist пройдені.
