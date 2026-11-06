# Production release boundary

Fundicate is designed to operate independently of a blockchain. Standalone mode is a complete community-governance application with simulated financial execution. It is not a bank, card processor or real-fiat custody service. NEAR testnet is an optional execution provider with explicit native units and independently observed receipts. Neither mode implies mainnet approval, decentralization of off-chain governance, regulatory approval, a public deployment or an external security audit.

## Release configuration

| Setting | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection; never expose it to browsers or logs. |
| `APP_ORIGIN` | Exact HTTP(S) origin; public production origins require HTTPS. Loopback HTTP remains available for local verification. |
| `FUNDICATE_MODE` | `standalone` by default; `near-testnet` only with complete explicit provider configuration. |
| `NODE_ENV` | `production` for serving a release build. |
| `ALLOW_DEMO_SEED` | Must be absent or false in production. |
| `DATABASE_ALLOW_INSECURE_INTERNAL` | Explicit exception for an isolated private database network; never use it for an untrusted network. |
| `NEAR_NETWORK` | Must be `testnet` for the NEAR provider. Mainnet is rejected. |
| `NEAR_RPC_URL` | HTTPS RPC endpoint; avoid embedding API credentials in URLs. |
| `NEAR_CONTRACT_ID` | Explicit named `.testnet` contract account. |
| `MAINTENANCE_ACTOR_ID` | Existing active staff actor for optional bounded maintenance; checked per community/action. |

The web runtime refuses private signing keys. Wallet approvals or a separately protected signer perform actual signing; browser bundles, `.env.example`, logs, image layers and workflow artifacts must never contain private keys. Configure the provider's separately accounted operating reserve before real testnet custody is enabled. Gas/storage expenses must not consume participant principal under the published zero-fee policy.

Run environment validation at runtime rather than requiring secrets during the build. Reuse one reviewed image through staging and production, inject environment at startup, retain the lockfile, and apply additive migrations before moving traffic. Back up before migrations and verify restore procedures in isolated data. A rollback of application code does not authorize reversing or deleting posted financial history.

## Deployment controls

Put an HTTPS reverse proxy in front of the application; limit connection duration, request rate and body size while allowing the published full pairwise ballot size. Keep PostgreSQL private. Use least-privilege database/application identities appropriate to your deployment and a separate migration identity where practical. The provided Compose recipe uses one database role for easy local setup; split this role and rotate its generated credentials for a hardened deployment.

Use secure HTTP-only same-site session cookies on public HTTPS, short reauthentication windows for sensitive authority/wallet changes, database-backed rate limiting and scoped server-side authorization. Configure trusted proxy handling deliberately instead of trusting arbitrary forwarded-client-IP headers. Review CSP against required wallet integrations before enforcing it; do not weaken CSRF/origin checks to make a wallet callback work.

Run a single bounded maintenance job per configured staff actor or allow normal idempotency/concurrency guards to serialize overlap. Export structured operator logs to your monitoring system, alert on failed readiness, unknown external outcomes, liability/custody mismatches and exhausted operating reserve. Do not publish private diagnostics, wallet challenges, session tokens or secret-bearing error stacks.

For multiple web replicas, verify connection-pool capacity, shared rate limits, consistent deployment versions, proxy/cache behaviour and all background-worker ownership. Existing application pages are dynamic and private data must not enter shared CDN caches. The supplied single-host Compose recipe is a portable starting point, not a high-availability cluster.

## What must be verified for a release

Use the canonical Part 5 handoff and current machine receipts as the source of truth. Passing type checks or producing a Dockerfile does not prove a container started. Real testnet completion requires observed deposit, payout and refund finality, successful receipt outcomes and matching signer/receiver/actions/amounts/operation identity. Recovery, money/privacy/authorization, migration, HTTP, browser, accessibility and full production build gates must pass on the final source before claiming that release verified.

Docker execution depends on a functioning Docker Engine/Compose installation; if the development host lacks it, document that packaging-validation limit rather than claiming a container test. Independently review the actual deployed contract and operational custody model before risking valuable assets. Mainnet and hosted publication require a separate explicit user action.
