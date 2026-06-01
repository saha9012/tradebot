# Steam account credentials

Secrets are loaded from `.env` only — not from the web UI.

See [PREREQUISITES.md](./PREREQUISITES.md) for the full checklist before live trading.

## Account 1 (Dota)

```
ACCOUNT_1_USERNAME=your_login
ACCOUNT_1_PASSWORD=your_password
ACCOUNT_1_SHARED_SECRET=from_maFile
ACCOUNT_1_IDENTITY_SECRET=from_maFile
```

## Account 2 (CS2)

```
ACCOUNT_2_USERNAME=
ACCOUNT_2_PASSWORD=
ACCOUNT_2_SHARED_SECRET=
ACCOUNT_2_IDENTITY_SECRET=
```

## Account 3 (Rust)

```
ACCOUNT_3_USERNAME=
ACCOUNT_3_PASSWORD=
ACCOUNT_3_SHARED_SECRET=
ACCOUNT_3_IDENTITY_SECRET=
```

Copy `.env.example` to `.env` and fill in values.
