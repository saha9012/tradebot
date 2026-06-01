# Prerequisites checklist (Phase 0)

Before live trading, verify each Steam account:

- [ ] Mobile Authenticator active for 7+ days
- [ ] `.env` filled: `ACCOUNT_N_USERNAME`, `ACCOUNT_N_PASSWORD`, `ACCOUNT_N_SHARED_SECRET`, `ACCOUNT_N_IDENTITY_SECRET`
- [ ] Steam Wallet has funds (market purchases use wallet balance)
- [ ] No trade ban / VAC ban on market
- [ ] At least $5 USD spent on Steam (market unlock requirement)
- [ ] Test login via Settings → Login on account-1
- [ ] Start bot with **Dry run** enabled first

Secrets stay in `.env` only — never commit `.env` or `.maFile` files.
