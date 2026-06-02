# Steam Community Market Bot

Personal Steam Market bot for **Dota 2**, **CS2**, and **Rust** with a local React dashboard.

## Quick start

```bash
cp .env.example .env
# Fill ACCOUNT_1_* credentials (see accounts/PREREQUISITES.md)

npm install
npm run dev
```

- API: http://localhost:3000
- UI: http://localhost:5173

## Фоновый режим (бот отдельно от UI)

Бот живёт в **сервере** (`packages/server`). UI только смотрит логи и настройки.

**Только бот** (можно закрыть терминал с Vite, UI не нужен):

```bash
npm run bot
```

В другом терминале — UI при разработке интерфейса:

```bash
npm run dev:ui
```

Или бот с автоперезагрузкой кода:

```bash
npm run dev:bot
```

После **Start** на дашборде состояние `running` сохраняется в SQLite. При перезапуске `npm run bot` бот **сам поднимется** (если `BOT_AUTO_START=true`).

- `BOT_AUTO_LOGIN=false` — вход только кнопкой «Войти в Steam»  
- `BOT_AUTO_START_SCAN=false` — не возобновлять поиск на маркете после перезапуска  
- `BOT_AUTO_START_SELL=true` — возобновить продажу из инвентаря, если была включена  

**Два режима на обзоре:** «Поиск» (тяжёлый) и «Продажа из инвентаря» (лёгкий, можно держать включённым).  

**Трейд-бан 15 дней** не мешает тесту: при **Dry run** ордера не выставляются; покупки на Community Market обычно доступны и без трейдов.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

- UI: http://localhost:5173
- API: http://localhost:3000

## Structure

```
packages/server   — Express API, Steam login, bot engine, market scanner
packages/web      — React dashboard (purple/glass theme)
accounts/         — Credential docs (secrets in .env only)
data/             — SQLite database (gitignored)
```

## Workflow

1. Configure `.env` with Steam credentials per account (`ACCOUNT_1_*`, etc.)
2. Open **Settings** → Login on Dota account
3. Keep **Dry run** enabled until strategy is verified
4. **Обзор** → «Старт продажа» (лёгкий режим) и при необходимости «Старт поиск»
5. Check **History** and **Logs**

## Games

| Account   | Game | Default        |
|-----------|------|----------------|
| account-1 | Dota | Active < 5000₽ |
| account-2 | CS2  | Disabled stub  |
| account-3 | Rust | Disabled stub  |

Strategy parameters are editable in **Settings** without code changes.
