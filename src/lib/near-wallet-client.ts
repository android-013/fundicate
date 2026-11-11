import type { NearConnector } from "@hot-labs/near-connect";

let connector: Promise<NearConnector> | undefined;

export function testnetConnector() {
  connector ??= import("@hot-labs/near-connect")
    .then(
      ({ NearConnector }) =>
        new NearConnector({
          network: "testnet",
          autoConnect: false,
          features: {
            signInWithoutAddKey: true,
            signMessage: true,
            signAndSendTransaction: true,
          },
        }),
    )
    .catch((error: unknown) => {
      connector = undefined;
      throw error;
    });
  return connector;
}

export async function nearAction<T>(
  operation: string,
  body: object,
): Promise<T> {
  const response = await fetch(`/api/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "The request could not be completed.");
  return result as T;
}
