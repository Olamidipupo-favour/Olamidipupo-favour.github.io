import type {
  ActivityItem,
  BlocklistPage,
  CommentFilter,
  CommentStatus,
  CommentsPage,
  MessageFilter,
  MessagesPage,
  Overview,
  ReactionsData,
  Session,
  SiteStatus,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export class SessionExpiredError extends Error {
  constructor() {
    super("Your Access session expired.");
    this.name = "SessionExpiredError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event("admin-session-expired"));
    throw new SessionExpiredError();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

function params(values: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export const api = {
  base: BASE,
  session: () => request<Session>("/admin/session"),
  overview: () => request<Overview>("/admin/overview"),

  comments: (input: { status: CommentFilter; q: string; page: number }) =>
    request<CommentsPage>(`/admin/comments?${params(input)}`),
  setCommentStatus: (id: number, status: CommentStatus) =>
    request<{ ok: true }>(`/admin/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteComment: (id: number) =>
    request<{ ok: true }>(`/admin/comments/${id}`, { method: "DELETE" }),
  bulkComments: (ids: number[], action: "approve" | "reject" | "spam" | "delete") =>
    request<{ ok: true }>("/admin/comments/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    }),

  messages: (input: { status: MessageFilter; q: string; page: number }) =>
    request<MessagesPage>(`/admin/submissions?${params(input)}`),
  messageAction: (
    id: number,
    action: "read" | "unread" | "archive" | "unarchive",
  ) =>
    request<{ ok: true }>(`/admin/submissions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  deleteMessage: (id: number) =>
    request<{ ok: true }>(`/admin/submissions/${id}`, { method: "DELETE" }),
  csvUrl: () => `${BASE}/admin/submissions/export.csv`,

  reactions: () => request<ReactionsData>("/admin/reactions"),
  deleteReaction: (id: number) =>
    request<{ ok: true }>(`/admin/reactions/${id}`, { method: "DELETE" }),
  activity: () => request<{ activity: ActivityItem[] }>("/admin/activity"),

  status: () => request<SiteStatus>("/admin/status"),
  rebuild: () => request<{ ok: true }>("/admin/rebuild", { method: "POST" }),

  settings: () => request<{ autoApprove: boolean }>("/admin/settings"),
  updateSettings: (autoApprove: boolean) =>
    request<{ ok: true; autoApprove: boolean }>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ autoApprove }),
    }),

  blocklist: (page: number) =>
    request<BlocklistPage>(`/admin/blocklist?${params({ page })}`),
  addBlocklist: (type: "word" | "ip_hash", value: string) =>
    request<{ ok: true; duplicate: boolean }>("/admin/blocklist", {
      method: "POST",
      body: JSON.stringify({ type, value }),
    }),
  deleteBlocklist: (id: number) =>
    request<{ ok: true }>(`/admin/blocklist/${id}`, { method: "DELETE" }),

  signInUrl: () => `${BASE}/admin/session`,
};
