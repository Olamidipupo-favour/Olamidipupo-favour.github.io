import { z } from "zod";
import { verifyAccessJwt } from "./access";
import { listApprovedComments } from "./comments";

interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  TURNSTILE_SECRET?: string;
  TURNSTILE_HOSTNAMES?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  ALLOWED_ORIGINS?: string;
  REACTION_SALT?: string;
  SANITY_WEBHOOK_SECRET?: string;
  GITHUB_REPO?: string;
  GITHUB_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
  ADMIN_ORIGIN?: string;
}

const REACTION_TYPES = new Set(["fire", "brain", "ship", "clap"]);
const COMMENT_STATUSES = new Set(["pending", "approved", "rejected", "spam"]);
const CONTACT_KINDS = new Set(["role", "freelance", "other"]);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE_SIZE = 20;
const ADMIN_RATE_LIMIT = 120;

const commentStatusSchema = z.enum(["pending", "approved", "rejected", "spam"]);
const adminPageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const adminSearchSchema = z.string().trim().max(160).default("");
const bulkCommentsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["approve", "reject", "spam", "delete"]),
});
const submissionActionSchema = z.object({
  action: z.enum(["read", "unread", "archive", "unarchive"]),
});
const settingsSchema = z.object({ autoApprove: z.boolean() });
const blocklistSchema = z.object({
  type: z.enum(["word", "ip_hash"]),
  value: z.string().trim().min(2).max(160),
});
const publicCommentSchema = z.object({
  slug: z.string(),
  name: z.string(),
  body: z.string(),
  turnstileToken: z.string().max(2048).optional().default(""),
  website: z.string().max(500).optional().default(""),
});
const publicReactionSchema = z.object({
  slug: z.string(),
  type: z.string(),
});
const contactSchema = z.object({
  name: z.string(),
  email: z.string(),
  kind: z.string(),
  message: z.string(),
  turnstileToken: z.string().max(2048).optional().default(""),
  website: z.string().max(500).optional().default(""),
});

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

function adminCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function adminJson(data: Json, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...adminCorsHeaders(origin),
    },
  });
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

async function hmacBase64Url(secret: string, payload: string): Promise<string> {
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
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  if (!Number.isInteger(timestamp) || timestamp < 1_609_459_200_000 || !signature) {
    return false;
  }
  if (Math.abs(Date.now() - timestamp) > 300_000) return false;

  const expected = await hmacBase64Url(secret, `${timestamp}.${rawBody}`);
  return safeEqual(signature, expected);
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

async function dispatchRebuild(env: Env): Promise<{ ok: true } | { ok: false; status: 502 | 503; error: string }> {
  if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
    return { ok: false, status: 503, error: "GitHub dispatch is not configured." };
  }

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
    return { ok: false, status: 502, error: "GitHub dispatch failed." };
  }

  return { ok: true };
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

  const result = await dispatchRebuild(env);
  if (!result.ok) return json({ error: result.error }, result.status, origin);
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

async function commentModeration(
  env: Env,
  ipHash: string,
  text: string,
): Promise<{ status: "pending" | "approved" | "spam"; spamScore: number }> {
  const [blocked, setting] = await Promise.all([
    env.DB.prepare(
      "SELECT 1 AS hit FROM blocklist WHERE (type = 'ip_hash' AND value = ?) OR (type = 'word' AND instr(lower(?), value) > 0) LIMIT 1",
    )
      .bind(ipHash, text)
      .first<{ hit: number }>(),
    env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'comment_auto_approve'",
    ).first<{ value: string }>(),
  ]);

  if (blocked) return { status: "spam", spamScore: 1 };
  if (setting?.value === "on") return { status: "approved", spamScore: 0 };
  return { status: "pending", spamScore: 0 };
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
    return json({ comments: await listApprovedComments(env.DB, slug) }, 200, origin);
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const body = await readJson(request);
  if (!body) return json({ error: "Expected JSON." }, 400, origin);

  const parsed = publicCommentSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input." }, 400, origin);

  const slug = clean(parsed.data.slug, 120);
  const name = clean(parsed.data.name, 60);
  const text = clean(parsed.data.body, 2000);
  const token = parsed.data.turnstileToken;

  if (parsed.data.website) return json({ ok: true, status: "pending" }, 201, origin);
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

  const moderation = await commentModeration(env, voter, `${name}\n${text}`);
  await env.DB.prepare(
    "INSERT INTO comments (slug, name, body, status, voter, ip_hash, spam_score) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(slug, name, text, moderation.status, voter, voter, moderation.spamScore)
    .run();

  return json({ ok: true, status: moderation.status }, 201, origin);
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

  const parsed = publicReactionSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input." }, 400, origin);

  const slug = clean(parsed.data.slug, 120);
  const type = clean(parsed.data.type, 20);
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

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid input." }, 400, origin);

  const name = clean(parsed.data.name, 100);
  const email = clean(parsed.data.email, 200).toLowerCase();
  const kind = clean(parsed.data.kind, 20);
  const message = clean(parsed.data.message, 5000);

  if (name.length < 1) return json({ error: "Add your name." }, 400, origin);
  if (!EMAIL_PATTERN.test(email)) return json({ error: "Add a valid email." }, 400, origin);
  if (!CONTACT_KINDS.has(kind)) return json({ error: "Choose a topic." }, 400, origin);
  if (message.length < 10) return json({ error: "Message is too short." }, 400, origin);
  if (parsed.data.website) return json({ ok: true }, 201, origin);

  const verified = await verifyTurnstile(
    env,
    request,
    parsed.data.turnstileToken,
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

function auditStatement(env: Env, action: string, target: string): D1PreparedStatement {
  return env.DB.prepare("INSERT INTO audit_log (action, target) VALUES (?, ?)").bind(
    action.slice(0, 80),
    target.slice(0, 200),
  );
}

async function adminRateLimited(env: Env, request: Request): Promise<boolean> {
  const voter = await voterId(request, env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM admin_rate_limits WHERE voter = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')",
  )
    .bind(voter)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= ADMIN_RATE_LIMIT) return true;

  await env.DB.prepare("INSERT INTO admin_rate_limits (voter) VALUES (?)")
    .bind(voter)
    .run();
  if (Math.random() < 0.02) {
    await env.DB.prepare(
      "DELETE FROM admin_rate_limits WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')",
    ).run();
  }
  return false;
}

function adminPage(url: URL): number {
  const parsed = adminPageSchema.safeParse(url.searchParams.get("page") ?? "1");
  return parsed.success ? parsed.data : 1;
}

function adminSearch(url: URL): string {
  const parsed = adminSearchSchema.safeParse(url.searchParams.get("q") ?? "");
  return parsed.success ? parsed.data : "";
}

type GithubRun = {
  id: number;
  status: string | null;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  event: string;
};

async function latestGithubRun(env: Env): Promise<GithubRun | null> {
  if (!env.GITHUB_REPO) return null;
  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/runs?branch=main&per_page=1`;
  const baseHeaders = {
    Accept: "application/vnd.github+json",
    "User-Agent": "dipo-portfolio-admin",
  };
  const request = (token?: string) =>
    fetch(endpoint, {
      headers: token
        ? { ...baseHeaders, Authorization: `Bearer ${token}` }
        : baseHeaders,
      signal: AbortSignal.timeout(10_000),
    });

  try {
    let response = await request(env.GITHUB_TOKEN);
    if (response.status === 401 || response.status === 403) {
      response = await request();
    }
    if (!response.ok) return null;

    const data = (await response.json()) as {
      workflow_runs?: Array<{
        id: number;
        status: string | null;
        conclusion: string | null;
        created_at: string;
        updated_at: string;
        html_url: string;
        event: string;
      }>;
    };
    const run = data.workflow_runs?.[0];
    if (!run) return null;
    return {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      url: run.html_url,
      event: run.event,
    };
  } catch {
    return null;
  }
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function handleAdmin(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const configuredOrigin = (env.ADMIN_ORIGIN ?? "").trim();
  const requestOrigin = request.headers.get("Origin");
  if (!configuredOrigin) {
    return adminJson({ error: "Admin is not configured." }, 503, null);
  }

  if (request.method === "OPTIONS") {
    if (requestOrigin !== configuredOrigin) {
      return new Response("Origin not allowed.", { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: adminCorsHeaders(configuredOrigin),
    });
  }

  const origin = requestOrigin === configuredOrigin ? configuredOrigin : null;
  if (requestOrigin && !origin) {
    return adminJson({ error: "Origin not allowed." }, 403, null);
  }
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_EMAIL) {
    return adminJson({ error: "Admin authentication is not configured." }, 503, origin);
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion") ?? "";
  if (!token) return adminJson({ error: "Unauthorized." }, 401, origin);

  const verification = await verifyAccessJwt(token, {
    teamDomain: env.CF_ACCESS_TEAM_DOMAIN,
    audience: env.CF_ACCESS_AUD,
    allowedEmail: env.ADMIN_EMAIL,
  });
  if (!verification.ok) {
    return adminJson({ error: verification.error }, verification.status, origin);
  }

  if (await adminRateLimited(env, request)) {
    return adminJson({ error: "Too many admin requests. Try again later." }, 429, origin);
  }

  const path = url.pathname.replace(/\/+$/, "");
  const email = String(verification.payload.email ?? "");
  const page = adminPage(url);
  const offset = (page - 1) * PAGE_SIZE;
  const q = adminSearch(url);

  if (path === "/admin/session" && request.method === "GET") {
    return adminJson(
      {
        email,
        expiresAt: verification.payload.exp,
        now: Math.floor(Date.now() / 1000),
      },
      200,
      origin,
    );
  }

  if (path === "/admin/overview" && request.method === "GET") {
    const [pending, unread, top, commentsByDay, reactionsByDay, messagesByDay] =
      await Promise.all([
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'",
        ).first<{ count: number }>(),
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM submissions WHERE read_at IS NULL AND archived_at IS NULL",
        ).first<{ count: number }>(),
        env.DB.prepare(
          "SELECT slug, COUNT(*) AS count FROM reactions GROUP BY slug ORDER BY count DESC, slug ASC LIMIT 5",
        ).all<{ slug: string; count: number }>(),
        env.DB.prepare(
          "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM comments WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days') GROUP BY day",
        ).all<{ day: string; count: number }>(),
        env.DB.prepare(
          "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM reactions WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days') GROUP BY day",
        ).all<{ day: string; count: number }>(),
        env.DB.prepare(
          "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM submissions WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 days') GROUP BY day",
        ).all<{ day: string; count: number }>(),
      ]);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setUTCDate(today.getUTCDate() - (6 - index));
      return {
        day: day.toISOString().slice(0, 10),
        comments: 0,
        reactions: 0,
        messages: 0,
      };
    });
    const byDay = new Map(days.map((day) => [day.day, day]));
    for (const row of commentsByDay.results) {
      const day = byDay.get(row.day);
      if (day) day.comments = Number(row.count);
    }
    for (const row of reactionsByDay.results) {
      const day = byDay.get(row.day);
      if (day) day.reactions = Number(row.count);
    }
    for (const row of messagesByDay.results) {
      const day = byDay.get(row.day);
      if (day) day.messages = Number(row.count);
    }

    return adminJson(
      {
        pendingComments: Number(pending?.count ?? 0),
        unreadMessages: Number(unread?.count ?? 0),
        topPosts: top.results.map((row) => ({
          slug: row.slug,
          count: Number(row.count),
        })),
        activity: days,
      },
      200,
      origin,
    );
  }

  if (path === "/admin/comments" && request.method === "GET") {
    const requested = url.searchParams.get("status") ?? "pending";
    const status = requested === "all" ? null : requested;
    if (status && !COMMENT_STATUSES.has(status)) {
      return adminJson({ error: "Unknown status." }, 400, origin);
    }

    const where: string[] = [];
    const binds: unknown[] = [];
    if (status) {
      where.push("status = ?");
      binds.push(status);
    }
    if (q) {
      where.push(
        "(instr(lower(slug), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0 OR instr(lower(body), lower(?)) > 0)",
      );
      binds.push(q, q, q);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const total = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM comments${whereSql}`,
    )
      .bind(...binds)
      .first<{ count: number }>();
    const { results } = await env.DB.prepare(
      `SELECT id, slug, name, body, status, spam_score AS spamScore, ip_hash AS ipHash, created_at AS created, updated_at AS updated FROM comments${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...binds, PAGE_SIZE, offset)
      .all();

    const count = Number(total?.count ?? 0);
    return adminJson(
      {
        comments: results,
        total: count,
        page,
        pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
      },
      200,
      origin,
    );
  }

  if (path === "/admin/comments/bulk" && request.method === "POST") {
    const parsed = bulkCommentsSchema.safeParse(await readJson(request));
    if (!parsed.success) return adminJson({ error: "Invalid bulk action." }, 400, origin);

    const ids = [...new Set(parsed.data.ids)];
    const statements: D1PreparedStatement[] = [];
    for (const id of ids) {
      if (parsed.data.action === "delete") {
        statements.push(
          env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id),
        );
      } else {
        const status =
          parsed.data.action === "approve"
            ? "approved"
            : parsed.data.action === "reject"
              ? "rejected"
              : "spam";
        statements.push(
          env.DB.prepare(
            "UPDATE comments SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
          ).bind(status, id),
        );
      }
      statements.push(
        auditStatement(env, `comment.${parsed.data.action}`, `comment:${id}`),
      );
    }
    await env.DB.batch(statements);
    return adminJson({ ok: true, count: ids.length }, 200, origin);
  }

  const commentMatch = path.match(/^\/admin\/comments\/(\d+)$/);
  if (commentMatch && request.method === "PATCH") {
    const parsed = commentStatusSchema.safeParse((await readJson(request))?.status);
    if (!parsed.success) return adminJson({ error: "Invalid status." }, 400, origin);
    const id = Number(commentMatch[1]);
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE comments SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
      ).bind(parsed.data, id),
      auditStatement(env, `comment.${parsed.data}`, `comment:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Comment not found." }, 404, origin);
    }
    return adminJson({ ok: true, status: parsed.data }, 200, origin);
  }

  if (commentMatch && request.method === "DELETE") {
    const id = Number(commentMatch[1]);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id),
      auditStatement(env, "comment.delete", `comment:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Comment not found." }, 404, origin);
    }
    return adminJson({ ok: true }, 200, origin);
  }

  if (path === "/admin/submissions/export.csv" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, email, kind, message, status, created_at, read_at, archived_at FROM submissions ORDER BY created_at DESC LIMIT 5000",
    ).all<{
      id: number;
      name: string;
      email: string;
      kind: string;
      message: string;
      status: string;
      created_at: string;
      read_at: string | null;
      archived_at: string | null;
    }>();
    const header = [
      "id",
      "name",
      "email",
      "kind",
      "message",
      "status",
      "created_at",
      "read_at",
      "archived_at",
    ];
    const lines = [
      header.map(csvCell).join(","),
      ...results.map((row) =>
        [
          row.id,
          row.name,
          row.email,
          row.kind,
          row.message,
          row.status,
          row.created_at,
          row.read_at,
          row.archived_at,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    return new Response(`${lines.join("\n")}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="messages.csv"',
        "Cache-Control": "no-store",
        ...adminCorsHeaders(origin),
      },
    });
  }

  if (path === "/admin/submissions" && request.method === "GET") {
    const requested = url.searchParams.get("status") ?? "unread";
    if (!["unread", "read", "archived", "all"].includes(requested)) {
      return adminJson({ error: "Unknown status." }, 400, origin);
    }

    const where: string[] = [];
    const binds: unknown[] = [];
    if (requested === "unread") {
      where.push("read_at IS NULL AND archived_at IS NULL");
    } else if (requested === "read") {
      where.push("read_at IS NOT NULL AND archived_at IS NULL");
    } else if (requested === "archived") {
      where.push("archived_at IS NOT NULL");
    }
    if (q) {
      where.push(
        "(instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0 OR instr(lower(message), lower(?)) > 0)",
      );
      binds.push(q, q, q);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const [total, unread, submissions] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS count FROM submissions${whereSql}`)
        .bind(...binds)
        .first<{ count: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM submissions WHERE read_at IS NULL AND archived_at IS NULL",
      ).first<{ count: number }>(),
      env.DB.prepare(
        `SELECT id, name, email, kind, message, status, created_at AS created, read_at AS readAt, archived_at AS archivedAt FROM submissions${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
        .bind(...binds, PAGE_SIZE, offset)
        .all(),
    ]);

    const count = Number(total?.count ?? 0);
    return adminJson(
      {
        submissions: submissions.results,
        total: count,
        page,
        pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
        unread: Number(unread?.count ?? 0),
      },
      200,
      origin,
    );
  }

  const submissionMatch = path.match(/^\/admin\/submissions\/(\d+)$/);
  if (submissionMatch && request.method === "PATCH") {
    const parsed = submissionActionSchema.safeParse(await readJson(request));
    if (!parsed.success) return adminJson({ error: "Invalid action." }, 400, origin);
    const id = Number(submissionMatch[1]);
    const action = parsed.data.action;
    const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
    const sql =
      action === "read"
        ? `UPDATE submissions SET read_at = COALESCE(read_at, ${now}), status = CASE WHEN archived_at IS NULL THEN 'read' ELSE 'archived' END WHERE id = ?`
        : action === "unread"
          ? "UPDATE submissions SET read_at = NULL, status = CASE WHEN archived_at IS NULL THEN 'new' ELSE 'archived' END WHERE id = ?"
          : action === "archive"
            ? `UPDATE submissions SET archived_at = ${now}, status = 'archived' WHERE id = ?`
            : "UPDATE submissions SET archived_at = NULL, status = CASE WHEN read_at IS NULL THEN 'new' ELSE 'read' END WHERE id = ?";
    const results = await env.DB.batch([
      env.DB.prepare(sql).bind(id),
      auditStatement(env, `submission.${action}`, `submission:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Message not found." }, 404, origin);
    }
    return adminJson({ ok: true }, 200, origin);
  }

  if (submissionMatch && request.method === "DELETE") {
    const id = Number(submissionMatch[1]);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id),
      auditStatement(env, "submission.delete", `submission:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Message not found." }, 404, origin);
    }
    return adminJson({ ok: true }, 200, origin);
  }

  if (path === "/admin/reactions" && request.method === "GET") {
    const [counts, events] = await Promise.all([
      env.DB.prepare(
        "SELECT slug, type, COUNT(*) AS count FROM reactions GROUP BY slug, type ORDER BY count DESC, slug ASC LIMIT 200",
      ).all<{ slug: string; type: string; count: number }>(),
      env.DB.prepare(
        "SELECT rowid AS id, slug, type, voter, created_at AS created FROM reactions ORDER BY created_at DESC LIMIT 50",
      ).all<{
        id: number;
        slug: string;
        type: string;
        voter: string;
        created: string;
      }>(),
    ]);
    return adminJson(
      {
        counts: counts.results.map((row) => ({
          slug: row.slug,
          type: row.type,
          count: Number(row.count),
        })),
        events: events.results,
      },
      200,
      origin,
    );
  }

  const reactionMatch = path.match(/^\/admin\/reactions\/(\d+)$/);
  if (reactionMatch && request.method === "DELETE") {
    const id = Number(reactionMatch[1]);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM reactions WHERE rowid = ?").bind(id),
      auditStatement(env, "reaction.delete", `reaction:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Reaction not found." }, 404, origin);
    }
    return adminJson({ ok: true }, 200, origin);
  }

  if (path === "/admin/activity" && request.method === "GET") {
    const [comments, reactions, messages] = await Promise.all([
      env.DB.prepare(
        "SELECT id, slug, name, body, status, created_at AS created FROM comments ORDER BY created_at DESC LIMIT 25",
      ).all<{
        id: number;
        slug: string;
        name: string;
        body: string;
        status: string;
        created: string;
      }>(),
      env.DB.prepare(
        "SELECT rowid AS id, slug, type, voter, created_at AS created FROM reactions ORDER BY created_at DESC LIMIT 25",
      ).all<{
        id: number;
        slug: string;
        type: string;
        voter: string;
        created: string;
      }>(),
      env.DB.prepare(
        "SELECT id, name, email, kind, created_at AS created FROM submissions ORDER BY created_at DESC LIMIT 15",
      ).all<{
        id: number;
        name: string;
        email: string;
        kind: string;
        created: string;
      }>(),
    ]);

    const activity = [
      ...comments.results.map((row) => ({
        kind: "comment",
        id: row.id,
        slug: row.slug,
        actor: row.name,
        text: row.body.slice(0, 180),
        status: row.status,
        created: row.created,
      })),
      ...reactions.results.map((row) => ({
        kind: "reaction",
        id: row.id,
        slug: row.slug,
        actor: row.voter,
        text: row.type,
        status: "",
        created: row.created,
      })),
      ...messages.results.map((row) => ({
        kind: "message",
        id: row.id,
        slug: "",
        actor: row.name,
        text: row.kind,
        status: "",
        created: row.created,
      })),
    ]
      .sort((a, b) => b.created.localeCompare(a.created))
      .slice(0, 50);

    return adminJson({ activity }, 200, origin);
  }

  if (path === "/admin/status" && request.method === "GET") {
    return adminJson(
      {
        run: await latestGithubRun(env),
        repo: env.GITHUB_REPO ?? null,
        workflowUrl: env.GITHUB_REPO
          ? `https://github.com/${env.GITHUB_REPO}/actions`
          : null,
      },
      200,
      origin,
    );
  }

  if (path === "/admin/rebuild" && request.method === "POST") {
    const result = await dispatchRebuild(env);
    if (!result.ok) return adminJson({ error: result.error }, result.status, origin);
    await auditStatement(env, "site.rebuild", "site:rebuild").run();
    return adminJson({ ok: true }, 202, origin);
  }

  if (path === "/admin/settings" && request.method === "GET") {
    const setting = await env.DB.prepare(
      "SELECT value FROM app_settings WHERE key = 'comment_auto_approve'",
    ).first<{ value: string }>();
    return adminJson({ autoApprove: setting?.value === "on" }, 200, origin);
  }

  if (path === "/admin/settings" && request.method === "PATCH") {
    const parsed = settingsSchema.safeParse(await readJson(request));
    if (!parsed.success) return adminJson({ error: "Invalid settings." }, 400, origin);
    const value = parsed.data.autoApprove ? "on" : "off";
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO app_settings (key, value) VALUES ('comment_auto_approve', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).bind(value),
      auditStatement(env, "settings.auto_approve", value),
    ]);
    return adminJson({ ok: true, autoApprove: parsed.data.autoApprove }, 200, origin);
  }

  if (path === "/admin/blocklist" && request.method === "GET") {
    const [total, items] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM blocklist").first<{
        count: number;
      }>(),
      env.DB.prepare(
        "SELECT id, type, value, created_at AS created FROM blocklist ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
        .bind(PAGE_SIZE, offset)
        .all(),
    ]);
    const count = Number(total?.count ?? 0);
    return adminJson(
      {
        items: items.results,
        total: count,
        page,
        pages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
      },
      200,
      origin,
    );
  }

  if (path === "/admin/blocklist" && request.method === "POST") {
    const parsed = blocklistSchema.safeParse(await readJson(request));
    if (!parsed.success) return adminJson({ error: "Invalid blocklist entry." }, 400, origin);
    const type = parsed.data.type;
    const value = parsed.data.value.toLowerCase().replace(/\s+/g, " ").trim();
    if (type === "ip_hash" && !/^[a-f0-9]{16,64}$/.test(value)) {
      return adminJson({ error: "Invalid IP hash." }, 400, origin);
    }
    if (value.length < 2) return adminJson({ error: "Entry is too short." }, 400, origin);

    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO blocklist (type, value) VALUES (?, ?)",
    )
      .bind(type, value)
      .run();
    if (result.meta.changes) {
      await auditStatement(env, "blocklist.add", `${type}:${value}`).run();
    }
    return adminJson({ ok: true, duplicate: !result.meta.changes }, 200, origin);
  }

  const blocklistMatch = path.match(/^\/admin\/blocklist\/(\d+)$/);
  if (blocklistMatch && request.method === "DELETE") {
    const id = Number(blocklistMatch[1]);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM blocklist WHERE id = ?").bind(id),
      auditStatement(env, "blocklist.delete", `blocklist:${id}`),
    ]);
    if (!results[0].meta.changes) {
      return adminJson({ error: "Entry not found." }, 404, origin);
    }
    return adminJson({ ok: true }, 200, origin);
  }

  if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
    const assetPath =
      url.pathname === "/admin" || url.pathname === "/admin/"
        ? "/admin/index.html"
        : url.pathname;
    const asset = await env.ASSETS.fetch(new Request(new URL(assetPath, url), request));
    if (asset.status !== 404) return asset;
  }

  return adminJson({ error: "Not found." }, 404, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/admin" || path.startsWith("/admin/")) {
      const adminOrigin = (env.ADMIN_ORIGIN ?? "").replace(/\/+$/, "");
      if (adminOrigin && url.origin !== adminOrigin) {
        // workers.dev cannot hold an Access session, so send old admin links to the real host.
        return Response.redirect(`${adminOrigin}${url.pathname}${url.search}`, 308);
      }
      try {
        return await handleAdmin(request, env, url);
      } catch (error) {
        console.error("Admin worker error", error);
        const requestOrigin = request.headers.get("Origin");
        const origin =
          requestOrigin && requestOrigin === env.ADMIN_ORIGIN ? requestOrigin : null;
        return adminJson({ error: "Server error. Try again later." }, 500, origin);
      }
    }

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
      return json({ error: "Not found." }, 404, origin);
    } catch (error) {
      console.error("Worker error", error);
      return json({ error: "Server error. Try again later." }, 500, origin);
    }
  },
};
