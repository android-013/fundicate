# Fundicate

**Fund together. Decide together.** A functional local social-money governance app for the NEAR ecosystem hackathon brief. All treasury activity is explicitly simulated; no real money or blockchain transactions occur.

## Run locally on this Windows computer

Requirements: Node.js 22.12+ with npm, and PostgreSQL binaries. PostgreSQL 18 is already installed on this computer. No hosted service, wallet, OAuth provider, or blockchain credential is needed.

```powershell
cd 'C:\Users\Refat\Documents\git web\Startup\fundicate'
npm ci --legacy-peer-deps
npm run setup
npm run dev
```

Open **http://127.0.0.1:3000**. Use that exact origin; CSRF checks reject other origins unless APP_ORIGIN is changed accordingly.

`setup` initializes a project-local PostgreSQL cluster in ignored `.local/postgres`, binds it only to `127.0.0.1:54329`, creates a random database password in ignored `.env`, generates Prisma Client, applies migrations, and explicitly seeds demo data. It preserves an existing database and never resets user data. To restart the local cluster later, run `npm run db:local`. Stop it with `npm run db:stop` when no app or tests are using it.

The default PostgreSQL binary path is `C:/Program Files/PostgreSQL/18/bin`. Set `PG_BIN` if it differs. On another operating system, set PG_BIN or use an external PostgreSQL instance as below. The cluster owner can create temporary test databases; a deployed application should use a separate least-privilege database role.

Inside a Codex sandbox, background processes can end with the execution cell that started them. Start the database in a retained terminal/session with `npm run db:local -- --keep-alive`, then run the app or tests in a second terminal/session. Type `stop` in the keeper terminal to shut PostgreSQL down cleanly. A different sandbox session may not have permission to signal that process directly.

## Use an existing PostgreSQL database

Create a dedicated empty database, copy `.env.example` to `.env`, then set:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/fundicate"
APP_ORIGIN="http://127.0.0.1:3000"
ALLOW_DEMO_SEED="true"
```

```powershell
npm ci --legacy-peer-deps
npx prisma generate
npm run db:migrate
npm run db:seed
npm run dev
```

Do not run `db:local` for an external database. URL-encode special characters in database credentials. For deployment set the exact HTTPS APP_ORIGIN, use managed secrets, and disable demo seeding. Non-loopback production origins must use HTTPS. HTTPS cookies are Secure, HttpOnly and SameSite=Lax; local loopback HTTP uses a development-compatible HttpOnly cookie.

## Demo accounts and data

The seed is opt-in via ALLOW_DEMO_SEED and refuses NODE_ENV=production. It creates fictional users with password **`FundicateDemo!2026`**:

| Account              | Campus Collective role |
| -------------------- | ---------------------- |
| amara@fundicate.demo | Administrator          |
| sami@fundicate.demo  | Moderator              |
| lena@fundicate.demo  | Moderator              |
| jules@fundicate.demo | Member                 |
| noor@fundicate.demo  | Member                 |
| river@fundicate.demo | Member                 |
| ari@fundicate.demo   | Member                 |
| mina@fundicate.demo  | Pending applicant      |

Sami administers the second community, Neighborhood Commons. User IDs and contribution replay keys are deterministic; fixture content is consistent, deadlines are relative to seed time, and rerunning the seed preserves an already seeded community. Generated proposal and ledger IDs are UUIDs. Do not reuse demo passwords for real accounts.

Campus Collective starts with **$12,450 simulated available funds**, an executed workshop proposal, an approved toolkit allocation, open funding votes, an approved fundraising target, a rejected governance change, and pending/approved applications. Neighborhood Commons has a separate treasury and membership scope.

## Demonstration workflow

1. Register a new account. Create your own community; you become its sole administrator.
2. Discover Campus Collective and apply with a pledge, introduction, and answers. Pledges never transfer funds.
3. Sign in as Amara or Sami. Open Members, review the application, and open a membership ballot. The default admission policy requires a member majority; staff cannot directly override it.
4. Have eligible demo members vote, then finalize after the deadline or once **every** eligible member has voted. The new member is admitted only if quorum and the threshold pass. Mina provides an already pending application to demonstrate this step immediately.
5. As a member, record a simulated contribution in Treasury and submit a funding proposal. Member submissions become drafts; staff open formal ballots. Staff may create/open their own agendas directly.
6. Vote with eligible accounts. Finalize the decision server-side, then separately execute an approved funding allocation as staff. For a quick demonstration, the seeded toolkit proposal is already approved and ready for execution.
7. Inspect Treasury, the execution receipt, and Activity. Repeated execution returns the same receipt; insufficient funds reject the attempt without changing balances.

For a short complete voting cycle without waiting, create a fresh community and register a second account to apply. The initial administrator is the sole eligible admission voter. After admission, both users can vote on a funding decision; finalization is allowed when both have voted.

## Commands and verification

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npm run test:e2e
npm start
# With the seeded app running at APP_ORIGIN:
npm run test:browser
npm run test:accessibility
```

- Unit tests cover exact monetary parsing, quorum, majority, abstentions, two-thirds removal and invalid inputs.
- Integration tests use real PostgreSQL and check auth/session behavior, scoped permissions, admission, snapshots, immutable votes/audits, administrator uniqueness, balanced/reconciled ledgers, idempotency, concurrent overspending, and retained membership history.
- HTTP end-to-end tests cover registration → community creation → application → admission vote → member proposal review → funding vote → approval → simulated execution → treasury/audit → logout, and all 16 required pages.
- Integration and HTTP tests create and migrate a uniquely named `fundicate_test_*` database and drop only that database afterward. The configured database user needs CREATEDB permission. They never reset the demonstration database. `test:e2e` requires a completed production build and temporarily binds port 3001.
- Browser QA checks sign-in, proposal form switching, required pages, desktop/mobile overflow and browser runtime errors, and saves screenshots under ignored `test-results/`. Accessibility checks scan all required routes plus mobile variants with axe WCAG A/AA rules. These use a fresh browser context and a normal seeded demo login session. The runner uses project-local Chromium when installed, otherwise Microsoft Edge. Edge cannot launch in this Codex sandbox, so the recorded checks use Chromium. Automated scans do not replace a full manual accessibility audit.
- `npm run format` formats source, tests, scripts and docs. Webpack is selected for Windows compatibility. The build wrapper runs both supported Next.js compile and generate phases on Windows and precreates nested static output directories to avoid a sandbox directory-creation race; static generation is not skipped. Build/test temp files stay under ignored `.local/`.

To install the same project-local headless Chromium used for verification:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local\browsers'
npx playwright install chromium --only-shell
```

See `docs/VERIFICATION.md` for actual results from the implementation session. `progress.md` tracks phase completion.

## Architecture and important files

| Path                               | Responsibility                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`             | Users, sessions, communities, membership, policy, proposal/agenda aggregate, ballots, ledger, executions, audit, notifications and persistent rate limits |
| `prisma/migrations/`               | Deployable schema, foreign keys, checks, deferred integrity triggers and append-only history                                                              |
| `prisma/seed.ts`                   | Explicit local demo fixtures                                                                                                                              |
| `src/lib/auth.ts`                  | Salted scrypt passwords, hashed random session tokens, expiry/revocation, rate limits                                                                     |
| `src/lib/validation.ts`            | Zod server schemas and exact minor-unit parsing                                                                                                           |
| `src/lib/service.ts`               | Community RBAC, transactional governance and treasury operations                                                                                          |
| `src/lib/governance.ts`            | Pure, testable integer-safe outcome calculation                                                                                                           |
| `src/lib/treasury-adapter.ts`      | Explicit local simulation and future adapter contract                                                                                                     |
| `src/app/api/[operation]/route.ts` | Same-origin JSON mutation endpoints, sessions, validation and safe public errors                                                                          |
| `src/app/(platform)/`              | Dashboard, exploration, community sections and account settings                                                                                           |
| `src/components/`                  | Reusable forms, confirmations, tables, cards, navigation and statuses                                                                                     |
| `tests/`, `scripts/`               | Automated checks, isolated test database runner and local setup                                                                                           |

Agendas and their single proposals form one aggregate rather than two separate tables. There is one lifecycle, one eligible-voter snapshot, and one immutable ballot per decision. Roles are community-scoped. The administrator is a required single Community.adminId reference, with a deferred database constraint requiring an active membership; ordinary membership roles are MEMBER or MODERATOR, so duplicate ADMIN role rows cannot exist.

## Governance rules

- Opening freezes eligible active members. New members do not join existing voter snapshots. A suspended, removed or departed account cannot cast new votes, while its existing valid ballots and snapshot entries remain historical records.
- Every eligible account gets exactly one immutable YES, NO or ABSTAIN ballot. Staff have no extra weight. Admission/removal/suspension-review subjects are excluded from their own ballot.
- Quorum is `ceil(snapshot population × quorum basis points / 10000)`. All valid choices count for participation. Invalid choices are rejected, not recorded.
- Approval uses YES + NO as its denominator, excluding abstentions. Simple majority is strictly more yes than no; configurable thresholds use integer multiplication. Removal always uses exact `yes × 3 >= (yes + no) × 2` plus quorum.
- Voting is accepted only during the opening/closing window. Staff finalize after the deadline or when the entire electorate has voted. No partial early closing is allowed.
- Membership admission defaults to a majority ballot. A governance vote can change future admissions to recorded staff review. Members submit drafts if allowed; staff open agendas. Passed governance changes affect future ballots only.
- Emergency suspension requires a detailed reason and automatically opens a three-day review. A YES majority restores access; a rejected review retains suspension. Formal removal requires its own two-thirds ballot. The current administrator cannot be suspended, leave, or be removed before transferring authority.

## Financial integrity

- All stored amounts and balances are bigint minor units. Currency is fixed per community. Display formatting converts only for presentation; mutation amounts and outcome calculations never trust the client.
- Every transaction has two signed entries, one source and one destination, matching amount/currency/community and summing to zero. Deferred database triggers verify these invariants at commit. Each account balance must equal its full ledger sum.
- Contributions debit an external contra account and credit the treasury. Payouts debit the treasury and credit the paid account. Treasury cannot become negative. Serializability, community row locks, an atomic balance predicate and safe retry prevent competing executions from overspending.
- Contributions have scoped replay keys, and each proposal has one unique funding execution. Retries return the existing matching receipt; a reused key with different parameters is rejected.
- Approval does not reserve funds. Execution separately checks actual available balance. Posted transactions, entries, executions, votes, eligibility and audits cannot be edited or deleted. Corrections require new compensating transactions; no correction UI is supplied in this MVP.

## Limits and next steps

This is a local hackathon MVP, not an audited production financial service. **No NEAR wallet connection, contract, testnet submission, real payment processing, or blockchain reconciliation is implemented.** `docs/NEAR-INTEGRATION.md` describes the exact integration boundary and required wallet, custody, outbox/reservation, nonce, reconciliation and finality work.

Other deliberate limits: no email verification, password reset/change, MFA or admin-transfer password reauthentication; no attachment upload (supporting HTTP/HTTPS links work); no automated deadline worker (staff finalize); no independent secret-ballot protocol; all public community activity and vote choices are transparent; no ledger reversal UI; no per-user payment gateway or real-world custody. Optional HTTPS avatar images load directly in the browser and fall back to initials on failure.

Authentication abuse controls use persistent per-email and global limits; protected actions also have per-user limits. Add a trusted proxy/client-IP strategy for production rather than trusting arbitrary forwarding headers. Expired sessions and rate-limit rows have no scheduled cleanup job. Community discovery lists up to 60 results, proposals/transactions 100, activity 150, and application review 50; full records stay in PostgreSQL and production pagination is future work. Aggregate fundraising goals currently measure lifetime community contributions and may overlap.

Secrets and local databases are ignored by Git. Production still requires HTTPS, database least privilege/backups, operational monitoring, job processing and a security review. Nothing is published or pushed to a hosted service by this local implementation.
