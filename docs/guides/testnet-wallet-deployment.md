# Deploy the wallet sign-in demo

[Documentation home](../README.md) · [Wallet sign-in guide](testnet-wallet-login.md)

The hackathon demo runs Fundicate with PostgreSQL and NEAR testnet wallet sign-in. It uses the standalone funding ledger, which records simulated contributions and payouts. The app connects to an HTTPS testnet RPC to verify wallet ownership. Account creation and sign-in work without deploying a contract.

| App setting | Demo value or purpose |
| --- | --- |
| `FUNDICATE_MODE` | `standalone` keeps the app on its simulated treasury ledger. |
| `NEAR_WALLET_LOGIN` | `true` enables wallet signup and sign-in. |
| `NEAR_RPC_URL` | Defaults to `https://test.rpc.fastnear.com`. If you override it, use an HTTPS testnet endpoint without embedded credentials. |
| `APP_ORIGIN` | The exact URL users open, including scheme and any port. Use `http://127.0.0.1:3000` for the default local setup and HTTPS for a public deployment. |

## Start with Docker Compose

Run this from the repository root on a machine with Docker Engine and Compose v2.

```sh
node scripts/bootstrap.mjs --docker
```

Bootstrap prepares `.local/deploy/compose.env`, starts PostgreSQL, applies migrations, and starts the app. The default Compose settings use wallet sign-in. Open [the readiness endpoint](http://127.0.0.1:3000/api/health) and check for `{"status":"ok"}`. Open [Sign in](http://127.0.0.1:3000/login) and check for **Continue with NEAR testnet**.

For a fresh public deployment, prepare the configuration for your actual HTTPS URL.

```sh
node scripts/bootstrap.mjs --docker --origin https://fundicate.example --prepare-only
```

1. Configure your TLS reverse proxy to forward to the loopback web service, preserve the browser’s `Origin`, and overwrite `X-Real-IP`. Keep direct access to the app port private.
2. In the generated `.local/deploy/compose.env`, use the table settings and add `TRUSTED_CLIENT_IP_HEADER=x-real-ip`. Set `ALLOW_DEMO_SEED=false`.
3. Rerun the same bootstrap command without `--prepare-only`. If switching an existing deployment to a new domain, update its saved `APP_ORIGIN` to match before starting it. Keep the existing database volume and credentials.
4. Visit `/api/health` over your public URL, then sign in with a testnet wallet. A new wallet opens its own dashboard after message approval. Signing out and signing in with the same wallet should reopen that account.

For a native deployment with your own PostgreSQL server, use the same wallet settings and follow the [native service instructions](deployment.md#native-service). For a separate contract that handles actual testnet payments, follow the [NEAR treasury handoff](near-testnet.md).

## Verify the integration locally

The server creates a single-use ownership challenge bound to the browser, wallet, and app origin. It expires after five minutes. Fundicate checks the signature and verifies the signing key’s full access at testnet finality before creating an account or session.

From a checkout with PostgreSQL running and a build available, run `npm run test:wallet-login`. The suite uses a disposable PostgreSQL database and simulated RPC responses. Use an interactive wallet sign-in on your deployed instance to verify the real connection.
