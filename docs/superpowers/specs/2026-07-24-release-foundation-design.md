# Release Foundation Design

## Мета

Зробити публікацію eBay Copy Assistant передбачуваною та безпечною: звичайний push у `main` не повинен публікувати розширення, а Chrome Web Store release не може початися без успішних тестів, статичного аналізу, dependency audit, перевірки пакета та узгодженої версії.

Це перший із трьох послідовних етапів hardening-проєкту. Його потрібно завершити до runtime-змін, щоб наступні push у `main` не запускали неконтрольовану production-публікацію.

## Межі етапу

Етап охоплює:

- поділ GitHub Actions на quality, GitHub Pages і Chrome Web Store release;
- міграцію Chrome Web Store API з V1.1 на V2;
- збереження OAuth refresh token як способу автентифікації;
- release лише за тегом `v*` або через `workflow_dispatch`;
- перевірку версій у Git tag/manual input, `manifest.json`, `package.json` та `index.html`;
- виправлення пакувальника та автоматичну перевірку ZIP;
- оновлення dev-залежностей до версій без відомих high-severity проблем;
- видалення застарілого локального CRX-механізму.

Етап не змінює runtime-поведінку Ask Gemini, зберігання звітів або DOM-екстрактори.

## Структура workflows

### Quality workflow

`quality.yml` запускається для pull request і push у `main`. Він виконує:

1. checkout;
2. Node.js 22 з npm cache;
3. `npm ci`;
4. Biome check;
5. Vitest;
6. `npm audit` з порогом high severity;
7. production packaging;
8. package verification.

Workflow використовує read-only permissions, окрім прав, безпосередньо необхідних GitHub для отримання коду.

### GitHub Pages workflow

`pages.yml` запускається на push у `main` і вручну. Він публікує статичний сайт незалежно від Chrome Web Store release через офіційні GitHub Pages actions. На першому етапі сайт містить `index.html`; після третього етапу до артефакту автоматично потрапляє `privacy.html`.

### Chrome Web Store release workflow

`release.yml` запускається лише:

- за Git tag, що відповідає `v*`;
- через `workflow_dispatch` з обов'язковим input `version`.

Release повторює всі quality gates, навіть якщо той самий commit вже пройшов `quality.yml`. Це усуває залежність production-публікації від стану іншого workflow.

Для production job використовується GitHub Environment `chrome-web-store`. У repository settings можна увімкнути required reviewers. Concurrency group не допускає паралельних release jobs.

## Chrome Web Store API V2

Автентифікація залишається на OAuth refresh token. Workflow отримує короткоживучий access token через Google OAuth endpoint і перевіряє:

- успішний HTTP status;
- наявність непорожнього `access_token`;
- відсутність OAuth error у JSON.

Потрібні secrets:

- `CHROME_CLIENT_ID`;
- `CHROME_CLIENT_SECRET`;
- `CHROME_REFRESH_TOKEN`;
- `CHROME_PUBLISHER_ID`;
- `CHROME_EXTENSION_ID`.

ZIP завантажується через V2 media upload endpoint. Якщо API повертає `UPLOAD_IN_PROGRESS`, workflow опитує fetch-status endpoint з обмеженою кількістю спроб. Publish виконується лише після підтвердженого успішного upload. Усі `curl` виклики використовують fail-on-HTTP-error поведінку, а JSON-відповіді проходять явну перевірку через `jq`.

## Версіювання

`manifest.json` є канонічним джерелом версії runtime-пакета.

Перед release скрипт перевіряє, що однакове значення мають:

- `manifest.json.version`;
- `package.json.version`;
- version badge в `index.html`;
- Git tag без префікса `v` або manual input `version`.

Будь-яка розбіжність завершує workflow до upload. Автоматичного переписування версії під час release немає: зміна версії має бути окремим видимим commit.

## Пакування

`scripts/pack.js` повинен:

- створювати чистий production ZIP;
- повертати ненульовий exit code при будь-якій помилці;
- не залишати тимчасову директорію;
- включати лише явно дозволені runtime-файли;
- не залежати від `manifest.key` або `update_url`.

Окремий package verification test розпаковує ZIP у тимчасову директорію та перевіряє:

- Manifest V3 і очікувану версію;
- наявність усіх content scripts, service worker, options-файлів та іконок;
- відсутність тестів, документації, приватних ключів, `key` і `update_url`;
- відсутність посилань у manifest на файли, яких немає в архіві.

## Залежності та npm scripts

Dev-залежності оновлюються так, щоб `npm audit --audit-level=high` не знаходив high-severity advisories. Після оновлення обов'язково проходять усі тести та Biome.

У `package.json` додаються стабільні команди для quality, formatting check, packaging, package verification та version verification. Workflows викликають npm scripts, а не дублюють локальну логіку shell-командами.

## Видалення CRX-era конфігурації

З `manifest.json` видаляються `key` і `update_url`. Файл `scripts/generate-key.js` видаляється. Unpacked-режим не гарантує Store ID, оскільки розширення не має функціональної залежності від стабільного локального ID.

## Обробка помилок

- помилка dependency install, test, Biome, audit, version check або package verification зупиняє release;
- помилка zip повертає ненульовий exit code;
- відсутній або порожній OAuth token зупиняє workflow;
- unexpected upload/publish state зупиняє workflow;
- невдалий Chrome Web Store release не блокує окремий GitHub Pages workflow;
- GitHub Pages deployment не може спричинити Chrome Web Store release.

## Критерії готовності

- push у `main` запускає quality і Pages, але не Chrome Web Store upload;
- тег `v<manifest-version>` або валідний manual input запускає release;
- release неможливий при failing test, Biome issue, high-severity audit, invalid ZIP або version mismatch;
- Web Store workflow використовує лише V2 endpoints;
- package failure коректно повертає failure;
- `manifest.key`, `update_url` і `scripts/generate-key.js` відсутні;
- робоче дерево чисте, а README описує фактичний release flow.

