import { NearWalletLogin } from "@/components/near-wallet-login";
import { walletLoginEnabled } from "@/lib/wallet-auth-config";
export const dynamic = "force-dynamic";
export default function Login() {
  return (
    <>
      <div className="eyebrow">YOUR WALLET. YOUR COMMUNITY.</div>
      <h1>Welcome to your collective.</h1>
      <p className="muted">
        Connect your NEAR testnet wallet to sign in or create your account.
      </p>
      {walletLoginEnabled() ? (
        <NearWalletLogin />
      ) : (
        <p role="status">Wallet sign-in is currently unavailable.</p>
      )}
    </>
  );
}
