# Standalone branch dependencies

User-approved scope on 7 November 2026 removes wallets, testnet funding/signatures, RPC and contract deployment from this branch. No external payment provider is used. Public hosting requires explicit deployment authorization, TLS/reverse-proxy configuration, least-privilege PostgreSQL credentials and verified backups. No hosting is performed by this task. The historical dependency register follows for provenance and does not enable chain execution.

# External dependencies and unblock actions

Planning is ready. Parts 2–4 are designed to run locally with the installed stack and explicitly simulated funds. Part 5's user-confirmed testnet gate needs real external actions. Track each dependency when discovered and in active-run blockers; do not pre-mark an unattempted dependency as a failed implementation.

| Dependency                                                | Needed by                            | Safe preparation / evidence                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testnet wallet/account access and funding                 | Part 5 verification                  | Prepare setup instructions earlier. User connects an owned testnet wallet and obtains testnet funding when needed. Never request a private key in chat or commit it.  |
| Testnet contract deployment/signing capability            | Part 5                               | Implement/test locally first, then use authorized testnet accounts/signing. Record public contract/account/network details and actual deployment evidence.            |
| Wallet signatures/approvals                               | Part 5                               | Ask only at the real signing step, explain the operation and testnet amount, and use the wallet/native approval flow. An elapsed wait is not a signature.             |
| Working testnet RPC and observation access                | Part 5                               | Independently verify real deposit/payout/refund success and finality, expected signer/receiver/action/asset/amount/nonce. Store public observations, not credentials. |
| Updated protocol/library behavior                         | Parts 4–5                            | Recheck primary specifications/current official docs during implementation; pin versions and run reference/integration checks.                                        |
| Environment access outside the current writable workspace | Each implementation turn if required | Request only the specific native filesystem/network grant needed; project authorization is already given.                                                             |

If blocked, finish all independent implementation and verification, record the exact dependency, evidence of the attempt, missing input and next action, then keep the current part active. Resolve only after the prerequisite actually exists; final completion still requires the real near-testnet check. Never substitute local simulation for this gate or consume another part to skip it.

A planning worker reported a provider usage limit; the coordinator completed and tested the controller directly. Saved role briefs persist, but actual worker availability must be rechecked when a part runs. Finish independent work where possible; if a required genuine review cannot run, retain that active part and record the dependency. Never fabricate an agent review or silently waive the gate.

The five-part plan does not authorize mainnet transfers, unrelated hosted deployment, destructive demo resets or messages to other people.
