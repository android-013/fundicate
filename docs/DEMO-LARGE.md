# Isolated hundred-member demonstration

```text
node scripts/demo-large.mjs --isolated
```

Prerequisites are the installed Node dependencies, a reachable PostgreSQL server with permission to create a database, and current migrations. `DATABASE_URL` supplies connection access; its existing database is never seeded or reset. The command refuses production and creates a unique `fundicate_demo_large_TIMESTAMP_PID` database, migrates it, then performs the real application service workflow with an isolated fictional clock.

The fixture creates exactly 100 fictional people, one community denominated in BDT, one administrator, two moderators, and three schemes. Every member contributes a simulated 1,000 BDT, producing 100,000 BDT (`10000000` minor units). All 100 participants screen all three schemes. The subsequent FPTP result is 60/25/15, recorded as immutable V4 ballots. Before closing selection, service reads prove that anonymous and other-user views expose neither ballots nor results, and that a member can see only their own ballot.

The winning scheme requests 60,000 BDT. The exact published winner-all plan pays that amount, refunds the unused 40,000 BDT to the 100 original contributors at 400 BDT each, and leaves no held/reserved principal. The script asserts source refund counts/amounts, posting status, conservation and replay idempotency. These are fictional local ledger records, never real money or blockchain receipts.

The isolated database remains available afterward for exploration. The command prints its generated database name and source links. To preview it, use a separate ignored environment file or a separate terminal's environment, preserve the host/user/password from your existing connection and replace only the database name. Set a distinct `APP_ORIGIN`/port and start a production build or local development server. Do not overwrite the normal `.env` or run a destructive reset command.

The demonstration login is `fictional001@fundicate.invalid`, with the explicitly fictional password `FictionalDemo!2026`. The password is present only in the opt-in isolated demo, never a production seed. All people have clearly fictional names and addresses under the reserved `.invalid` domain. Do not migrate this database into production or expose it publicly.

The separate payment register contains fictional external contribution, payout and refund attestations, plus an intentional mistake and its full-source reversal. The script proves that net totals exclude the corrected original, all five records remain preserved, and simulated received/paid/refunded amounts are unchanged. These attestations are independently unverified and move no money. Blockchain execution is disabled on this standalone branch. Consult the Part 5 receipts for what actually ran.
