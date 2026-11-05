import type { ComponentChildren } from "preact";
import type { CommentStatus } from "./types";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <section class="card">
      {(title || actions) && (
        <div class="row spread">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? <div class="actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ status }: { status: CommentStatus | string }) {
  return <span class={`badge ${status}`}>{status || "event"}</span>;
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div class="empty" role="status">
      {label}
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div class="pager">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        ← Prev
      </button>
      <span class="muted small">
        Page {page} / {pages} · {total} total
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  );
}
