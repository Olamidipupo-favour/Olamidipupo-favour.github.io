import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAccessJwksCache,
  verifyAccessJwt,
} from "../src/access";

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUDIENCE = "admin-audience";
const EMAIL = "admin@example.com";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;
let fakeFetch: typeof fetch;

function base64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sign(payload: Record<string, unknown>): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: TEAM_DOMAIN,
    aud: AUDIENCE,
    email: EMAIL,
    iat: now,
    nbf: now,
    exp: now + 300,
    ...overrides,
  };
}

beforeEach(async () => {
  clearAccessJwksCache();
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  fakeFetch = (async () =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
});

describe("verifyAccessJwt", () => {
  it("accepts a valid Access token", async () => {
    const result = await verifyAccessJwt(await sign(claims()), {
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      allowedEmail: EMAIL,
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await verifyAccessJwt(await sign(claims({ exp: now - 1 })), {
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      allowedEmail: EMAIL,
      fetchImpl: fakeFetch,
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects the wrong audience", async () => {
    const result = await verifyAccessJwt(await sign(claims({ aud: "other" })), {
      teamDomain: TEAM_DOMAIN,
      audience: AUDIENCE,
      allowedEmail: EMAIL,
      fetchImpl: fakeFetch,
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a different allowed email", async () => {
    const result = await verifyAccessJwt(
      await sign(claims({ email: "someone@example.com" })),
      {
        teamDomain: TEAM_DOMAIN,
        audience: AUDIENCE,
        allowedEmail: EMAIL,
        fetchImpl: fakeFetch,
      },
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
