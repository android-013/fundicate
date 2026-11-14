# Sign in with a NEAR testnet wallet

[Documentation home](../README.md) · [Run Fundicate locally](getting-started.md#start-a-local-instance)

Use your testnet wallet to create a Fundicate account and sign back into it. Fundicate asks for a signed ownership message. The message sends no transaction and costs no gas. You enter no email or password in Fundicate.

## Connect your wallet

1. Have a NEAR **testnet** account in a wallet listed by [NEAR Connect](https://docs.near.org/tools/near-connect) with testnet message signing. Open the wallet and select the account you want to use.
2. Open Fundicate at your operator’s app address. For the default local setup, open [Sign in](http://127.0.0.1:3000/login). Select **Continue with NEAR testnet** on the sign-in or registration page.
3. Choose your wallet and testnet account. Review the ownership message, check the account and Fundicate address, and approve the message in your wallet. Keep your recovery phrase and private key in your wallet.
4. Fundicate opens your **Dashboard** after verification. Your first sign-in creates an account. To return, use the same wallet account and signing key, and approve a fresh message.

From the dashboard you can create a community or explore existing ones. Follow [Getting started](getting-started.md#try-a-complete-decision) to try a vote.

## Manage your sign-in

In **Settings → Security**, select **Continue with NEAR testnet** again using your existing account to renew the five-minute identity confirmation required by sensitive actions. To add another wallet, confirm your identity first, then open **NEAR wallets**, choose the other wallet, and sign to link it. An existing link stays with its original Fundicate account.

In **NEAR wallets**, revoking a link blocks its future sign-ins. Use the session controls in **Security** to sign out sessions that are already active. Wallet-only accounts must keep one sign-in wallet linked.

| If you see… | Try this |
| --- | --- |
| No wallet chooser or signing prompt | Unlock the wallet, allow its prompt, and select a compatible testnet wallet from the chooser. |
| An account mismatch or a cancelled prompt | Reopen sign-in and choose the same account for connection and message approval. |
| An expired message | Select **Continue with NEAR testnet** again to issue a new request. |
| A full-access key message | Use a wallet and signing key with full access to the selected testnet account. Fundicate verifies that permission with the testnet RPC. |

Hosting an instance? See [wallet demo deployment](testnet-wallet-deployment.md) for settings, expected results, and local verification.
