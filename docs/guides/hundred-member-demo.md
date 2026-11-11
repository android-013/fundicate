# Isolated hundred-member demonstration

[Documentation home](../README.md) · [Getting started](getting-started.md)

Run this scenario to explore a complete funded election, simulated settlement and external-payment register with fictional BDT data. It creates a separate demo database on the PostgreSQL server configured in `DATABASE_URL`.

## Generate the scenario

From the repository root, use installed Node dependencies and a PostgreSQL account allowed to create databases.

```powershell
npm run demo:large
```

The command creates a uniquely named `fundicate_demo_large_TIMESTAMP_PID` database, applies migrations and uses the application services with a fictional clock. Your usual application database remains available for normal use.

| Stage | Fixture and expected result |
| --- | --- |
| Community | 100 fictional users, including one administrator and two moderators |
| Collection | 100 simulated deposits of 1,000 BDT each |
| Screening | All 100 eligible members screen each of the three schemes |
| Selection | V4 first-past-the-post result of 60, 25 and 15 votes. Each voter sees their own ballot while selection is sealed. |
| Settlement | Winner-all pays the winning request of 60,000 BDT and refunds 400 BDT to each of the 100 original sources |
| Reconciliation | 100,000 BDT received and fully accounted for, with zero held or reserved after settlement |
| External register | Five fictional attestation rows, including a correction with a full-source reversal. Register totals reconcile separately from the simulated pool. |

The exercise verifies original-source receipts, balanced postings, principal conservation and repeat processing against the same plan. See the [verification chart](../verification/README.md#simulated-bdt-demonstration).

## Explore in a browser

The command prints the database name and source routes. Set `DATABASE_URL` for a separate local terminal or private environment file, preserving the PostgreSQL host and credentials and using the generated database name. Set a distinct loopback `APP_ORIGIN` and matching port. For example, after setting those values, use `npm run dev -- --port 3003` with the origin `http://127.0.0.1:3003`.

Sign in as `fictional001@fundicate.invalid` with the fictional demo password `FictionalDemo!2026`. Open the round to inspect the published ballot results, payout and refunds. Open **Payments** for the five external entries and **System insights** for the grouped totals. Keep this fictional fixture local.
