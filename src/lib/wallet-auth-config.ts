// Wallet authentication is independent of the dormant payment provider.
export const walletLoginEnabled = () =>
  process.env.NEAR_WALLET_LOGIN !== "false";
export function walletLoginRpcUrl() {
  const url = new URL(
    process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
  );
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      "Wallet authentication requires an HTTPS testnet RPC without credentials.",
    );
  return url.href;
}
