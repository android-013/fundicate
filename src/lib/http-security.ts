import { isIP } from "node:net";
import { AppError, ensure } from "./errors";

/** Local browser aliases are allowed only for same-origin development requests. */
export function requestOriginAllowed(
  incoming: string | null,
  requestUrl: string,
  configured: string,
  environment: string | undefined = process.env.NODE_ENV,
) {
  if (!incoming) return false;
  if (incoming === configured) return true;
  if (environment !== "development") return false;
  try {
    const origin = new URL(incoming);
    const target = new URL(requestUrl);
    const canonical = new URL(configured);
    const loopback = (url: URL) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      incoming === origin.origin &&
      origin.origin === target.origin &&
      loopback(origin) &&
      loopback(canonical) &&
      origin.protocol === canonical.protocol &&
      origin.port === canonical.port
    );
  } catch {
    return false;
  }
}

export const requestPolicy = {
  maxBodyBytes: 250_000,
  authGlobal: { limit: 1000, seconds: 900 },
  authIp: { limit: 60, seconds: 900 },
  loginAccount: { limit: 10, seconds: 900 },
  registerAccount: { limit: 5, seconds: 900 },
  mutation: { limit: 180, seconds: 60 },
  sensitive: { limit: 5, seconds: 900 },
  action: { limit: 30, seconds: 60 },
} as const;

/** Only a proxy that overwrites this header and blocks direct access may supply it. */
export function trustedClientIp(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
) {
  const name = env.TRUSTED_CLIENT_IP_HEADER;
  if (
    env.NODE_ENV === "production" &&
    env.APP_ORIGIN &&
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.APP_ORIGIN).hostname,
    )
  )
    ensure(name, "Client address policy is unavailable.", 503);
  if (!name) return null;
  ensure(
    ["x-real-ip", "cf-connecting-ip"].includes(name),
    "Client address policy is unavailable.",
    503,
  );
  const value = headers.get(name)?.trim();
  ensure(value && isIP(value), "Client address is unavailable.", 400);
  return isIP(value) === 6
    ? new URL(`http://[${value}]/`).hostname.slice(1, -1)
    : value;
}

export async function readJsonBody(
  request: Request,
  maxBytes: number = requestPolicy.maxBodyBytes,
) {
  const type = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  ensure(type === "application/json", "Use a JSON request.", 415);
  const length = request.headers.get("content-length");
  ensure(length === null || /^\d+$/.test(length), "Invalid request length.");
  ensure(
    length === null || Number(length) <= maxBytes,
    "Request too large.",
    413,
  );
  ensure(
    !request.headers.get("content-encoding") ||
      request.headers.get("content-encoding") === "identity",
    "Compressed requests are not accepted.",
    415,
  );
  const reader = request.body?.getReader();
  ensure(reader, "Invalid JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError("Request too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AppError("Invalid JSON.");
  }
  ensure(
    body !== null && typeof body === "object" && !Array.isArray(body),
    "Use a JSON object.",
  );
  function inspect(value: unknown, depth: number) {
    ensure(depth <= 16, "Request nesting is too deep.");
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        ensure(
          !["__proto__", "constructor", "prototype"].includes(key),
          "Invalid request property.",
        );
        inspect(child, depth + 1);
      }
    }
  }
  inspect(body, 0);
  return body;
}
