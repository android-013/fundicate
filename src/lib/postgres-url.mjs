// Keep node-postgres, Prisma's pg adapter and libpq operator tools on the same
// identity/transport. Query parameters must not shadow the URL authority, and
// duplicate parameters must not give validators and clients different values.
const authorityParameters = new Set([
  "host",
  "hostaddr",
  "port",
  "user",
  "username",
  "password",
  "database",
  "dbname",
  "service",
  "servicefile",
  "connectionstring",
]);

/** @param {string | URL | undefined} raw @param {string} [label] @returns {URL} */
export function postgresUrl(raw, label = "DATABASE_URL") {
  const name = label === "RUNTIME_DATABASE_URL" ? label : "DATABASE_URL";
  let url;
  try {
    if (!raw) throw new Error();
    url = new URL(raw);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1) ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      `${name} must name a PostgreSQL host and database; its value was not logged.`,
    );
  }
  const seen = new Set();
  for (const key of url.searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (authorityParameters.has(normalized))
      throw new Error(
        `${name} query parameters must not override connection identity.`,
      );
    if (seen.has(normalized))
      throw new Error(`${name} must not repeat connection query parameters.`);
    seen.add(normalized);
  }
  return url;
}

/** libpq's PGHOST takes a bare IPv6 address, unlike URL.hostname. */
/** @param {URL} url */
export function postgresHost(url) {
  return url.hostname.replace(/^\[(.+)\]$/, "$1");
}
