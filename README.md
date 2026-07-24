# eBay Copy Assistant

eBay Copy Assistant — розширення для Google Chrome, яке збирає дані зі сторінки товару eBay, формує готовий промпт і відкриває його у вибраному Google Gemini Gem.

Після створення чату розширення зберігає посилання на звіт і показує його безпосередньо на сторінці відповідного товару.

## Можливості

- визначення формату продажу: **Auction**, **Buy It Now** або **Auction with Buy It Now**;
- збирання назви, ціни, доставки, повернення, стану, характеристик і повного опису товару;
- збирання імені продавця, рейтингу та до 10 видимих відгуків покупців;
- формування структурованого Markdown-промпту без query-параметрів у URL товару;
- копіювання промпту в буфер обміну та автоматичне вставлення в Google Gemini;
- плаваюча кнопка **Ask Gemini** у правому нижньому куті, незалежна від структури сторінки eBay;
- дії **Show report** і **Ask again** після збереження посилання на чат;
- синхронізація налаштувань і посилань на звіти між пристроями через `chrome.storage.sync`;
- FIFO-історія до 400 звітів.

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
3. Розширення збере актуальні дані, скопіює сформований промпт у буфер обміну та відкриє налаштований Gemini Gem.
4. Перевірте автоматично вставлений промпт і надішліть його в Gemini.
5. Після створення чату поверніться до сторінки товару. Замість **Ask Gemini** з'являться:
   - **Show report** — відкрити збережений чат Gemini;
   - **Ask again** — видалити попереднє посилання та одразу сформувати новий запит з актуальних даних сторінки.

Якщо Gemini не вставив текст автоматично, промпт уже знаходиться в буфері обміну і його можна вставити вручну.

## Налаштування

Відкрийте сторінку налаштувань через контекстне меню іконки розширення → **Options** або через `chrome://extensions/`.

- **Prompt Preamble** — текст, який додається перед даними товару.
- **Gemini Gem URL** — HTTPS-посилання на Gem у домені `gemini.google.com`.
- **Reset to Default** — відновлення стандартної преамбули та Gemini Gem URL.

Налаштування синхронізуються через `chrome.storage.sync`.

## Розробка

### Вимоги

- Node.js 22 — ця версія використовується в CI;
- npm;
- Google Chrome із підтримкою Manifest V3;
- системна утиліта `zip` для створення релізного архіву.

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

`verify:version` звіряє версію у `manifest.json`, `package.json`, `package-lock.json` та бейджі `index.html`. `pack` створює production-архів `extension.zip` в ізольованій тимчасовій папці та завершується з помилкою, якщо архів не вдалося створити. `verify:package` перевіряє Manifest V3, обов'язкові файли й іконки та відсутність development-файлів у ZIP.

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
- `ui.js` — плаваючий UI, стани **Ask Gemini** / **Show report** і повторний запит;
- `content.js` — запуск UI на сторінці товару й реакція на зміни синхронізованого звіту;
- `gemini-content.js` — вставлення промпту в Gemini, визначення URL нового чату та збереження посилання;
- `background.js` — ініціалізація налаштувань, безпечне відкриття Gemini та завантаження описів eBay;
- `options.html`, `options.js`, `options.css` — сторінка налаштувань;
- `tests/` — тести Vitest;
- `scripts/pack.js` — створення production ZIP;
- `scripts/verify-package.js` — перевірка складу й manifest готового ZIP;
- `scripts/verify-version.js` — контроль узгодженості версії проєкту та релізу;
- `scripts/cws-publish.js` — OAuth, upload, polling і publish через Chrome Web Store API V2.

## Зберігання даних і безпека

- преамбула, Gemini URL та посилання на звіти зберігаються у `chrome.storage.sync`;
- промпт, ID активного товару та час запуску тимчасово зберігаються у `chrome.storage.local`;
- невикористаний pending-промпт видаляється після 5 хвилин;
- звіти відкриваються лише за HTTPS-посиланнями на `gemini.google.com`;
- фонове завантаження опису дозволене лише з доменів eBay, зазначених у конфігурації;
- розширення використовує лише дозвіл `storage` та перелічені в `manifest.json` host permissions.

## CI/CD

Автоматизація розділена на три незалежні workflow:

- `quality.yml` запускається для pull request і кожного push у `main`: встановлює залежності через `npm ci`, виконує Biome, тести, npm audit, перевірку версії, пакування та перевірку ZIP;
- `pages.yml` незалежно публікує `index.html` у GitHub Pages після push у `main` або ручного запуску;
- `release.yml` публікує розширення лише для тегів `v*` або після ручного запуску з указаною версією, повторюючи всі quality gates перед публікацією.

Публікація у Chrome Web Store використовує API V2 та OAuth Refresh Token. Для environment `chrome-web-store` потрібно створити repository/environment secrets:

- `CHROME_CLIENT_ID`;
- `CHROME_CLIENT_SECRET`;
- `CHROME_REFRESH_TOKEN`;
- `CHROME_PUBLISHER_ID`;
- `CHROME_EXTENSION_ID`.

Одноразове налаштування репозиторію:

1. У **Settings → Pages → Build and deployment → Source** виберіть **GitHub Actions**.
2. У **Settings → Environments** створіть environment `chrome-web-store` і додайте до нього перелічені secrets.
3. За потреби увімкніть required reviewers для `chrome-web-store`, щоб кожна публікація потребувала ручного підтвердження.

Для релізу синхронізуйте версію в усіх файлах, виконайте повний локальний набір перевірок і створіть тег на кшталт `v1.0.3`. Звичайний push у `main` не публікує розширення у Chrome Web Store.

## Відомі обмеження

- селектори залежать від DOM eBay і можуть потребувати оновлення після редизайну сайту;
- автоматичне вставлення залежить від структури редактора Google Gemini;
- розширення вставляє промпт, але не надсилає його без підтвердження користувача;
- синхронізація звітів обмежена квотами `chrome.storage.sync` і внутрішнім лімітом у 400 записів.

## Ліцензія

MIT (зазначено в `package.json`).
