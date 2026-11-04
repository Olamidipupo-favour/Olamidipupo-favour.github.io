interface Env {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  TURNSTILE_HOSTNAMES?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  ALLOWED_ORIGINS?: string;
  ADMIN_TOKEN?: string;
  REACTION_SALT?: string;
  SANITY_WEBHOOK_SECRET?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
}

const REACTION_TYPES = new Set(["fire", "brain", "ship", "clap"]);
const COMMENT_STATUSES = new Set(["pending", "approved", "rejected"]);
const CONTACT_KINDS = new Set(["role", "freelance", "other"]);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Json = Record<string, unknown>;

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function json(data: Json, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);
}

async function readJson(request: Request): Promise<Json | null> {
  if (!request.headers.get("Content-Type")?.includes("application/json")) return null;
  try {
    const data = (await request.json()) as unknown;
    return data && typeof data === "object" ? (data as Json) : null;
  } catch {
    return null;
  }
}

async function voterId(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bytes = new TextEncoder().encode(`${ip}:${env.REACTION_SALT ?? "unset"}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return hex(signature);
}

async function verifySanitySignature(
  env: Env,
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = env.SANITY_WEBHOOK_SECRET;
  const header = request.headers.get("sanity-webhook-signature");
  if (!secret || !header) return false;

  const parts = header.split(",").map((part) => part.trim());
  const timestamp = Number(
    parts.find((part) => part.startsWith("t="))?.slice(2) ?? NaN,
  );
  const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!Number.isFinite(timestamp) || !signature) return false;

  const seconds = timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp;
  if (Math.abs(Date.now() / 1000 - seconds) > 300) return false;

  const signed = await hmacHex(secret, `${timestamp}.${rawBody}`);
  const unsigned = await hmacHex(secret, rawBody);
  return (
    safeEqual(signature.toLowerCase(), signed) ||
    safeEqual(signature.toLowerCase(), unsigned)
  );
}

async function handleActivity(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405, origin);
  }

  const [comments, reactions] = await Promise.all([
    env.DB.prepare(
      "SELECT slug, name, body, created_at AS created FROM comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT 6",
    ).all<{ slug: string; name: string; body: string; created: string }>(),
    env.DB.prepare(
      "SELECT slug, type, COUNT(*) AS count, MAX(created_at) AS created FROM reactions GROUP BY slug, type ORDER BY created DESC LIMIT 6",
    ).all<{ slug: string; type: string; count: number; created: string }>(),
  ]);

  const activity = [
    ...comments.results.map((comment) => ({
      kind: "comment",
      slug: comment.slug,
      name: comment.name,
      text: comment.body.slice(0, 180),
      created: comment.created,
    })),
    ...reactions.results.map((reaction) => ({
      kind: "reaction",
      slug: reaction.slug,
      reaction: reaction.type,
      count: Number(reaction.count),
      created: reaction.created,
    })),
  ]
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, 8);

  return json({ activity }, 200, origin);
}

async function handleRebuild(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, origin);
  }
  if (!env.SANITY_WEBHOOK_SECRET) {
    return json({ error: "Webhook secret is not configured." }, 503, origin);
  }

  const rawBody = await request.text();
  if (!(await verifySanitySignature(env, request, rawBody))) {
    return json({ error: "Invalid webhook signature." }, 401, origin);
  }

  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    return json({ error: "GitHub dispatch is not configured." }, 503, origin);
  }

  const voter = await voterId(request, env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM rebuild_requests WHERE voter = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')",
  )
    .bind(voter)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 3) {
    return json({ error: "Too many rebuild requests. Try again later." }, 429, origin);
  }

  await env.DB.prepare("INSERT INTO rebuild_requests (voter) VALUES (?)")
    .bind(voter)
    .run();
  await env.DB.prepare(
    "DELETE FROM rebuild_requests WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')",
  ).run();

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dipo-portfolio-rebuild",
      },
      body: JSON.stringify({ event_type: "sanity-publish" }),
    },
  );

  if (!response.ok) {
    console.error("GitHub dispatch failed", response.status, await response.text());
    return json({ error: "GitHub dispatch failed." }, 502, origin);
  }

  return json({ ok: true }, 202, origin);
}

async function verifyTurnstile(
  env: Env,
  request: Request,
  token: string,
  expectedAction: string,
): Promise<boolean> {
  const allowedHostnames = new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
  if (
    !env.TURNSTILE_SECRET ||
    !token ||
    token.length > 2048 ||
    allowedHostnames.size === 0
  ) {
    return false;
  }

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  let result: {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return false;
    result = (await response.json()) as typeof result;
  } catch {
    return false;
  }

  return (
    result.success === true &&
    result.action === expectedAction &&
    allowedHostnames.has(result.hostname ?? "")
  );
}

async function reactionCounts(env: Env, slug: string): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT type, COUNT(*) AS count FROM reactions WHERE slug = ? GROUP BY type",
  )
    .bind(slug)
    .all<{ type: string; count: number }>();
  const counts: Record<string, number> = {};
  for (const row of results) counts[row.type] = Number(row.count);
  return counts;
}

function adminAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return false;
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), env.ADMIN_TOKEN);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendContactEmail(
  env: Env,
  input: { name: string; email: string; kind: string; message: string },
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: input.email,
      subject: `[${input.kind}] Portfolio message from ${input.name}`.replace(
        /[\r\n]+/g,
        " ",
      ),
      text: `${input.message}\n\n— ${input.name} (${input.email})`,
      html: `<p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p><p>— ${escapeHtml(input.name)} (${escapeHtml(input.email)})</p><p>Kind: ${escapeHtml(input.kind)}</p>`,
    }),
  });
  if (!response.ok) {
    console.error("Resend failed", response.status, await response.text());
  }
}

async function handleComments(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
): Promise<Response> {
  if (request.method === "GET") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!SLUG_PATTERN.test(slug)) return json({ error: "Invalid slug." }, 400, origin);
    const { results } = await env.DB.prepare(
      "SELECT id, name, body, created_at AS created FROM comments WHERE slug = ? AND status = 'approved' ORDER BY created_at ASC LIMIT 100",
    )
      .bind(slug)
      .all<{ id: number; name: string; body: string; created: string }>();
    return json({ comments: results }, 200, origin);
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400, origin);

  const slug = clean(body.slug, 120);
  const name = clean(body.name, 60);
  const text = clean(body.body, 2000);
  const token = String(body.turnstileToken ?? "");

  if (!SLUG_PATTERN.test(slug)) return json({ error: "Invalid slug." }, 400, origin);
  if (name.length < 1) return json({ error: "Add a name." }, 400, origin);
  if (text.length < 2) return json({ error: "Comment is too short." }, 400, origin);

  const verified = await verifyTurnstile(env, request, token, "comment");
  if (!verified) {
    return json({ error: "Spam check failed. Refresh and try again." }, 400, origin);
  }

  const voter = await voterId(request, env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM comments WHERE voter = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes')",
  )
    .bind(voter)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 3) {
    return json({ error: "Too many comments. Try again later." }, 429, origin);
  }

  await env.DB.prepare(
    "INSERT INTO comments (slug, name, body, status, voter) VALUES (?, ?, ?, 'pending', ?)",
  )
    .bind(slug, name, text, voter)
    .run();

  return json({ ok: true, status: "pending" }, 201, origin);
}

async function handleReactions(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
): Promise<Response> {
  if (request.method === "GET") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!SLUG_PATTERN.test(slug)) return json({ error: "Invalid slug." }, 400, origin);
    return json({ counts: await reactionCounts(env, slug) }, 200, origin);
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400, origin);

  const slug = clean(body.slug, 120);
  const type = clean(body.type, 20);
  if (!SLUG_PATTERN.test(slug)) return json({ error: "Invalid slug." }, 400, origin);
  if (!REACTION_TYPES.has(type)) return json({ error: "Unknown reaction." }, 400, origin);

  const voter = await voterId(request, env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM reactions WHERE voter = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')",
  )
    .bind(voter)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 30) {
    return json({ error: "Too many reactions. Try again later." }, 429, origin);
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO reactions (slug, type, voter) VALUES (?, ?, ?)",
  )
    .bind(slug, type, voter)
    .run();

  return json({ counts: await reactionCounts(env, slug) }, 200, origin);
}

async function handleContact(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400, origin);

  const name = clean(body.name, 100);
  const email = clean(body.email, 200).toLowerCase();
  const kind = clean(body.kind, 20);
  const message = clean(body.message, 5000);

  if (name.length < 1) return json({ error: "Add your name." }, 400, origin);
  if (!EMAIL_PATTERN.test(email)) return json({ error: "Add a valid email." }, 400, origin);
  if (!CONTACT_KINDS.has(kind)) return json({ error: "Choose a topic." }, 400, origin);
  if (message.length < 10) return json({ error: "Message is too short." }, 400, origin);
  if (String(body.website ?? "")) return json({ ok: true }, 201, origin);

  const verified = await verifyTurnstile(
    env,
    request,
    String(body.turnstileToken ?? ""),
    "contact",
  );
  if (!verified) {
    return json({ error: "Spam check failed. Refresh and try again." }, 400, origin);
  }

  await env.DB.prepare(
    "INSERT INTO submissions (name, email, kind, message) VALUES (?, ?, ?, ?)",
  )
    .bind(name, email, kind, message)
    .run();

  try {
    await sendContactEmail(env, { name, email, kind, message });
  } catch (error) {
    console.error("Contact email failed", error);
  }

  return json({ ok: true }, 201, origin);
}

async function handleAdmin(
  request: Request,
  env: Env,
  url: URL,
  origin: string | null,
): Promise<Response> {
  if (!adminAuthorized(request, env)) {
    return json({ error: "Unauthorized." }, 401, origin);
  }

  const match = url.pathname.replace(/\/+$/, "").match(/^\/api\/admin\/comments\/(\d+)$/);
  if (match && request.method === "PATCH") {
    const body = await readJson(request);
    const status = clean(body?.status, 20);
    if (!COMMENT_STATUSES.has(status)) {
      return json({ error: "Status must be pending, approved or rejected." }, 400, origin);
    }
    const result = await env.DB.prepare("UPDATE comments SET status = ? WHERE id = ?")
      .bind(status, Number(match[1]))
      .run();
    if (!result.meta.changes) return json({ error: "Comment not found." }, 404, origin);
    return json({ ok: true, status }, 200, origin);
  }

  if (url.pathname.replace(/\/+$/, "") === "/api/admin/comments" && request.method === "GET") {
    const requested = url.searchParams.get("status") ?? "pending";
    const status = requested === "all" ? null : requested;
    if (status && !COMMENT_STATUSES.has(status)) {
      return json({ error: "Unknown status." }, 400, origin);
    }
    const query = status
      ? "SELECT id, slug, name, body, status, created_at AS created FROM comments WHERE status = ? ORDER BY created_at ASC LIMIT 200"
      : "SELECT id, slug, name, body, status, created_at AS created FROM comments ORDER BY created_at DESC LIMIT 200";
    const statement = env.DB.prepare(query);
    const { results } = status
      ? await statement.bind(status).all()
      : await statement.all();
    return json({ comments: results }, 200, origin);
  }

  if (url.pathname.replace(/\/+$/, "") === "/api/admin/submissions" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, email, kind, message, status, created_at AS created FROM submissions ORDER BY created_at DESC LIMIT 200",
    ).all();
    return json({ submissions: results }, 200, origin);
  }

  return json({ error: "Not found." }, 404, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const origin = allowedOrigin(request, env);
    const requestOrigin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      if (requestOrigin && !origin) {
        return new Response("Origin not allowed.", { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (requestOrigin && !origin) {
      return json({ error: "Origin not allowed." }, 403, null);
    }

    try {
      if (path === "/api/health" && request.method === "GET") {
        return json({ ok: true }, 200, origin);
      }
      if (path === "/api/comments") return await handleComments(request, env, url, origin);
      if (path === "/api/reactions") return await handleReactions(request, env, url, origin);
      if (path === "/api/contact") return await handleContact(request, env, origin);
      if (path === "/api/activity") return await handleActivity(request, env, origin);
      if (path === "/rebuild") return await handleRebuild(request, env, origin);
      if (path.startsWith("/api/admin/")) return await handleAdmin(request, env, url, origin);
      return json({ error: "Not found." }, 404, origin);
    } catch (error) {
      console.error("Worker error", error);
      return json({ error: "Server error. Try again later." }, 500, origin);
    }
  },
};
