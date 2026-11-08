**Standalone branch, 7 November 2026:** This branch is community governance plus staff-recorded external-payment tracking. Blockchain execution is disabled; older NEAR instructions below are historical and cannot enable it. See [the standalone guide](STANDALONE.md). Existing treasury balances remain simulated.

# NEAR integration boundary

The delivered treasury is a local simulation. A CONFIRMED record means a local database transaction committed. It never means a NEAR transfer was submitted or confirmed. Network is `local-simulation`; transaction hashes, external references, and wallet account IDs remain null.

## Current architecture

- `src/lib/treasury-adapter.ts` defines `TreasuryAdapter.submit` and `reconcile`.
- `src/lib/service.ts` performs community authorization, approval checks, serializable transactions, atomic balance checks, double-entry posting and idempotency.
- `FundingExecution` and `LedgerTransaction` include PENDING, SUBMITTED, CONFIRMED and FAILED states, network/account/reference fields, and confirmation timestamps.
- The local adapter has no external side effects. It is safe inside a database transaction that may retry. A live adapter is deliberately rejected by the current posting function.
- SQL makes posted financial records immutable. A future integration must add separate mutable execution attempts / chain observations rather than silently updating posted ledger history.

## Required implementation before testnet

1. Choose and document the custody model. Recommended: a community treasury contract on NEAR testnet with its own on-chain authorization and proposal/nonce checks. A browser-connected personal wallet is not itself a shared treasury or proof that off-chain votes are enforced.
2. Create a testnet treasury account and contract; obtain faucet tokens. Keep private keys out of Git, browser bundles, logs, and application forms. Separate testnet/mainnet configuration explicitly.
3. Implement audited contract methods for deposits, proposal allocation/execution, unique execution IDs, recipient and amount bounds, and replay rejection. Test duplicate nonces, wrong signers, concurrent calls, failed receipts, and contract upgrades. Decide whether governance itself lives on chain or the contract trusts an authorized application signer; explain that trust to users.
4. Add the maintained NEAR wallet connector to the client. Connect the wallet, obtain its account ID and network, request only the necessary signing permissions, and require the user’s wallet signature for each relevant transaction. Account linking needs a domain-bound, expiring, single-use signed challenge; never trust a client-supplied account ID.
5. Implement `NearTreasuryAdapter` using the verified connector/SDK APIs for the selected versions. Use exact integer yoctoNEAR values (24 decimals) with bigint. The MVP’s USD/BDT/EUR minor units cannot be relabeled as NEAR; add asset ID, decimals and precision-aware parsing. Supporting a fungible token requires its contract and storage/deposit handling as well.
6. Introduce a durable outbox and reserved-funds account. Atomically verify approval, reserve the allocation, and write a PENDING execution/outbox job under a unique proposal execution key. Commit before contacting the chain. Never send an external transfer inside the retryable `atomic` callback.
7. A worker submits the same execution ID/nonce to the treasury contract and stores the returned network/account/real transaction hash. If the submission response is lost, reconcile the existing nonce/hash before sending again. A database idempotency key alone cannot prevent a duplicate blockchain transfer after a network timeout.
8. Query NEAR RPC for the actual transaction and receipt outcome at the required finality. Distinguish broadcast, inclusion, execution success, and finality. A hash alone is not success. Maintain append-only observation records and confirmed/failed execution-attempt state.
9. On verified success, atomically move the reserved amount to paid, append the balanced posted ledger transaction, preserve the actual hash and confirmation timestamp, audit the outcome, then mark the proposal executed. On verified failure, release the reservation through compensating entries. Handle pending timeouts by reconciliation, not automatic duplicate submission.
10. Add RPC failure/timeout/retry, reorganization/finality, insufficient gas, failed contract receipt, duplicate wallet callback and concurrency tests. Run testnet end-to-end with actual wallet confirmations. Never enable mainnet before a contract/security review, operational monitoring, backup/recovery and a clear custody disclosure.

## Production prerequisites beyond blockchain

HTTPS and a canonical APP_ORIGIN; trusted client-IP handling and distributed abuse controls; email verification and account recovery; stronger administration-transfer reauthentication; production database least-privilege roles, backups and monitoring; durable job scheduling; security review. The app is a hackathon MVP and makes no decentralization claim.

Official starting points: [NEAR Wallet Selector API](https://github.com/near/wallet-selector/blob/main/packages/core/docs/api/wallet.md), [NEAR transaction RPC](https://docs.near.org/api/rpc/transactions). Recheck these APIs and package versions when implementing the adapter.
