import { postgresUrl } from "./postgres-url.mjs";

export type RuntimeEnvironment = Record<string, string | undefined>;
export type RuntimeConfig = {
  mode: "standalone" | "near-testnet";
  origin: string;
  production: boolean;
  databaseUrl: string;
  near: {
    network: "testnet";
    rpcUrl: string;
    contractId: string;
    codeHash: string;
  } | null;
};

const loopback = (host: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(host);
function validUrl(value: string | undefined, name: string) {
  try {
    if (!value) throw new Error();
    return new URL(value);
  } catch {
    throw new Error(`${name} is missing or invalid.`);
  }
}

/** Deliberately called at runtime, never while importing/building a module. */
export function validateRuntimeConfig(
  env: RuntimeEnvironment = process.env,
): RuntimeConfig {
  const production = env.NODE_ENV === "production";
  if (env.NEXT_PUBLIC_NEAR_PRIVATE_KEY || env.NEXT_PUBLIC_PRIVATE_KEY)
    throw new Error(
      "Private keys must never be exposed through public environment variables.",
    );
  if (env.NEAR_PRIVATE_KEY || env.NEAR_SIGNER_PRIVATE_KEY)
    throw new Error(
      "The web service does not accept signing keys; use wallet approvals or a separately protected signer.",
    );
  const mode = env.FUNDICATE_MODE ?? "standalone";
  if (mode !== "standalone")
    throw new Error(
      "FUNDICATE_MODE must be standalone on this product branch.",
    );
  const origin = validUrl(env.APP_ORIGIN, "APP_ORIGIN");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error(
      "APP_ORIGIN must be a single HTTP(S) origin without credentials or a path.",
    );
  if (production && origin.protocol !== "https:" && !loopback(origin.hostname))
    throw new Error("Production APP_ORIGIN requires HTTPS outside loopback.");
  if (
    production &&
    !loopback(origin.hostname) &&
    !["x-real-ip", "cf-connecting-ip"].includes(
      env.TRUSTED_CLIENT_IP_HEADER ?? "",
    )
  )
    throw new Error(
      "Public deployment requires an explicitly trusted client IP header from an isolated reverse proxy.",
    );
  const database = postgresUrl(env.DATABASE_URL);
  if (production && env.ALLOW_DEMO_SEED === "true")
    throw new Error("ALLOW_DEMO_SEED must be disabled in production.");
  if (production && !loopback(database.hostname)) {
    const ssl = database.searchParams.get("sslmode");
    if (
      !["verify-full", "verify-ca"].includes(ssl ?? "") &&
      env.DATABASE_ALLOW_INSECURE_INTERNAL !== "true"
    )
      throw new Error(
        "Production PostgreSQL requires verified TLS or explicit DATABASE_ALLOW_INSECURE_INTERNAL=true on a private network.",
      );
  }
  const near = null;
  return {
    mode,
    origin: origin.origin,
    production,
    databaseUrl: database.href,
    near,
  };
}

/** Public/operator summaries exclude URLs, credentials, signer data and diagnostics. */
export function runtimeSummary(config: RuntimeConfig) {
  return {
    mode: config.mode,
    production: config.production,
    secureOrigin: config.origin.startsWith("https:"),
    database: "configured",
    network: config.near?.network ?? "local-simulation",
  };
}

export async function assertRuntimeReady(
  ping: () => Promise<unknown>,
  env: RuntimeEnvironment = process.env,
) {
  const config = validateRuntimeConfig(env);
  await ping();
  return config;
}
