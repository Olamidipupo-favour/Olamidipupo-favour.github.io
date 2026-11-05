import { useCallback, useEffect, useState } from "preact/hooks";
import { api, errorMessage, SessionExpiredError } from "./api";
import { Loading } from "./components";
import {
  ActivityPage,
  CommentsPage,
  MessagesPage,
  OverviewPage,
  SettingsPage,
  StatusPage,
  type Notify,
} from "./pages";
import type { Session } from "./types";

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "comments", label: "Comments" },
  { id: "messages", label: "Messages" },
  { id: "activity", label: "Activity" },
  { id: "status", label: "Status" },
  { id: "settings", label: "Settings" },
] as const;

type RouteId = (typeof NAV)[number]["id"];

function routeFromHash(): RouteId {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return NAV.some((item) => item.id === value) ? (value as RouteId) : "overview";
}

function SessionWall() {
  return (
    <main class="shell" id="main">
      <section class="card session-wall">
        <h1>Access session expired</h1>
        <p class="muted">
          This admin app is protected by Cloudflare Access. Sign in again, then
          reload this page.
        </p>
        <div class="actions">
          <a
            class="button primary"
            href={api.signInUrl()}
            target="_blank"
            rel="noreferrer"
          >
            Sign in
          </a>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </section>
    </main>
  );
}

export function App() {
  const [route, setRoute] = useState<RouteId>(routeFromHash);
  const [session, setSession] = useState<Session | null>(null);
  const [expired, setExpired] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: "ok" | "error" } | null>(
    null,
  );

  const notify = useCallback<Notify>((message, kind = "ok") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo({ top: 0 });
    };
    const onExpired = () => setExpired(true);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("admin-session-expired", onExpired);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("admin-session-expired", onExpired);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .session()
      .then((value) => {
        if (alive) setSession(value);
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof SessionExpiredError) setExpired(true);
        else notify(errorMessage(error), "error");
      });
    return () => {
      alive = false;
    };
  }, [notify]);

  useEffect(() => {
    const current = NAV.find((item) => item.id === route);
    document.title = `${current?.label ?? "Admin"} · Dipo`;
  }, [route]);

  if (expired) return <SessionWall />;
  if (!session) {
    return (
      <main class="shell" id="main">
        <Loading label="Checking Access session…" />
      </main>
    );
  }

  let page;
  switch (route) {
    case "comments":
      page = <CommentsPage notify={notify} />;
      break;
    case "messages":
      page = <MessagesPage notify={notify} />;
      break;
    case "activity":
      page = <ActivityPage notify={notify} />;
      break;
    case "status":
      page = <StatusPage notify={notify} />;
      break;
    case "settings":
      page = <SettingsPage notify={notify} />;
      break;
    default:
      page = <OverviewPage notify={notify} />;
  }

  return (
    <div class="shell">
      <a class="skip" href="#main">
        Skip to content
      </a>
      <header class="top">
        <div class="brand">
          DIPO<span>//</span>ADMIN
        </div>
        <div class="session">
          {session.email}
          {session.expiresAt ? (
            <span class="muted small">
              {" "}
              · session {new Date(session.expiresAt * 1000).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </header>
      <nav class="nav" aria-label="Admin sections">
        {NAV.map((item) => (
          <a
            key={item.id}
            href={`#/${item.id}`}
            aria-current={route === item.id ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main id="main" class="main">
        {page}
      </main>
      {toast && (
        <div class={`toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}
