import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrustedOrigins } from "../src/lib/origins";
import { assertMutationOrigin } from "../src/server/http";

const loopbackOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"];

describe("trusted deployment origins", () => {
  it.each(loopbackOrigins)("accepts equivalent loopback addresses when configured as %s", (baseURL) => {
    expect(getTrustedOrigins(baseURL)).toEqual(expect.arrayContaining(loopbackOrigins));
    expect(getTrustedOrigins(baseURL)).toHaveLength(3);
  });

  it("preserves HTTPS and the configured port for every loopback alias", () => {
    expect(getTrustedOrigins("https://localhost:3443/auth")).toEqual([
      "https://localhost:3443", "https://127.0.0.1:3443", "https://[::1]:3443",
    ]);
  });

  it.each(["https://brain.example", "https://localhost.example", "https://127.0.0.1.example"])(
    "trusts only the configured origin for remote deployment %s",
    (baseURL) => expect(getTrustedOrigins(`${baseURL}/auth`)).toEqual([baseURL]),
  );
});

describe("mutation origin protection", () => {
  beforeEach(() => vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000"));
  afterEach(() => vi.unstubAllEnvs());

  function request(origin: string, fetchSite = "same-origin") {
    return new Request(`${origin}/api/items`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "sec-fetch-site": fetchSite },
    });
  }

  it.each(loopbackOrigins)("allows a same-origin mutation through %s", (origin) => {
    expect(() => assertMutationOrigin(request(origin))).not.toThrow();
  });

  it.each([
    "http://localhost:3001", "http://127.0.0.1:3001", "https://localhost:3000",
    "https://127.0.0.1:3000", "http://localhost.example:3000", "http://attacker.example:3000",
  ])("rejects an unrelated origin %s", (origin) => {
    expect(() => assertMutationOrigin(request(origin))).toThrow("Questa richiesta non proviene da Synapse.");
  });

  it("still rejects cross-site requests even from a trusted origin", () => {
    expect(() => assertMutationOrigin(request("http://127.0.0.1:3000", "cross-site")))
      .toThrow("Questa richiesta non proviene da Synapse.");
  });

  it("does not trust loopback origins when deployed at a remote origin", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://brain.example");
    expect(() => assertMutationOrigin(request("https://brain.example"))).not.toThrow();
    for (const origin of loopbackOrigins) {
      expect(() => assertMutationOrigin(request(origin))).toThrow("Questa richiesta non proviene da Synapse.");
    }
  });
});
