# NEAR testnet wallet login

Wallet authentication is separate from the dormant treasury/payment integration. Keep `FUNDICATE_MODE=standalone`; set `NEAR_WALLET_LOGIN=true` in the server environment and restart the app. `NEAR_RPC_URL` defaults to `https://test.rpc.fastnear.com` and must use HTTPS without embedded credentials. The server checks that the endpoint reports testnet. Never supply private keys to Fundicate.

Select **Continue with NEAR testnet** on `/login` or `/register` and approve the ownership message. A new wallet creates a Fundicate account automatically, without an email or password. Existing linked wallets sign in to their original account. No user is created before signature and finalized full-access-key verification.

Wallet-only accounts store null email and password fields. A fresh wallet signature provides five-minute identity confirmation for sensitive actions; renew it in Security. Email/password sign-in and registration endpoints are disabled. Fresh wallet signatures confirm identity for all users. Existing historical credentials are preserved but are not a sign-in option. A wallet-only user cannot revoke their last sign-in wallet. Revoking a link blocks future sign-ins; revoke existing sessions separately. Keep wallet recovery credentials safe.

Challenges expire after five minutes, are bound to an HttpOnly browser cookie and application origin, and are consumed atomically with account/link/session creation. Payment routes remain disabled.

Verification: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, then `npm run test:wallet-login` with the retained local database keeper. The isolated wallet suite uses real PostgreSQL and signatures with simulated RPC ownership replies; it does not prove a live user wallet approval or real testnet account ownership. A real wallet approval must be checked interactively by its owner. Historical maintenance passes do not certify this new feature.
