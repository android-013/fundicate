# HTTP API

[Documentation home](../README.md)

The browser uses same-origin JSON mutations and scoped GET downloads. The API is part of the standalone application. Send the exact `APP_ORIGIN` as the mutation `Origin` header, set `Content-Type: application/json` and retain the session cookie issued at sign-in. Send opaque IDs from the appropriate authorized page. IDs in mutation payloads generally use UUIDs, while community paths and the analytics filters use slugs.

POST success responses contain a `message`, a `redirect` or operation-specific fields. Structured error responses include the request ID for support. Authenticated mutation responses are private and use `X-Request-Id`. Money inputs use decimal amounts accepted by the relevant schema, and rates use integer basis points where 10,000 represents 100%.

## GET endpoints

| Path | Access and parameters | Response |
| --- | --- | --- |
| `/api/health` | Readiness probe | JSON readiness status and matching HTTP status |
| `/api/analytics/export` | Active scope. `community`, `range`, `from`, `to`, `currency`, `dataset`, `cohort`, `q`, `status`, `type`, `person`, `page` | Matching CSV for `transactions`, `proposals`, `votes`, `members` or `activity` |
| `/api/analytics/system/export` | Active scope. `community`, `from`, `to`, `page`, `dataset` | Round page or grouped `funds`, `reputation` or `payments` CSV |
| `/api/payments/export` | Active membership. `communityId`, optional `page` | Payment register CSV with total record count header |

Use UTC calendar dates in YYYY-MM-DD format. The [analytics guide](../guides/analytics-and-templates.md) describes time windows, datasets and visibility.

## POST operations

Send requests to `/api/<operation>`. The table names the significant fields. Defaults, length limits and conditional fields live in the linked schemas and service modules.

### Optional NEAR testnet operations

| Operation | Input and behavior |
| --- | --- |
| `wallet-challenge` | Testnet `accountId`. Create a session-bound ownership challenge after password confirmation. |
| `wallet-verify` | `challengeId`, `accountId`, `publicKey`, `signature`. Verify a signed ownership message. |
| `wallet-revoke` | `id` of the current user's wallet link, after password confirmation |
| `chain-create` | Community and source round IDs, title, collection length or explicit deadlines, and qualified scheme payout caps with testnet recipients |
| `chain-prepare` | Community and pool IDs, linked `accountId`, `action`, `idempotencyKey`, and applicable amount or contract operation ID |
| `chain-authorize` | Prepared application `operationId`. Reserve the wallet handoff and return immutable signing instructions. |
| `chain-submitted` | Application operation ID and wallet `transactionHash` |
| `chain-reconcile` | Application operation ID. Independently query testnet and record the outcome. |

See the [testnet handoff](../guides/near-testnet.md) for activation and the live evidence command.

### Account and report settings

| Operation | Input or behavior |
| --- | --- |
| `register` | New account credentials and profile fields |
| `login` | Email and password |
| `logout` | Revoke the current session and clear its cookie |
| `reauthenticate` | Password confirmation for the current session, valid for five minutes |
| `profile` | `displayName`, `username`, optional HTTPS `avatarUrl` |
| `revoke-session` | `sessionId` owned by the signed-in account |
| `revoke-sessions` | Revoke the account's other sessions |
| `notifications` | Mark the account's notifications read |
| `dashboard-preferences` | Select dashboard widgets |
| `analytics-save-view` | Store a named report section and filter set |
| `analytics-delete-view` | `id` of a saved view owned by the account |

### Community, proposal and treasury

| Operation | Input or behavior |
| --- | --- |
| `community` | Community details, currency, rules and membership questions |
| `application` | `communityId`, `introduction`, `proposedContribution`, answers by question ID |
| `review` | `communityId`, `applicationId`, `decision`, `reason`. Staff use the policy's ballot or review path. |
| `member` | `communityId`, `userId`, `action`, applicable reason and confirmation. Actions include moderator, member, transfer, suspend and leave. |
| `proposal` | `communityId`, title, description, type, quorum and threshold, open and close times, and type-specific settings |
| `vote` | `communityId`, `proposalId`, `choice` of YES, NO or ABSTAIN |
| `proposal-action` | `communityId`, `proposalId`, `action` of open, finalize, execute or cancel, and applicable reason |
| `declare-contribution` | `communityId`, prospective `amount` |
| `contribute` | `communityId`, simulated `amount`, UUID `idempotencyKey` |

### Funding rounds and templates

| Operation | Input or behavior |
| --- | --- |
| `funding-round` | Community, agenda, proposal policy, quorum and submission close time, with versioned funded settings as applicable |
| `round-scheme` | Community and round IDs, scheme content, requested amount and applicable recipient data |
| `round-action` | Community and round IDs, action open, screen, close-screening, close-selection or cancel |
| `round-screen-vote` | Community, round and scheme IDs plus YES, NO or ABSTAIN |
| `round-selection-vote` | Community, round and scheme IDs for a single choice |
| `round-method-vote` | Community and round IDs plus complete selection payload for the published method |
| `round-veto` | Community and round IDs plus REJECT, KEEP or ABSTAIN |
| `round-veto-close` | Community and round IDs after the full enabled veto window |
| `round-contribute` | Community and round IDs, amount and replay identity for a simulated deposit |
| `round-settle` | Community and round IDs for immutable settlement preparation |
| `round-process` | Community and round IDs to process the prepared plan |
| `round-reconcile` | Community and round IDs to reconcile pending operation state with the local ledger |
| `template-save` | Community ID, name, description, optional template ID, and exactly one of `sourceRoundId` or a validated flat `round` creation input |
| `template-instantiate` | Community and template IDs, revision, fresh `submissionsCloseAt`, optional title and description |
| `template-archive` | Community and template IDs |

The [round settings schema](../../src/lib/rounds-core.ts), [selection specification](../algorithms/part-04.md) and [template rules](../guides/analytics-and-templates.md#reuse-round-rules) describe payload variations. The [template service](../../src/lib/round-templates.ts) defines version 1 snapshots and mutation schemas.

### Reputation and payments

| Operation | Input or behavior |
| --- | --- |
| `reputation-create` | `communityId`, `targetType`, `targetId`, `dimension`, `contextType`, `contextId`, `score`, `text` |
| `reputation-edit` | Community and review IDs, score and text |
| `reputation-report` | Community and review IDs, reason |
| `reputation-moderate` | Community and review IDs, HIDE or RESTORE, reason |
| `reputation-appeal` | Community and review IDs, moderation ID and statement |
| `payment-record` | Community ID, `kind` of CONTRIBUTION, PAYOUT or REFUND, decimal amount, USD/BDT/EUR currency, reference and ISO occurrence time. Optional round ID, counterparty ID, note and HTTPS evidence URL. |
| `payment-reverse` | Community and original record IDs, new reference, note and ISO occurrence time |

Payment writes, session revocations and sensitive membership actions use a recently confirmed password. Community role and visibility requirements are enforced in the applicable services. See the [dispatcher](../../src/app/api/%5Boperation%5D/route.ts), [shared validation](../../src/lib/validation.ts), [analytics filters](../../src/lib/analytics-core.ts) and [payment schema](../../src/lib/payment-records-core.ts).

## Readiness example

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/health'
```

A ready instance returns `{"status":"ok"}`. See the [deployment guide](../guides/deployment.md) for configuring the origin and database.
