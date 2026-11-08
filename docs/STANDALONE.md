# Standalone Fundicate

The user approved this product branch on 7 November 2026: community governance and transparent external-payment tracking. Wallets, RPC access, blockchain credentials and payment-provider accounts are unnecessary. The web app does not collect, hold, pay or refund real money. No hosted deployment is included.

## Product boundaries

- Communities retain membership governance, proposals, six election methods, published allocation rules, vetoes, reputation, networking, dashboards, saved views and CSV.
- Existing treasury and funded-round workflows remain explicitly **simulated**. Their immutable accounting and published rule versions are preserved. A simulated CONFIRMED entry is a database posting, never proof of a real payment.
- **Payment records** is a separate member-only community page. Active staff may record an externally handled contribution, payout or refund, reference, note, optional HTTPS evidence and occurrence time. Each entry is a staff attestation and independently unverified. An evidence link is not fetched or verified by Fundicate. Staff must avoid including account credentials or sensitive banking documents in member-visible notes/links.
- The reference is unique within its community. Identical retries by the same recorder reuse the record; different payloads or actors conflict. Amounts use exact two-decimal currency units matching the community. Current/former community members can be named as counterparties; round associations require a published, non-cancelled round.
- Mistakes are corrected with a full-source **reversal record** and a reason; originals cannot be edited/deleted. A reversal corrects the register and does not send a refund. Net totals omit reversed originals and include the complete community cohort, while the table/CSV is explicitly paginated at 100 rows.
- External records never credit the simulated ledger, change voting weights, reserve funds or confer settlement rights. Contribution-weighted elections remain tied to their versioned simulated funding basis. Real-payment-weighted elections and automated real collections/payouts would require a separately specified and verified integration.
- Chain/wallet APIs and pages are retired. Blockchain modes are rejected. Old database models, historical evidence and unreferenced server/contract code remain for provenance; they cannot be enabled through configuration on this branch.

## Run and verify

Use Node.js 22.23.4+, 24.22.1+ or 26.12.1+ on those supported release lines and PostgreSQL, configure the ignored `.env` from `.env.example`, run `npm ci --legacy-peer-deps`, `npx prisma generate`, `npm run db:migrate`, `npm run doctor`, `npm run build`, then `npm start`. Set `FUNDICATE_MODE=standalone`. Demo seeding is an explicit development option, never part of production bootstrap. The local keeper instructions in AGENTS.md apply in Codex.

Database-backed tests use unique disposable databases; they never reset the user's database. Build before HTTP/browser suites and serialize suites using port 3001. `npm run test:payments` includes domain, hostile-input, SQL guard, browser and axe coverage. `npm run test:security` tests retired endpoints, CSRF, body limits, SQL-shaped inputs, rate-limit concurrency/expiry, canonical accounts, private errors and revoked sessions. All other regression suites remain available.

## Public deployment limits

Deploy only after explicit authorization. Use TLS, verified database transport (or a deliberately isolated private container network), tested backups, monitored jobs and protected secrets. A public production origin requires an explicitly trusted `x-real-ip` or `cf-connecting-ip` header: the reverse proxy must **overwrite** it, and block direct access to the application. Unconfigured clients cannot supply trusted IPs; spoofed forwarding headers are ignored by default. Per-account and global database-backed fixed-window quotas remain effective without IP trust in local use. Public authentication fails closed if this proxy policy is missing. Fixed-window quotas do not replace edge denial-of-service controls.

Compose runs migrations/provisioning with owner credentials, then runs the web/maintenance services as `fundicate_app` with DML rights and no superuser/schema ownership. Bootstrap extends older ignored container configuration with a separate runtime credential while preserving existing owner credentials and database volumes. Re-run provisioning after migrations. The runtime role can read application authentication data as required by the service; it is not an isolation boundary against a fully compromised application.

Account email verification, self-service recovery and MFA are not implemented; public-launch policy and external delivery setup remain necessary before broad onboarding. No independent penetration test, hosted infrastructure assessment or container operating-system vulnerability scan is claimed. See the dated audit and actual check receipts for verified scope and residual risk.
