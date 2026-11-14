# Getting started

[Documentation home](../README.md)

You can run Fundicate on your computer with Node.js, npm and PostgreSQL. Bring a NEAR testnet wallet to try the app. Use a dedicated local database for experiments. The supported Node.js ranges are declared in [package.json](../../package.json).

## Start a local instance

From the repository root, install the locked dependencies and start the loopback PostgreSQL cluster.

```powershell
npm ci --legacy-peer-deps
npm run db:local -- --keep-alive
```

Keep that terminal open. The helper stores the cluster in the ignored `.local/postgres` directory, listens on `127.0.0.1:54329` and prepares an ignored `.env` for local use. On Windows the default PostgreSQL binaries are under `C:/Program Files/PostgreSQL/18/bin`. Set `PG_BIN` to the installed binaries directory when using a different location.

In a second terminal, generate the database client, apply migrations and run the app.

```powershell
npx prisma generate
npm run db:migrate
npm run dev
```

Open [Fundicate on loopback](http://127.0.0.1:3000). Use the exact origin configured in `APP_ORIGIN`. For a separately provisioned PostgreSQL server, configure the ignored `.env` from [.env.example](../../.env.example), then run the client, migration and app commands. Follow [wallet sign-in](testnet-wallet-login.md) to open your dashboard. Type `stop` in the keeper terminal when you finish and the app and tests have stopped.

### Load the fictional test data

Set `ALLOW_DEMO_SEED="true"` in the ignored environment file for your intended development database, then run `npm run db:seed`. The seed preserves an already seeded community. The `npm run setup` shortcut combines local database start, client generation, migrations and the opt-in seed.

These accounts are test fixtures. To try the current UI, sign in with your testnet wallet and create a community you control.

| Account | Campus Collective role |
| --- | --- |
| `amara@fundicate.demo` | Administrator |
| `sami@fundicate.demo` and `lena@fundicate.demo` | Moderators |
| `jules@fundicate.demo`, `noor@fundicate.demo`, `river@fundicate.demo`, `ari@fundicate.demo` | Members |
| `mina@fundicate.demo` | Applicant |

Sami also administers Neighborhood Commons. Campus Collective begins with $12,450 in simulated available funds and examples at several governance stages. An approved toolkit proposal gives staff a decision ready for simulated execution. The [hundred-member scenario](hundred-member-demo.md) builds a separate, larger dataset with published round results and payment records.

## Explore the workspace

| Destination | Starting action |
| --- | --- |
| **Explore** | Find communities and open a community hub to learn about its purpose and membership |
| **Dashboard** | Review open ballots, communities, network connections, contributions and recent activity |
| **Analytics** | Choose a time and community scope, inspect trends, and open the underlying records |
| **Community hub** | Move between members, governance, proposals, funding rounds, treasury, payments, reputation, templates and activity |
| **Profile** | Update display name, username or avatar |
| **Security** | Inspect sessions, renew identity confirmation with your wallet, and revoke sessions |

An account can belong to several communities. Active memberships define the available reports and member actions in each one. Your first verified wallet signature creates an account and opens the dashboard.

## Try a complete decision

1. Sign in with a testnet wallet and create a community. Your account becomes its administrator.
2. Use a second testnet wallet in a separate browser profile, then submit an application from the community page.
3. Return as the administrator. Open the admission ballot from **Members**, vote, and finalize once the sole eligible voter has voted.
4. As the new member, use **Treasury** to record a simulated contribution and submit a funding proposal.
5. As staff, open the proposal ballot. Cast votes with both eligible accounts and finalize the result.
6. Execute the approved allocation as staff. Open the proposal receipt, Treasury and Activity to follow the posted records.

Continue with [community governance](community-governance.md) or [funding rounds](funding-and-elections.md) to explore the two decision workflows.
