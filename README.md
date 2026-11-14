<h1 align="center" style="font-size: 3rem;"><img src="src/app/icon.svg" width="64" height="64" alt="" /><br />Fundicate</h1>

> **Funding + syndication, brought together as Fundicate.**

**Fund together. Decide together.** A community governance app with passwordless NEAR testnet sign-in. Built for [NEAR HACKATHON 2026](https://nearhackathon.com/).

## In a nutshell

### What it does

Fundicate gives clubs, collectives, and community groups a shared record of who can participate, what they are deciding, and how the decision was reached. Organizers publish the rules for a funding round. Members submit and screen proposals, vote on eligible projects, and review the outcome and proposed allocation. Communities can use participation-based reputation, reusable round templates, and analytics to track how they work over time.

**How NEAR fits in.** Fundicate uses NEAR Connect to request a signed ownership message from a testnet wallet. The first verified signature creates an account and later sign-ins return to that account. Users enter no email or password, and signing in sends no transaction. Next.js runs the app, and PostgreSQL stores the governance records and simulated ledgers. A separate Rust treasury contract supports optional testnet settlement.

Staff means the Admin and Mods. The syndicate has one Admin at a time. Mod status gives management permissions and adds no voting weight.

## System flow carts

**work flows**

### Membership and reputation

```mermaid
flowchart TD
    M1["Applicant requests to join the syndicate"]
    M2["State a contribution amount, answer preset questions, and explain why they want to join"]
    M3["Existing members vote on admission"]
    M4{"More than 50% approval?"}
    M5["Admit the applicant as a member"]
    M6["Decline the application"]
    M7["Existing members vote on removing a member"]
    M8{"At least 66.6% approval?"}
    M9["Remove the member"]
    M10["Keep the member"]
    M11["A member rates another member, an agenda, a proposal, or an outcome"]
    M12["Select 1 to 5 stars and add a written description"]

    M1 --> M2 --> M3 --> M4
    M4 -->|Yes| M5
    M4 -->|No| M6
    M7 --> M8
    M8 -->|Yes| M9
    M8 -->|No| M10
    M11 --> M12

    classDef action fill:#112f38,stroke:#6de3eb,color:#edf1ff,stroke-width:2px;
    classDef governance fill:#251d45,stroke:#aaa2ff,color:#edf1ff,stroke-width:2px;
    classDef decision fill:#352819,stroke:#f4c474,color:#edf1ff,stroke-width:2px;
    classDef success fill:#15342d,stroke:#79deb1,color:#edf1ff,stroke-width:2px;
    classDef declined fill:#3b2336,stroke:#f39ab7,color:#edf1ff,stroke-width:2px;

    class M1,M2,M12 action;
    class M3,M7,M11 governance;
    class M4,M8 decision;
    class M5,M10 success;
    class M6,M9 declined;
```

Applicants state their intended contribution when they apply. Members prepay into escrow during the crowdfunding workflow.

### Scheme approval and selection

```mermaid
flowchart TD
    S1["User attempts to submit a funding scheme"]
    S2{"Who may propose under the agenda?"}
    S3{"Is the submitter the Admin or a Mod?"}
    S4["Accept the scheme title, description, requested amount, and funding purpose"]
    S5["Block the submission"]
    S6["Members vote to approve the scheme during a 24-hour window"]
    S7{"More than 50% approval when the window closes?"}
    S8["Add the approved scheme to the selection ballot"]
    S9["Exclude the scheme from the selection ballot"]
    S10{"Any schemes on the selection ballot?"}
    S11["Open the selection election using the agenda's method and voting weight"]
    S12["Members cast votes while individual ballots and running totals stay hidden"]
    S13["Close voting and tally the results using the configured method and weight"]
    S14["Identify the winner or ranking for the configured distribution"]
    S15["Proceed to the rejection window if enabled, or to escrow settlement"]
    S16["No selection election takes place"]

    S1 --> S2
    S2 -->|Everyone| S4
    S2 -->|Staff only| S3
    S3 -->|Yes| S4
    S3 -->|No| S5
    S4 --> S6 --> S7
    S7 -->|Yes| S8
    S7 -->|No| S9
    S8 -->|After approval voting| S10
    S9 -->|After approval voting| S10
    S10 -->|Yes| S11 --> S12 --> S13 --> S14 --> S15
    S10 -->|No| S16

    classDef action fill:#112f38,stroke:#6de3eb,color:#edf1ff,stroke-width:2px;
    classDef governance fill:#251d45,stroke:#aaa2ff,color:#edf1ff,stroke-width:2px;
    classDef decision fill:#352819,stroke:#f4c474,color:#edf1ff,stroke-width:2px;
    classDef success fill:#15342d,stroke:#79deb1,color:#edf1ff,stroke-width:2px;
    classDef declined fill:#3b2336,stroke:#f39ab7,color:#edf1ff,stroke-width:2px;

    class S1,S4,S15 action;
    class S6,S11,S12,S13 governance;
    class S2,S3,S7,S10 decision;
    class S8,S14 success;
    class S5,S9,S16 declined;
```

### Escrow, rejection, and settlement

```mermaid
flowchart TD
    A1["Configure agenda settings"] --> A2{"Choose a selection method"}

    A2 --> A3["First Past the Post"]
    A2 --> A4["Ranked Choice"]
    A2 --> A5["Single Transferable Vote (STV)"]
    A2 --> A6["Elo"]
    A2 --> A7["Glicko-2"]
    A2 --> A8["1v1 Elo/Glicko without draws"]

    A3 --> A9{"Choose the selection vote weight"}
    A4 --> A9
    A5 --> A9
    A6 --> A9
    A7 --> A9
    A8 --> A9

    A9 --> A10["One member, one vote"]
    A9 --> A11["Contribution-weighted voting"]
    A10 --> A12["Keep individual ballots and running totals hidden until the election closes"]
    A11 --> A12

    A12 --> F1["Members prepay their contributions"]
    F1 --> F2["Independent escrow holds the funds and records each deposit"]
    F2 --> F3["Lock member withdrawals while the funding round is active"]
    F3 --> F4["Members vote on scheme approval within 24 hours"]
    F4 --> F5{"Did any scheme receive more than 50% approval?"}

    F5 -->|No| F6["Round awaits the retry or cancellation policy"]
    F6 -->|If cancelled| F7["Cancel the round before settlement"]
    F7 --> R1["Escrow refunds affected member contributions and records each refund"]

    F5 -->|Yes| E1["Run the selection election with approved schemes"]
    E1 --> E2["Close voting and tally results using the configured method and vote weight"]
    E2 --> E3{"Is the 24-hour rejection window enabled?"}

    E3 -->|Yes| E4["Members have 24 hours to vote on rejecting the funding result"]
    E4 --> E5{"Did rejection reach at least 90% when voting closed?"}
    E5 -->|Yes| R1
    E5 -->|No| D1{"Which distribution method does the agenda specify?"}
    E3 -->|No| D1

    D1 -->|Winner takes all| D2["Allocate the full pool to the winning scheme"]
    D1 -->|Proportional distribution| D3["Allocate funds proportionally under the agenda rules"]
    D1 -->|Custom percentages by rank| D4["Allocate funds by rank using configured shares such as 50%, 30%, and 20%"]

    D2 --> D5["Escrow pays the winning schemes and records each transfer"]
    D3 --> D5
    D4 --> D5

    classDef action fill:#112f38,stroke:#6de3eb,color:#edf1ff,stroke-width:2px;
    classDef governance fill:#251d45,stroke:#aaa2ff,color:#edf1ff,stroke-width:2px;
    classDef decision fill:#352819,stroke:#f4c474,color:#edf1ff,stroke-width:2px;
    classDef success fill:#15342d,stroke:#79deb1,color:#edf1ff,stroke-width:2px;
    classDef declined fill:#3b2336,stroke:#f39ab7,color:#edf1ff,stroke-width:2px;

    class F1,F2,F3,R1,D2,D3,D4 action;
    class A1,A3,A4,A5,A6,A7,A8,A10,A11,A12,F4,E1,E2,E4 governance;
    class A2,A9,F5,F6,E3,E5,D1 decision;
    class D5 success;
    class F7 declined;
```

Escrow has exclusive custody and settlement authority. Admins and Mods cannot independently access or redirect the funds. Payouts occur after selection voting and any enabled rejection window close. Rejection or cancellation triggers refunds to affected contributors.


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

## Start here for detailed information

| I want to... | then read... |
| --- | --- |
| Watch the walkthrough or see the sign-in screen | [Demo media](docs/media/) |
| Run Fundicate locally and try a complete workflow | [Getting started](docs/guides/getting-started.md) |
| Explore everything members and staff can do | [Documentation home](docs/README.md) |
| Create an account or sign in with a wallet | [NEAR testnet wallet sign-in](docs/guides/testnet-wallet-login.md) |
| Host the wallet sign-in demo | [Wallet demo deployment](docs/guides/testnet-wallet-deployment.md) |
| Deploy, operate or recover a standalone instance | [Deployment and operations](docs/guides/deployment.md) |
| Set up the optional NEAR treasury and verify settlement | [NEAR testnet handoff](docs/guides/near-testnet.md) |
| Understand the application, API and database | [Architecture](docs/reference/architecture.md) · [HTTP API](docs/reference/api.md) · [Data model](docs/reference/data-model.md) |
| Review recorded test passes | [Verification](docs/verification/README.md) |

## Application demo

[![Fundicate’s NEAR testnet sign-in screen](docs/media/fundicate-near-sign-in.png)](demo-video/brag.mp4)

[Watch the application demo (4:36)](demo-video/brag.mp4) · [View the demo cover](docs/media/fundicate-demo-cover.jpg) · [Browse the screenshots](docs/media/)

The walkthrough follows a collective from setting its rules and admitting members through screening projects, voting, and deciding how to allocate funds. It also explains the rejection window, original-source refunds, transfer records, and payments through the configured NEAR testnet escrow mode.

The [documentation home](docs/README.md) also indexes the delivery plan, the versioned election specifications and the original verification records.

### Open source project

Licensed under the [MIT License](LICENSE).
