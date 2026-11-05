export type AccessPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sub?: string;
  [key: string]: unknown;
};

export type AccessVerification =
  | { ok: true; payload: AccessPayload }
  | { ok: false; status: 401 | 403; error: string };

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

type VerifyOptions = {
  teamDomain: string;
  audience: string;
  allowedEmail?: string;
  now?: number;
  fetchImpl?: typeof fetch;
};

const JWKS_TTL_MS = 5 * 60 * 1000;
let jwksCache: { url: string; keys: Jwk[]; expires: number } | null = null;

export function clearAccessJwksCache(): void {
  jwksCache = null;
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(segment))) as T;
}

function normalizeTeamDomain(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function fetchKeys(
  teamDomain: string,
  fetchImpl: typeof fetch,
): Promise<Jwk[]> {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (jwksCache && jwksCache.url === url && jwksCache.expires > Date.now()) {
    return jwksCache.keys;
  }

  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Access JWKS returned ${response.status}.`);

  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (keys.length === 0) throw new Error("Access JWKS contained no keys.");

  jwksCache = { url, keys, expires: Date.now() + JWKS_TTL_MS };
  return keys;
}

export async function verifyAccessJwt(
  token: string,
  options: VerifyOptions,
): Promise<AccessVerification> {
  const teamDomain = normalizeTeamDomain(options.teamDomain);
  if (!teamDomain || !options.audience || !token.includes(".")) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  let header: { alg?: string; kid?: string };
  let payload: AccessPayload;
  try {
    header = decodeSegment<{ alg?: string; kid?: string }>(parts[0]);
    payload = decodeSegment<AccessPayload>(parts[1]);
  } catch {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  if (header.alg !== "RS256" || !header.kid) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let keys: Jwk[];
  try {
    keys = await fetchKeys(teamDomain, fetchImpl);
  } catch {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  let jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    clearAccessJwksCache();
    try {
      keys = await fetchKeys(teamDomain, fetchImpl);
      jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    } catch {
      return { ok: false, status: 401, error: "Unauthorized." };
    }
  }
  if (!jwk) return { ok: false, status: 401, error: "Unauthorized." };

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return { ok: false, status: 401, error: "Unauthorized." };
  } catch {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    payload.iss !== teamDomain ||
    !audiences.includes(options.audience) ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSeconds ||
    (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 30) ||
    (typeof payload.iat === "number" && payload.iat > nowSeconds + 30)
  ) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  if (
    options.allowedEmail &&
    (!payload.email ||
      payload.email.toLowerCase() !== options.allowedEmail.trim().toLowerCase())
  ) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  return { ok: true, payload };
}
