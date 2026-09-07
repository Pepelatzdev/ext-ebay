# eBay Copy Assistant

eBay Copy Assistant — розширення для Google Chrome, яке збирає дані зі сторінки товару eBay, формує готовий промпт і відкриває його у вибраному Google Gemini Gem.

Після створення чату розширення зберігає посилання на звіт і показує його безпосередньо на сторінці відповідного товару.

## Можливості

- визначення формату продажу: **Auction**, **Buy It Now** або **Auction with Buy It Now**;
- збирання назви, ціни, доставки, повернення, стану, характеристик і опису товару;
- збирання імені продавця, рейтингу та до 10 видимих відгуків покупців;
- вибір до 10 фото лише з основної галереї eBay із використанням найбільшої доступної версії;
- формування структурованого Markdown-промпту без query-параметрів у URL товару;
- нормалізація зайвих пробілів і порожніх рядків у промпті;
- опис до 100 000 символів і загальний промпт до 120 000 символів із явною позначкою `[Description truncated]`, якщо текст було обрізано;
- автоматична спроба скопіювати промпт у буфер обміну як fallback при кожному запиті та автоматичне вставлення в Google Gemini;
- плаваюча кнопка **Ask Gemini** у правому нижньому куті, незалежна від структури сторінки eBay;
- дії **Show report** і **Ask again** після збереження посилання на чат; старий звіт залишається доступним, доки replacement-чат не буде успішно збережено;
- синхронізація налаштувань і посилань на звіти між пристроями через `chrome.storage.sync`, якщо у Chrome ввімкнено синхронізацію;
- прив'язка кожного тимчасового Gemini-запиту до конкретної вкладки через `chrome.storage.session`;
- історія до 200 звітів із цільовим бюджетом приблизно 80 KiB у Chrome Sync.

## Підтримувані сайти

Розширення працює на сторінках товарів `/itm/…` у доменах:

- `ebay.com`
- `ebay.co.uk`
- `ebay.de`
- `ebay.fr`
- `ebay.it`
- `ebay.es`
- `ebay.com.au`
- `ebay.ca`
- `ebay.at`
- `ebay.pl`

Для AI-аналізу потрібен доступ до [Google Gemini](https://gemini.google.com/) і налаштований Gemini Gem.

## Встановлення

### Chrome Web Store

1. Відкрийте сторінку [eBay Copy Assistant у Chrome Web Store](https://chromewebstore.google.com/detail/ebay-copy-assistant/ekchfjieilkcaajpefdacpmibbglikip).
2. Натисніть **Add to Chrome** і підтвердьте встановлення.
3. За потреби закріпіть іконку розширення на панелі Chrome для швидкого доступу до **Options**.

Оновлення встановленої версії надходять через Chrome Web Store.

### Встановлення з репозиторію (unpacked)

1. Клонуйте репозиторій:

   ```bash
   git clone https://github.com/Pepelatzdev/ext-ebay.git
   cd ext-ebay
   ```

2. Відкрийте `chrome://extensions/` у Google Chrome.
3. Увімкніть **Developer mode**.
4. Натисніть **Load unpacked** і виберіть кореневу папку проєкту.
5. Після зміни вихідних файлів натисніть **Reload** на картці розширення та оновіть відкриті сторінки eBay/Gemini.

## Використання

1. Відкрийте підтримувану сторінку товару eBay.
2. Натисніть плаваючу кнопку **Ask Gemini** у правому нижньому куті.
3. Виберіть фото в діалозі. Якщо фото не вибирати, буде вставлено лише текст.
4. Розширення збере актуальні дані, спробує скопіювати сформований промпт у буфер обміну як fallback і відкриє налаштований Gemini Gem.
5. Перевірте вставлений промпт і додані окремими файлами фото, після чого надішліть їх у Gemini вручну.
6. Після створення чату поверніться до сторінки товару. Замість **Ask Gemini** з'являться:
   - **Show report** — відкрити збережений чат Gemini;
   - **Ask again** — сформувати новий запит з актуальних даних сторінки, не видаляючи попереднє посилання до успішного збереження replacement-чату.

Якщо Gemini не вставив текст автоматично, а Chrome дозволив запис у буфер обміну, промпт можна вставити вручну.

## Налаштування

Відкрийте сторінку налаштувань через контекстне меню іконки розширення → **Options** або через `chrome://extensions/`.

- **Prompt Preamble** — текст, який додається перед даними товару.
- **Gemini Gem URL** — HTTPS-посилання виду `https://gemini.google.com/gem/…`; наприклад, `https://gemini.google.com/gem/cb9c9074ac8d` є валідним, а `https://gemini.google.com/app/abc123` є URL наявного чату й не приймається як ціль.
- **Reset to Default** — відновлення стандартної преамбули та Gemini Gem URL.

Налаштування синхронізуються через `chrome.storage.sync`; синхронізація між пристроями потребує ввімкненого Chrome Sync.

## Розробка

### Вимоги

- Node.js 22.13 або новіша версія в межах лінійки Node.js 22 — ця лінійка використовується в CI;
- npm;
- Google Chrome із підтримкою Manifest V3;
- системні утиліти `zip` для створення релізного архіву та `unzip` для його перевірки.

### Встановлення залежностей

```bash
npm ci
```

### Тести

```bash
npm test
```

Тести виконуються через Vitest у середовищі jsdom і перевіряють DOM-екстрактори, форматування промпту, стани плаваючого UI, повторний Gemini-запит, release-скрипти та взаємодію з Chrome Web Store API V2 без реальних мережевих запитів.

### Статичний аналіз і форматування

```bash
npm run check
```

### Пакування

```bash
npm run verify:version
npm run pack
npm run verify:package
```

`verify:version` звіряє версію у `manifest.json`, `package.json`, `package-lock.json` та бейджі `index.html`. `pack` готує файли в ізольованій тимчасовій папці, записує production-архів `extension.zip` у корінь репозиторію та завершується з помилкою, якщо архів не вдалося створити. `verify:package` перевіряє Manifest V3, обов'язкові файли й іконки та відсутність development-файлів у ZIP.

Повний локальний набір перевірок перед комітом або релізом:

```bash
npm ci
npm run check
npm test
npm audit --audit-level=high
npm run verify:version
npm run pack
npm run verify:package
```

## Архітектура

- `manifest.json` — Manifest V3, дозволи, host permissions і content scripts;
- `config.js` — стандартні налаштування, обмеження безпеки та селектори eBay;
- `extractors.js` — збирання даних із DOM і форматування промпту;
- `gallery-extractor.js`, `photo-picker.js` — пошук основної галереї та вибір фото користувачем;
- `photo-transfer.js`, `gemini-attachments.js` — контрольоване завантаження фото та підтверджене додавання до Gemini;
- `ui.js` — плаваючий UI, стани **Ask Gemini** / **Show report** і повторний запит;
- `content.js` — запуск UI на сторінці товару й реакція на зміни синхронізованого звіту;
- `gemini-editor.js` — пошук Gemini composer, безпечне вставлення й перевірка тексту;
- `gemini-content.js` — claim/ACK/save flow для запиту, прив'язаного до поточної Gemini-вкладки;
- `request-store.js` — тимчасовий per-tab стан запиту в `chrome.storage.session` і TTL cleanup;
- `report-store.js` — єдиний writer синхронізованої історії звітів із count/byte pruning;
- `message-validation.js` — schema, sender і URL validation для privileged messages;
- `background.js` — service-worker orchestration, безпечне відкриття Gemini та HTTPS-завантаження описів eBay;
- `options.html`, `options.js`, `options.css` — сторінка налаштувань;
- `tests/` — тести Vitest;
- `scripts/pack.js` — створення production ZIP;
- `scripts/verify-package.js` — перевірка складу й manifest готового ZIP;
- `scripts/verify-version.js` — контроль узгодженості версії проєкту та релізу;
- `scripts/cws-publish.js` — upload, polling і publish через Chrome Web Store API V2 з access token від GitHub OIDC.

## Зберігання даних і безпека

- преамбула, Gemini URL та посилання на звіти зберігаються у `chrome.storage.sync`;
- кожний prompt, ID товару та початковий Gemini Gem URL тимчасово зберігаються у `chrome.storage.session` за ID конкретної Gemini-вкладки;
- п'ятихвилинний строк життя запиту починається після відкриття Gemini-вкладки й не поновлюється після вставлення; дозвіл `alarms` забезпечує автоматичне очищення, а перевірка строку під час читання відхиляє запит навіть у разі затримки alarm;
- закриття вкладки очищає лише прив'язаний до неї request;
- після підтвердженої вставки сам текст prompt одразу видаляється із session state;
- вибрані фото завантажуються у service worker лише з HTTPS-хоста `i.ebayimg.com`, по одному з обмеженням 8 MiB і сумарно до 32 MiB; у Gemini вони передаються як окремі файли;
- байти фото не записуються у `chrome.storage.sync` або `chrome.storage.session`, а тимчасовий кеш очищається після підтвердження, закриття вкладки або завершення строку життя запиту;
- історія обмежена 200 звітами та цільовим загальним бюджетом приблизно 80 KiB у `chrome.storage.sync`;
- звіти відкриваються лише за HTTPS-посиланнями на `gemini.google.com`;
- фонове завантаження опису дозволене лише через HTTPS із точного allowlist eBay;
- для Gemini-повідомлень service worker перевіряє Gemini sender URL, цілий sender tab ID і точну schema; для eBay-повідомлень — підтримуваний HTTPS item-page URL, точну schema та відповідність переданого item ID сторінці, якщо повідомлення містить item ID;
- Manifest V3 використовує лише дозволи `storage` та `alarms`, HTTPS-only host access і self-only extension CSP;
- публічна [Privacy Policy](https://pepelatzdev.github.io/ext-ebay/privacy.html) описує обробку, передачу, зберігання та видалення даних.

## CI/CD

Автоматизація розділена на три незалежні workflow:

- `quality.yml` запускається для pull request і кожного push у `main`: встановлює залежності через `npm ci`, виконує Biome, тести, npm audit, перевірку версії, пакування та перевірку ZIP;
- `pages.yml` незалежно публікує `index.html` і `privacy.html` у GitHub Pages після push у `main` або ручного запуску;
- `release.yml` публікує розширення лише для тегів `v*` або після ручного запуску з указаною версією, повторюючи всі quality gates перед публікацією.

Публікація у Chrome Web Store використовує API V2 і короткоживучий access token, який GitHub Actions отримує через Workload Identity Federation. Для environment `chrome-web-store` потрібно додати variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — повне ім’я Google Cloud Workload Identity provider;
- `GCP_SERVICE_ACCOUNT` — email сервісного акаунта з доступом до Chrome Web Store;
- `CHROME_PUBLISHER_ID`;
- `CHROME_EXTENSION_ID`.

Одноразове налаштування репозиторію:

1. У **Settings → Pages → Build and deployment → Source** виберіть **GitHub Actions**.
2. У **Settings → Environments** використовуйте environment `chrome-web-store` і додайте чотири змінні вище.
3. У Google Cloud створіть Workload Identity provider для GitHub repository `Pepelatzdev/ext-ebay`, обмежений гілкою `main` і тегами `v*`, та прив’яжіть його до сервісного акаунта.
4. У Chrome Web Store Developer Dashboard додайте email сервісного акаунта до доступу видавця.
5. За потреби увімкніть required reviewers для `chrome-web-store`, щоб кожна публікація потребувала ручного підтвердження.

Для релізу синхронізуйте версію в усіх файлах, виконайте повний локальний набір перевірок і створіть тег на кшталт `v1.0.3`. Звичайний push у `main` не публікує розширення у Chrome Web Store.

### Ручна smoke-перевірка

Після runtime-змін завантажте unpacked-розширення у Chrome та перевірте:

1. правильні поля для Buy It Now і Auction listings;
2. HTTPS-завантаження cross-origin опису;
3. один prompt в одній правильній Gemini-вкладці;
4. два одночасні listings без змішування prompts або reports;
5. **Ask again** зі збереженим старим **Show report**;
6. автоматичне вставлення при забороненому clipboard;
7. відсутність claim, якщо Gemini editor не з'явився;
8. автоматичне очищення request після закриття вкладки, 5 хвилин очікування вставлення або 30 хвилин після підготовки;
9. вибір однієї чи кількох головних фотографій, успішне додавання їх окремими файлами та ручне надсилання без автоматичної відправки.

## Відомі обмеження

- селектори залежать від DOM eBay і можуть потребувати оновлення після редизайну сайту;
- автоматичне вставлення залежить від структури редактора Google Gemini;
- фото беруться лише з основної галереї та доступні лише коли сторінка відкриває їх через дозволений CDN-хост; окреме фото, яке не завантажилося або не підтвердилося в Gemini, можна повторити або пропустити;
- розширення вставляє промпт, але не надсилає його без підтвердження користувача;
- синхронізація звітів обмежена квотами `chrome.storage.sync`, максимумом у 200 записів і цільовим бюджетом приблизно 80 KiB.

## Ліцензія

[MIT](LICENSE).
