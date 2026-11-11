For deployment and wallet setup, follow the [NEAR testnet hackathon handoff](guides/near-testnet.md).

# Native NEAR testnet treasury contract v1

`contracts/near-treasury` is a separate native-asset custody contract. It does not convert simulated BDT/USD/EUR into NEAR and never gives an old fiat round retroactive payment authority. The application explicitly opts a new native funding pool into the testnet provider and binds its governance decision and recipient settings before collecting native funds.

This contract trusts the configured application controller to attest off-chain governance, the approved allocation and a successful rejection vote. It does **not** verify individual off-chain votes, apply Glicko on chain, or promise decentralization. The contract independently enforces immutable registered recipients, asset/round/operation scope, exact received-principal allocation, original-source refund limits, one active allocation, the full chain-timed veto window and transfer nonce/callback accounting. A full-access key on the contract account can deploy different code; securing or removing upgrade keys is an operator custody decision, not an unstated guarantee.

## Build and contract tests

Rust is pinned to `1.95.0`, `near-sdk` to `5.30.1`, and all transitive dependencies are pinned in `Cargo.lock`. From `contracts/near-treasury`:

```text
cargo test --locked
cargo build --locked --release --target wasm32-unknown-unknown
```

The WASM output is `target/wasm32-unknown-unknown/release/fundicate_near_treasury.wasm`. A container artifact build is also available:

```text
docker build --target artifact --output type=local,dest=build contracts/near-treasury
```

Native tests use NEAR's mocked blockchain runtime and inspect generated transfer receipts. They prove contract validation and callback accounting; they are **not** real testnet execution evidence. Deployment and receipt/finality checks are separate mandatory release gates. Initialization must be in an atomic deploy-and-call transaction from the contract account itself; another caller cannot claim initialization. `network` is an explicit deployment configuration, not an on-chain network oracle, so the application must independently verify RPC chain identity and keep mainnet disabled.

## JSON interface

All amounts are unsigned decimal strings of **yoctoNEAR** (`24` decimal places), and timestamps are unsigned decimal nanosecond strings. Account IDs use NEAR's validated `AccountId` type. `asset_id` is exactly `near:testnet:NEAR`; no fungible-token or mainnet identity is accepted by this version. Round IDs contain at most 80 ASCII letters/digits, `_`, `-` or `:`; operation IDs have the same character set with at most 128 bytes. Nonces are global to this contract, including reserve top-ups and deposits. Ordinary allocation IDs must begin `plan:`. Depositors and reserve sponsors cannot use `plan:`, `veto-refund:` or `expiry-refund:` IDs, so outsiders cannot preempt a settlement or deterministic recovery nonce.

| Method             | JSON arguments                                                                            | Authority / attached amount                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `new`              | `{controller,network:"testnet"}`                                                          | Contract account, atomic initialization; zero attached                                                   |
| `top_up_reserve`   | `{operation_id}`                                                                          | Any sponsor; at least `100000000000000000000000` yoctoNEAR (`0.1 NEAR`) per top-up                       |
| `register_round`   | `{round_id,asset_id,collection_end_ns,expires_at_ns,veto_enabled,recipients:[accountId]}` | Controller; zero attached                                                                                |
| `deposit`          | `{round_id,asset_id,operation_id}`                                                        | Actual contributing account; positive attached native principal                                          |
| `commit_plan`      | `{round_id,asset_id,allocation_hash,items:[{operation_id,kind,recipient,amount}]}`        | Controller after collection, before expiry; zero attached                                                |
| `reject_round`     | `{round_id,asset_id}`                                                                     | Controller attests successful off-chain veto before its deadline                                         |
| `recovery_refund`  | `{round_id,asset_id}`                                                                     | Anyone after expiry, only when no allocation was ever published                                          |
| `execute`          | `{round_id,asset_id,operation_id}`                                                        | Controller for payouts; anyone for immutable original-source refunds; at least `100 Tgas`, zero attached |
| `on_transfer`      | `{operation_id,attempt}`                                                                  | Private transfer-result callback; never a user action                                                    |
| `get_round`        | `{round_id}`                                                                              | Free public view; round or `null`                                                                        |
| `get_operation`    | `{operation_id}`                                                                          | Free public view; operation or `null`                                                                    |
| `get_contribution` | `{round_id,account_id}`                                                                   | Free public view; original received native amount string                                                 |
| `get_custody`      | `{}`                                                                                      | Free public view; native principal and reserve reconciliation                                            |
| `allocation_hash`  | `{round_id,asset_id,items}`                                                               | Free deterministic commitment helper                                                                     |

Each allocation item kind is exactly `PAYOUT` or `REFUND`. The commitment is SHA-256 of UTF-8 `JSON.stringify([round_id, asset_id, items])` with no whitespace and each item serialized in this exact property order: `operation_id`, `kind`, `recipient`, `amount`. Preserve item order and canonical unsigned amount strings. The Rust contract recomputes this commitment; an arbitrary supplied hash is rejected.

Example canonical payload:

```json
[
  "round-1",
  "near:testnet:NEAR",
  [
    {
      "operation_id": "plan:pay-1",
      "kind": "PAYOUT",
      "recipient": "recipient.testnet",
      "amount": "1000000000000000000000000"
    }
  ]
]
```

Publication time comes from the chain's `block_timestamp`; the API accepts no caller-supplied publication time. With enabled veto, `veto_end_ns = published_at_ns + 86400000000000`. Every execution, including rejection refunds, waits until that exact deadline. Collection and recovery dates cannot truncate the full window.

## Principal, refunds and operating reserve

Fund the contract's deployment account with a separate operating reserve before deploying and initializing. Fresh initialization records the actual opening account balance as `initial_operating_balance`; because there are no participant liabilities yet, all of this observed starting balance is operator funding. Later sponsors use `top_up_reserve`, recorded separately as historical top-ups. Do not count a deployment balance twice. A roughly 380-KB WASM module alone requires about 3.8 NEAR of storage collateral at the protocol's current storage price, before state growth or the liquid buffer; query actual `storage_usage` and `get_custody` rather than assuming a fixed setup cost.

The contract retains at least `0.1 NEAR` liquid buffer **plus** measured storage cost and a 4096-byte storage margin. Both separately supplied operating funding and actual account solvency must cover this requirement. Every deposit is fully principal. No platform fee, storage charge or exchange rate is deducted from participants. Insufficient reserve rejects the operation, so its attached principal is reverted by NEAR. The application must also budget the controller/depositor wallets' own gas separately.

The published bounds are 50 payout recipients, 1000 distinct contributors, 4096 deposit operations and 2000 allocation items per round. These limits bound storage and recovery work; additional capacity requires a new contract/rule version. A sponsor top-up smaller than `0.1 NEAR` is rejected to prevent tiny top-up nonces consuming subsidized storage.

Every plan allocates **exactly** all received principal. Residuals are explicit refunds. Only registered payout accounts may receive payout items. Refunds are payable only to actual depositing predecessor accounts and cannot cumulatively exceed that source's contribution. A wallet association in the application cannot redirect someone else's refund. Source amounts and the approved item set are immutable.

The custody invariant is `received = principal_liability + paid + refunded`. Pending outgoing amounts remain inside principal liability until their callback succeeds; they are also disclosed as `in_flight`. Since a transfer receipt can debit custody before its callback, the conservative operational reconciliation uses `account_balance + in_flight` against `principal_liability + storage_cost + minimum_buffer`. This is explicitly **not** a claim that unknown transfers are confirmed. Application reconciliation must inspect actual finalized transaction and receipt outcomes.

`get_custody` returns `network`, `asset_id`, `controller`, `account_balance`, `storage_cost`, `principal_liability`, `in_flight`, `initial_operating_balance`, `operating_topups`, `minimum_operating_buffer`, `received`, `paid`, `refunded`, `operational_surplus_including_in_flight` and `solvent_including_in_flight`. Amount fields are decimal strings. Opening balance and top-ups are historical operating funding, not an independently spendable balance or participant principal; this version exposes no reserve-withdrawal method.

## Durable operations and recovery

`get_operation` returns `operation_id`, nullable `round_id`, `asset_id`, `kind`, `recipient`, `amount`, `status`, `attempt`, nullable `plan_hash`, `created_at_ns` and nullable `completed_at_ns`. Deposit/reserve records are immediately `SUCCESS`. Allocation records begin `READY`, become `PENDING` before a transfer is scheduled, then only the contract's private callback changes them to `SUCCESS` or proven `FAILED`. Replaying `PENDING`, `SUCCESS` or `CANCELLED` never sends a second transfer. Retrying a proven `FAILED` reuses the exact operation ID and immutable item, increments `attempt`, and a stale callback cannot resolve the newer attempt. The callback receives `50 Tgas`.

`get_round` returns immutable registration fields plus `contributors`, `deposit_count`, `received`, `paid`, `refunded`, `in_flight`, nullable `allocation_hash`, nullable `original_allocation_hash`, nullable `published_at_ns`, nullable `veto_end_ns`, `operation_ids`, `rejected` and `recovery`. These are financial facts and publicly observable wallet actions; off-chain ballots are never copied into contract arguments or events.

A successful veto cancels only a completely unsubmitted allocation, retains the cancelled operation records and original hash, and commits deterministic full original-source refunds under a new hash. Refund IDs are `veto-refund:<round_id>:<sourceIndex>` in original contributor order. They still wait the original full veto deadline. This version relies on the controller's truthful off-chain rejection attestation; the contract enforces its financial effects.

After expiry, an entirely **unpublished** pool can be recovered permissionlessly into `expiry-refund:<round_id>:<sourceIndex>` original-source refunds. Any account may execute an already committed REFUND item, including its original contributor, while the immutable recipient, amount, nonce, gas and veto gates remain enforced. The relayer receives no funds, so a contributor can complete recovery even if the controller is unavailable. PAYOUT execution remains controller-only. An already published plan remains binding after expiry. No expiry path can erase a submitted, successful, failed or unknown operation or grant a refund against money that might already have left custody.

If a callback itself fails or cannot be observed, the operation remains `PENDING` and cannot be replayed. The safe response is to query finalized transfer/receipt and operation state, retain reservations and report the unresolved discrepancy. This contract intentionally has no controller shortcut that can declare an unknown transfer failed or redirect its funds. A stalled callback can therefore require operator investigation and a reviewed contract upgrade under the disclosed upgrade-key trust model; it must never be labeled automatic successful recovery.

## Deployment and evidence boundary

This source does not contain keys, account creation, deployment, fabricated hashes or automatic mainnet switching. The app/verification tools must obtain actual testnet account authorization and record independent RPC `FINAL` observations matching signer, receiver, action, asset, operation identity and every relevant receipt's success. A local build, unit test or controller assertion alone is insufficient to mark the Part 5 chain gate complete.
