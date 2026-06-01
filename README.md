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
4. **Dashboard** → Start bot
5. Check **History** and **Logs**

## Games

| Account   | Game | Default        |
|-----------|------|----------------|
| account-1 | Dota | Active < 5000₽ |
| account-2 | CS2  | Disabled stub  |
| account-3 | Rust | Disabled stub  |

Strategy parameters are editable in **Settings** without code changes.
