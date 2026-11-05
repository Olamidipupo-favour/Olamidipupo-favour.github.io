import { useEffect, useMemo, useState } from "preact/hooks";
import { z } from "zod";
import { api, errorMessage } from "./api";
import { Badge, Card, Empty, Loading, Pager } from "./components";
import { formatDate, formatDay, reactionLabel } from "./format";
import type {
  ActivityItem,
  BlocklistPage,
  Comment,
  CommentFilter,
  CommentStatus,
  CommentsPage,
  Message,
  MessageFilter,
  MessagesPage,
  Overview,
  ReactionsData,
  ReactionEvent,
  SiteStatus,
} from "./types";

export type Notify = (message: string, kind?: "ok" | "error") => void;
type PageProps = { notify: Notify };

const COMMENT_FILTERS: CommentFilter[] = [
  "pending",
  "approved",
  "rejected",
  "spam",
  "all",
];
const MESSAGE_FILTERS: MessageFilter[] = ["unread", "read", "archived", "all"];

export function OverviewPage({ notify }: PageProps) {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .overview()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((error) => notify(errorMessage(error), "error"));
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <Loading />;

  const maxActivity = Math.max(
    1,
    ...data.activity.map((day) => day.comments + day.reactions + day.messages),
  );

  return (
    <div class="grid">
      <div class="grid cols-2">
        <Card title="Pending comments">
          <div class="metric">{data.pendingComments}</div>
          <a href="#/comments" class="small">
            Open moderation queue →
          </a>
        </Card>
        <Card title="Unread messages">
          <div class="metric">{data.unreadMessages}</div>
          <a href="#/messages" class="small">
            Open inbox →
          </a>
        </Card>
      </div>

      <Card title="Top reacted posts">
        {data.topPosts.length === 0 ? (
          <Empty>No reactions yet.</Empty>
        ) : (
          <div class="list">
            {data.topPosts.map((post) => (
              <div class="item row spread" key={post.slug}>
                <a href={`#/activity`}>{post.slug}</a>
                <span class="badge">{post.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Last 7 days">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Comments</th>
              <th scope="col">Reactions</th>
              <th scope="col">Messages</th>
              <th scope="col">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.activity.map((day) => {
              const total = day.comments + day.reactions + day.messages;
              return (
                <tr key={day.day}>
                  <th scope="row">{formatDay(day.day)}</th>
                  <td>{day.comments}</td>
                  <td>{day.reactions}</td>
                  <td>{day.messages}</td>
                  <td>
                    <progress class="progress" max={maxActivity} value={total}>
                      {total}
                    </progress>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function CommentsPage({ notify }: PageProps) {
  const [filter, setFilter] = useState<CommentFilter>("pending");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CommentsPage | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api
      .comments({ status: filter, q: query, page })
      .then((value) => {
        if (!alive) return;
        setData(value);
        setSelected(new Set());
        setCursor(0);
      })
      .catch((error) => notify(errorMessage(error), "error"))
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [filter, query, page]);

  useEffect(() => {
    const id = data?.comments[cursor]?.id;
    if (id) {
      document.getElementById(`comment-${id}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [cursor, data]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!data || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true']",
        )
      ) {
        return;
      }
      const comment = data.comments[cursor];
      if (!comment) return;

      if (event.key === "j") {
        event.preventDefault();
        setCursor((value) => Math.min(value + 1, data.comments.length - 1));
      } else if (event.key === "k") {
        event.preventDefault();
        setCursor((value) => Math.max(value - 1, 0));
      } else if (event.key === "a") {
        event.preventDefault();
        void changeStatus(comment, "approved");
      } else if (event.key === "r") {
        event.preventDefault();
        void changeStatus(comment, "rejected");
      } else if (event.key === "d") {
        event.preventDefault();
        void deleteComment(comment);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, cursor, filter]);

  async function changeStatus(comment: Comment, next: CommentStatus) {
    if (!data) return;
    const previous = data;
    const stays = filter === "all" || filter === next;
    setData({
      ...data,
      comments: stays
        ? data.comments.map((item) =>
            item.id === comment.id ? { ...item, status: next } : item,
          )
        : data.comments.filter((item) => item.id !== comment.id),
      total: stays ? data.total : Math.max(0, data.total - 1),
    });
    try {
      await api.setCommentStatus(comment.id, next);
      notify(`Comment marked ${next}.`);
    } catch (error) {
      setData(previous);
      notify(errorMessage(error), "error");
    }
  }

  async function deleteComment(comment: Comment) {
    if (!data || !window.confirm(`Delete the comment from ${comment.name}?`)) return;
    const previous = data;
    setData({
      ...data,
      comments: data.comments.filter((item) => item.id !== comment.id),
      total: Math.max(0, data.total - 1),
    });
    try {
      await api.deleteComment(comment.id);
      notify("Comment deleted.");
    } catch (error) {
      setData(previous);
      notify(errorMessage(error), "error");
    }
  }

  async function blockIp(comment: Comment) {
    if (!window.confirm(`Block IP hash ${comment.ipHash.slice(0, 12)}…?`)) return;
    try {
      const result = await api.addBlocklist("ip_hash", comment.ipHash);
      notify(result.duplicate ? "That IP hash is already blocked." : "IP hash blocked.");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }

  async function bulk(action: "approve" | "reject" | "spam" | "delete") {
    if (!data || selected.size === 0) return;
    const ids = [...selected];
    if (
      action === "delete" &&
      !window.confirm(`Delete ${ids.length} selected comment(s)?`)
    ) {
      return;
    }
    const previous = data;
    const nextStatus =
      action === "approve"
        ? "approved"
        : action === "reject"
          ? "rejected"
          : "spam";
    const stays =
      action !== "delete" && (filter === "all" || filter === nextStatus);
    setData({
      ...data,
      comments: stays
        ? data.comments.map((item) =>
            ids.includes(item.id) ? { ...item, status: nextStatus } : item,
          )
        : data.comments.filter((item) => !ids.includes(item.id)),
      total: stays ? data.total : Math.max(0, data.total - ids.length),
    });
    setSelected(new Set());
    try {
      await api.bulkComments(ids, action);
      notify(`${ids.length} comment(s) updated.`);
    } catch (error) {
      setData(previous);
      notify(errorMessage(error), "error");
    }
  }

  const allSelected =
    Boolean(data?.comments.length) &&
    data!.comments.every((comment) => selected.has(comment.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(data?.comments.map((c) => c.id)) : new Set());
  }

  return (
    <div>
      <div class="toolbar">
        {COMMENT_FILTERS.map((item) => (
          <button
            type="button"
            key={item}
            class={filter === item ? "primary" : ""}
            aria-pressed={filter === item}
            onClick={() => {
              setFilter(item);
              setPage(1);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <form
        class="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        <label class="sr-only" for="comment-search">
          Search comments
        </label>
        <input
          id="comment-search"
          type="search"
          placeholder="Search post, name or text"
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
        />
        <button type="submit">Search</button>
        <span class="muted small" role="status">
          {busy ? "Loading…" : `${data?.total ?? 0} comments`}
        </span>
      </form>

      {selected.size > 0 && (
        <div class="toolbar card">
          <span class="small">{selected.size} selected</span>
          <button type="button" onClick={() => bulk("approve")}>
            Approve
          </button>
          <button type="button" onClick={() => bulk("reject")}>
            Reject
          </button>
          <button type="button" onClick={() => bulk("spam")}>
            Spam
          </button>
          <button type="button" class="danger" onClick={() => bulk("delete")}>
            Delete
          </button>
        </div>
      )}

      {!data ? (
        <Loading />
      ) : data.comments.length === 0 ? (
        <Empty>No comments in this queue.</Empty>
      ) : (
        <>
          <div class="toolbar">
            <label class="row small">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  toggleAll((event.target as HTMLInputElement).checked)
                }
              />
              Select page
            </label>
            <span class="muted small">
              Shortcuts: j/k move · a approve · r reject · d delete
            </span>
          </div>
          <div class="list">
            {data.comments.map((comment, index) => (
              <article
                class="item"
                id={`comment-${comment.id}`}
                data-selected={cursor === index}
                key={comment.id}
              >
                <div class="item-head">
                  <label class="row">
                    <input
                      type="checkbox"
                      checked={selected.has(comment.id)}
                      aria-label={`Select comment from ${comment.name}`}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if ((event.target as HTMLInputElement).checked) {
                          next.add(comment.id);
                        } else {
                          next.delete(comment.id);
                        }
                        setSelected(next);
                      }}
                    />
                    <strong>{comment.name}</strong>
                  </label>
                  <div class="row">
                    <a class="small" href={`#/comments`}>
                      {comment.slug}
                    </a>
                    <Badge status={comment.status} />
                    <span class="muted small">{formatDate(comment.created)}</span>
                  </div>
                </div>
                <p class="item-body">{comment.body}</p>
                <div class="row spread">
                  <span class="muted small">
                    ip {comment.ipHash.slice(0, 10)}…
                    {comment.spamScore > 0 ? ` · spam ${comment.spamScore}` : ""}
                  </span>
                  <div class="actions">
                    <button
                      type="button"
                      onClick={() => changeStatus(comment, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => changeStatus(comment, "rejected")}
                    >
                      Reject
                    </button>
                    <button type="button" onClick={() => changeStatus(comment, "spam")}>
                      Spam
                    </button>
                    <button type="button" onClick={() => blockIp(comment)}>
                      Block IP
                    </button>
                    <button
                      type="button"
                      class="danger"
                      onClick={() => deleteComment(comment)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pager
            page={data.page}
            pages={data.pages}
            total={data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}

export function MessagesPage({ notify }: PageProps) {
  const [filter, setFilter] = useState<MessageFilter>("unread");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MessagesPage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api
      .messages({ status: filter, q: query, page })
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((error) => notify(errorMessage(error), "error"))
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [filter, query, page]);

  function appliedMessage(
    message: Message,
    action: "read" | "unread" | "archive" | "unarchive",
  ): { next: Message; unreadDelta: number; remove: boolean } {
    const now = new Date().toISOString();
    if (action === "read") {
      return {
        next: {
          ...message,
          readAt: message.readAt ?? now,
          status: message.archivedAt ? "archived" : "read",
        },
        unreadDelta: message.readAt || message.archivedAt ? 0 : -1,
        remove: filter === "unread",
      };
    }
    if (action === "unread") {
      return {
        next: {
          ...message,
          readAt: null,
          status: message.archivedAt ? "archived" : "new",
        },
        unreadDelta: message.readAt && !message.archivedAt ? 1 : 0,
        remove: filter === "read",
      };
    }
    if (action === "archive") {
      return {
        next: { ...message, archivedAt: now, status: "archived" },
        unreadDelta: message.readAt ? 0 : -1,
        remove: filter === "unread" || filter === "read",
      };
    }
    return {
      next: {
        ...message,
        archivedAt: null,
        status: message.readAt ? "read" : "new",
      },
      unreadDelta: message.readAt ? 0 : 1,
      remove: filter === "archived",
    };
  }

  async function changeMessage(
    message: Message,
    action: "read" | "unread" | "archive" | "unarchive",
  ) {
    if (!data) return;
    const previous = data;
    const { next, unreadDelta, remove } = appliedMessage(message, action);
    setData({
      ...data,
      submissions: remove
        ? data.submissions.filter((item) => item.id !== message.id)
        : data.submissions.map((item) => (item.id === message.id ? next : item)),
      total: remove ? Math.max(0, data.total - 1) : data.total,
      unread: Math.max(0, data.unread + unreadDelta),
    });
    try {
      await api.messageAction(message.id, action);
      notify(`Message ${action}.`);
    } catch (error) {
      setData(previous);
      notify(errorMessage(error), "error");
    }
  }

  async function deleteMessage(message: Message) {
    if (!data || !window.confirm(`Delete the message from ${message.name}?`)) return;
    const previous = data;
    const unreadDelta =
      message.readAt === null && message.archivedAt === null ? -1 : 0;
    setData({
      ...data,
      submissions: data.submissions.filter((item) => item.id !== message.id),
      total: Math.max(0, data.total - 1),
      unread: Math.max(0, data.unread + unreadDelta),
    });
    try {
      await api.deleteMessage(message.id);
      notify("Message deleted.");
    } catch (error) {
      setData(previous);
      notify(errorMessage(error), "error");
    }
  }

  return (
    <div>
      <div class="toolbar">
        {MESSAGE_FILTERS.map((item) => (
          <button
            type="button"
            key={item}
            class={filter === item ? "primary" : ""}
            aria-pressed={filter === item}
            onClick={() => {
              setFilter(item);
              setPage(1);
            }}
          >
            {item}
            {item === "unread" && data ? ` (${data.unread})` : ""}
          </button>
        ))}
        <a class="button" href={api.csvUrl()}>
          Export CSV
        </a>
      </div>

      <form
        class="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
      >
        <label class="sr-only" for="message-search">
          Search messages
        </label>
        <input
          id="message-search"
          type="search"
          placeholder="Search name, email or message"
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
        />
        <button type="submit">Search</button>
        <span class="muted small" role="status">
          {busy ? "Loading…" : `${data?.total ?? 0} messages`}
        </span>
      </form>

      {!data ? (
        <Loading />
      ) : data.submissions.length === 0 ? (
        <Empty>No messages in this view.</Empty>
      ) : (
        <>
          <div class="list">
            {data.submissions.map((message) => (
              <article class="item" key={message.id}>
                <div class="item-head">
                  <div class="row">
                    <strong>{message.name}</strong>
                    <Badge status={message.archivedAt ? "archived" : message.readAt ? "read" : "unread"} />
                  </div>
                  <span class="muted small">{formatDate(message.created)}</span>
                </div>
                <div class="row small">
                  <a href={`mailto:${message.email}`}>{message.email}</a>
                  <span class="muted">· {message.kind}</span>
                </div>
                <p class="item-body">{message.message}</p>
                <div class="actions">
                  {message.readAt ? (
                    <button type="button" onClick={() => changeMessage(message, "unread")}>
                      Mark unread
                    </button>
                  ) : (
                    <button type="button" onClick={() => changeMessage(message, "read")}>
                      Mark read
                    </button>
                  )}
                  {message.archivedAt ? (
                    <button
                      type="button"
                      onClick={() => changeMessage(message, "unarchive")}
                    >
                      Unarchive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => changeMessage(message, "archive")}
                    >
                      Archive
                    </button>
                  )}
                  <a
                    class="button"
                    href={`mailto:${message.email}?subject=${encodeURIComponent("Re: your message")}`}
                  >
                    Reply
                  </a>
                  <button
                    type="button"
                    class="danger"
                    onClick={() => deleteMessage(message)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pager
            page={data.page}
            pages={data.pages}
            total={data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}

export function ActivityPage({ notify }: PageProps) {
  const [reactions, setReactions] = useState<ReactionsData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.reactions(), api.activity()])
      .then(([reactionData, activityData]) => {
        if (!alive) return;
        setReactions(reactionData);
        setActivity(activityData.activity);
      })
      .catch((error) => notify(errorMessage(error), "error"));
    return () => {
      alive = false;
    };
  }, []);

  const posts = useMemo(() => {
    const grouped = new Map<
      string,
      { slug: string; total: number; types: Record<string, number> }
    >();
    for (const row of reactions?.counts ?? []) {
      const post = grouped.get(row.slug) ?? {
        slug: row.slug,
        total: 0,
        types: {},
      };
      post.total += row.count;
      post.types[row.type] = row.count;
      grouped.set(row.slug, post);
    }
    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [reactions]);

  async function removeReaction(event: ReactionEvent) {
    if (!reactions || !activity) return;
    if (
      !window.confirm(
        `Remove ${reactionLabel(event.type)} reaction on ${event.slug}?`,
      )
    ) {
      return;
    }
    const previousReactions = reactions;
    const previousActivity = activity;
    setReactions({
      counts: reactions.counts
        .map((row) =>
          row.slug === event.slug && row.type === event.type
            ? { ...row, count: row.count - 1 }
            : row,
        )
        .filter((row) => row.count > 0),
      events: reactions.events.filter((row) => row.id !== event.id),
    });
    setActivity(
      activity.filter(
        (item) => !(item.kind === "reaction" && item.id === event.id),
      ),
    );
    try {
      await api.deleteReaction(event.id);
      notify("Reaction removed.");
    } catch (error) {
      setReactions(previousReactions);
      setActivity(previousActivity);
      notify(errorMessage(error), "error");
    }
  }

  if (!reactions || !activity) return <Loading />;

  return (
    <div class="grid">
      <Card title="Reactions per post">
        {posts.length === 0 ? (
          <Empty>No reactions yet.</Empty>
        ) : (
          <div class="list">
            {posts.map((post) => (
              <div class="item" key={post.slug}>
                <div class="item-head">
                  <strong>{post.slug}</strong>
                  <span class="badge">{post.total}</span>
                </div>
                <div class="row">
                  {Object.entries(post.types).map(([type, count]) => (
                    <span class="small muted" key={type}>
                      {reactionLabel(type)}: {count}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recent reaction events">
        {reactions.events.length === 0 ? (
          <Empty>No reaction events.</Empty>
        ) : (
          <div class="list">
            {reactions.events.map((event) => (
              <div class="item" key={event.id}>
                <div class="item-head">
                  <span>
                    <strong>{reactionLabel(event.type)}</strong> on {event.slug}
                  </span>
                  <span class="muted small">{formatDate(event.created)}</span>
                </div>
                <div class="row spread">
                  <span class="muted small">voter {event.voter.slice(0, 10)}…</span>
                  <button
                    type="button"
                    class="danger"
                    onClick={() => removeReaction(event)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Activity feed">
        {activity.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <div class="list">
            {activity.map((item) => (
              <div class="item" key={`${item.kind}-${item.id}`}>
                <div class="item-head">
                  <span>
                    <Badge status={item.kind} />{" "}
                    {item.slug ? `${item.actor} on ${item.slug}` : item.actor}
                  </span>
                  <span class="muted small">{formatDate(item.created)}</span>
                </div>
                <p class="item-body">{item.text}</p>
                {item.kind === "reaction" && (
                  <button
                    type="button"
                    class="danger"
                    onClick={() => {
                      const event = reactions.events.find((row) => row.id === item.id);
                      if (event) void removeReaction(event);
                      else notify("Refresh to remove this event.", "error");
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function StatusPage({ notify }: PageProps) {
  const [data, setData] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const studio = (import.meta.env.VITE_SANITY_STUDIO_URL ?? "").replace(/\/+$/, "");

  useEffect(() => {
    let alive = true;
    api
      .status()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((error) => notify(errorMessage(error), "error"));
    return () => {
      alive = false;
    };
  }, []);

  async function rebuild() {
    setBusy(true);
    try {
      await api.rebuild();
      notify("Rebuild dispatched. GitHub Actions will deploy shortly.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="grid">
      <Card
        title="Site status"
        actions={
          <button type="button" class="primary" disabled={busy} onClick={rebuild}>
            {busy ? "Dispatching…" : "Rebuild site"}
          </button>
        }
      >
        {!data ? (
          <Loading />
        ) : data.run ? (
          <div class="list">
            <div class="row">
              <Badge status={data.run.conclusion ?? data.run.status ?? "running"} />
              <span class="small">
                {data.run.status}
                {data.run.conclusion ? ` · ${data.run.conclusion}` : ""}
              </span>
            </div>
            <p class="muted small">
              Started {formatDate(data.run.createdAt)} · {data.run.event}
            </p>
            <a href={data.run.url} target="_blank" rel="noreferrer">
              Open workflow run →
            </a>
          </div>
        ) : (
          <Empty>No workflow run found.</Empty>
        )}
      </Card>

      <Card title="Sanity Studio">
        {studio ? (
          <div class="actions">
            <a
              class="button primary"
              href={`${studio}/intent/create/type=project`}
              target="_blank"
              rel="noreferrer"
            >
              New project
            </a>
            <a
              class="button primary"
              href={`${studio}/intent/create/type=post`}
              target="_blank"
              rel="noreferrer"
            >
              New post
            </a>
            <a class="button" href={studio} target="_blank" rel="noreferrer">
              Open Studio
            </a>
          </div>
        ) : (
          <Empty>Set VITE_SANITY_STUDIO_URL to enable Studio links.</Empty>
        )}
      </Card>

      {data?.workflowUrl && (
        <Card title="Deploy workflow">
          <a href={data.workflowUrl} target="_blank" rel="noreferrer">
            {data.repo} actions →
          </a>
        </Card>
      )}
    </div>
  );
}

export function SettingsPage({ notify }: PageProps) {
  const [settings, setSettings] = useState<{ autoApprove: boolean } | null>(null);
  const [entries, setEntries] = useState<BlocklistPage | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<"word" | "ip_hash">("word");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.settings(), api.blocklist(page)])
      .then(([settingsData, blocklistData]) => {
        if (!alive) return;
        setSettings(settingsData);
        setEntries(blocklistData);
      })
      .catch((error) => notify(errorMessage(error), "error"));
    return () => {
      alive = false;
    };
  }, [page]);

  async function toggleAuto() {
    if (!settings) return;
    const previous = settings;
    const next = !settings.autoApprove;
    setSettings({ autoApprove: next });
    try {
      await api.updateSettings(next);
      notify(`Auto-approve ${next ? "enabled" : "disabled"}.`);
    } catch (error) {
      setSettings(previous);
      notify(errorMessage(error), "error");
    }
  }

  const blocklistInput = z.object({
    type: z.enum(["word", "ip_hash"]),
    value: z.string().trim().min(2).max(160),
  });

  async function addEntry(event: Event) {
    event.preventDefault();
    const parsed = blocklistInput.safeParse({ type, value });
    if (!parsed.success) {
      notify("Enter at least 2 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api.addBlocklist(parsed.data.type, parsed.data.value);
      setValue("");
      const refreshed = await api.blocklist(1);
      setEntries(refreshed);
      setPage(1);
      notify(result.duplicate ? "Already on the blocklist." : "Blocklist updated.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: number, label: string) {
    if (!entries || !window.confirm(`Remove ${label} from the blocklist?`)) return;
    const previous = entries;
    setEntries({
      ...entries,
      items: entries.items.filter((item) => item.id !== id),
      total: Math.max(0, entries.total - 1),
    });
    try {
      await api.deleteBlocklist(id);
      notify("Blocklist entry removed.");
    } catch (error) {
      setEntries(previous);
      notify(errorMessage(error), "error");
    }
  }

  if (!settings || !entries) return <Loading />;

  return (
    <div class="grid">
      <Card title="Comment auto-approve">
        <label class="row">
          <input type="checkbox" checked={settings.autoApprove} onChange={toggleAuto} />
          <span>
            Publish new comments without review
            <span class="muted small"> (off by default)</span>
          </span>
        </label>
        <p class="muted small">
          Blocked words and IP hashes are always marked spam, even when
          auto-approve is on.
        </p>
      </Card>

      <Card title="Blocklist">
        <form class="toolbar" onSubmit={addEntry}>
          <label class="sr-only" for="blocklist-type">
            Blocklist type
          </label>
          <select
            id="blocklist-type"
            value={type}
            onChange={(event) =>
              setType((event.target as HTMLSelectElement).value as "word" | "ip_hash")
            }
          >
            <option value="word">Word</option>
            <option value="ip_hash">IP hash</option>
          </select>
          <label class="sr-only" for="blocklist-value">
            Blocklist value
          </label>
          <input
            id="blocklist-value"
            type="text"
            placeholder={type === "word" ? "e.g. crypto giveaway" : "16–64 hex chars"}
            value={value}
            onInput={(event) => setValue((event.target as HTMLInputElement).value)}
          />
          <button type="submit" class="primary" disabled={busy}>
            Add
          </button>
        </form>

        {entries.items.length === 0 ? (
          <Empty>No blocked words or IP hashes.</Empty>
        ) : (
          <div class="list">
            {entries.items.map((entry) => (
              <div class="item" key={entry.id}>
                <div class="item-head">
                  <span>
                    <Badge status={entry.type} /> <code>{entry.value}</code>
                  </span>
                  <span class="muted small">{formatDate(entry.created)}</span>
                </div>
                <button
                  type="button"
                  class="danger"
                  onClick={() => removeEntry(entry.id, entry.value)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <Pager
          page={entries.page}
          pages={entries.pages}
          total={entries.total}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
