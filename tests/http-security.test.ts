import { describe, expect, it } from "vitest";
import {
  readJsonBody,
  trustedClientIp,
  requestOriginAllowed,
} from "../src/lib/http-security";
import { loginSchema, registerSchema } from "../src/lib/validation";

const req = (body: string, headers = {}) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
describe("HTTP security boundaries", () => {
  it("accepts same-origin loopback aliases only in development", () => {
    const canonical = "http://127.0.0.1:3000";
    const local = "http://localhost:3000";
    expect(
      requestOriginAllowed(
        local,
        local + "/api/wallet-login-challenge",
        canonical,
        "development",
      ),
    ).toBe(true);
    for (const [origin, url, environment] of [
      [local, local, "production"],
      [local, canonical, "development"],
      ["http://localhost:4000", "http://localhost:4000", "development"],
      ["https://attacker.example", "https://attacker.example", "development"],
      ["null", local, "development"],
    ])
      expect(requestOriginAllowed(origin, url, canonical, environment)).toBe(
        false,
      );
    expect(requestOriginAllowed(null, local, canonical, "development")).toBe(
      false,
    );
    expect(
      requestOriginAllowed(canonical, canonical, canonical, "production"),
    ).toBe(true);
  });
  it("caps chunked bytes before collecting a complete body", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(64));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readJsonBody(request, 100)).rejects.toMatchObject({
      status: 413,
    });
    expect(cancelled).toBe(true);
    await expect(readJsonBody(req('{"text":"€€€"}'), 15)).rejects.toMatchObject(
      { status: 413 },
    );
  });
  it("rejects ambiguous MIME, compression, malformed lengths, UTF8, JSON, arrays and pollution", async () => {
    for (const [body, headers] of [
      ["{}", { "Content-Type": "application/jsonp" }],
      ["{}", { "Content-Length": "NaN" }],
      ["{}", { "Content-Encoding": "gzip" }],
      ["[]", {}],
      ["null", {}],
      ["{", {}],
      ['{"__proto__":{}}', {}],
    ] as const)
      await expect(readJsonBody(req(body, headers))).rejects.toBeDefined();
    const nested = { value: JSON.parse("[".repeat(20) + "0" + "]".repeat(20)) };
    await expect(
      readJsonBody(req(JSON.stringify(nested))),
    ).rejects.toBeDefined();
  });
  it("ignores spoofed proxy headers unless the operator explicitly trusts one", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "x-real-ip": "2001:db8:0:0::1",
    });
    expect(trustedClientIp(headers, {})).toBeNull();
    expect(() =>
      trustedClientIp(headers, {
        NODE_ENV: "production",
        APP_ORIGIN: "https://fundicate.example",
      }),
    ).toThrow("Client address policy");
    expect(
      trustedClientIp(headers, { TRUSTED_CLIENT_IP_HEADER: "x-real-ip" }),
    ).toBe("2001:db8::1");
    expect(() =>
      trustedClientIp(new Headers({ "x-real-ip": "1.2.3.4, 5.6.7.8" }), {
        TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      }),
    ).toThrow();
    expect(() =>
      trustedClientIp(headers, { TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for" }),
    ).toThrow();
  });
  it("canonicalizes account keys and rejects unknown auth privileges", () => {
    expect(
      loginSchema.parse({ email: "User@Example.com", password: "ok" }).email,
    ).toBe("user@example.com");
    expect(
      loginSchema.safeParse({
        email: "user@example.com",
        password: "ok",
        role: "ADMIN",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "user@example.com",
        username: "user",
        displayName: "Test",
        password: "SecureLongPassword123!",
        admin: true,
      }).success,
    ).toBe(false);
  });
});
