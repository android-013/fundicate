# Fundicate

**Fund together. Decide together.** A community governance app with passwordless NEAR testnet sign-in. Built for [NEAR HACKATHON 2026](https://nearhackathon.com/).

## In a nutshell

### What it does

Fundicate gives clubs, collectives, and community groups one place to track proposals, votes, and funding decisions that would otherwise be spread across chats and spreadsheets. Members can compare projects, vote under published rules, and see the result in the community’s activity history. Organizers can reuse funding round templates and track participation in analytics.

**How NEAR fits in.** Fundicate uses NEAR Connect to request a signed ownership message from a testnet wallet. The first verified signature creates an account and later sign-ins return to that account. Users enter no email or password, and signing in sends no transaction. Next.js runs the app, and PostgreSQL stores the governance records and simulated ledgers. A separate Rust treasury contract supports optional testnet settlement.

### How to run

Use a supported [Node.js version](package.json), npm, PostgreSQL, and a compatible NEAR testnet wallet. From the repository root, install dependencies and start the local database in one terminal.

```sh
npm ci --legacy-peer-deps
npm run db:local -- --keep-alive
```

Keep that terminal open. In a second terminal, apply the schema and start the app.

```sh
npx prisma generate
npm run db:migrate
npm run dev
```

1. Open [the local sign-in page](http://127.0.0.1:3000/login). Choose **Continue with NEAR testnet**, select your testnet account, and approve the ownership message. The **Dashboard** opens after verification.
2. Choose **Create community** and complete the form. The new community opens with your account as administrator.
3. Open **Proposals → New proposal**, choose **Governance change**, and open voting. In a new community with just your wallet, cast **Yes** and select **Finalize decision**. Open **Activity** to see the recorded result.

The local database helper prepares the ignored `.env`. Use `NEAR_WALLET_LOGIN=true` in your environment. For an existing PostgreSQL instance, configure your own `DATABASE_URL` and exact `APP_ORIGIN` there. See [local setup options](docs/guides/getting-started.md#start-a-local-instance) and the [wallet sign-in guide](docs/guides/testnet-wallet-login.md).

### How to deploy

With Docker Engine and Compose v2, run the following from the repository root. It starts PostgreSQL, applies migrations, and serves Fundicate on `127.0.0.1:3000`.

```sh
node scripts/bootstrap.mjs --docker
```

For a public demo, configure an HTTPS origin and reverse proxy using the [wallet demo deployment guide](docs/guides/testnet-wallet-deployment.md). Keep `FUNDICATE_MODE=standalone` and `NEAR_WALLET_LOGIN=true` for wallet onboarding and simulated funding. Deploying the treasury contract is a separate path for [testnet deposits, payouts, and refunds](docs/guides/near-testnet.md).

## Start here

| I want to… | Read |
| --- | --- |
| Run Fundicate locally and try a complete workflow | [Getting started](docs/guides/getting-started.md) |
| Explore everything members and staff can do | [Documentation home](docs/README.md) |
| Create an account or sign in with a wallet | [NEAR testnet wallet sign-in](docs/guides/testnet-wallet-login.md) |
| Host the wallet sign-in demo | [Wallet demo deployment](docs/guides/testnet-wallet-deployment.md) |
| Deploy, operate or recover a standalone instance | [Deployment and operations](docs/guides/deployment.md) |
| Set up the optional NEAR treasury and verify settlement | [NEAR testnet handoff](docs/guides/near-testnet.md) |
| Understand the application, API and database | [Architecture](docs/reference/architecture.md) · [HTTP API](docs/reference/api.md) · [Data model](docs/reference/data-model.md) |
| Review recorded test passes | [Verification](docs/verification/README.md) |

The [documentation home](docs/README.md) also indexes the delivery plan, the versioned election specifications and the original verification records.

Licensed under the [MIT License](LICENSE).
