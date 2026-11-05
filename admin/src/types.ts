export type Session = {
  email: string;
  expiresAt?: number;
  now: number;
};

export type CommentStatus = "pending" | "approved" | "rejected" | "spam";
export type CommentFilter = CommentStatus | "all";

export type Comment = {
  id: number;
  slug: string;
  name: string;
  body: string;
  status: CommentStatus;
  spamScore: number;
  ipHash: string;
  created: string;
  updated: string;
};

export type CommentsPage = {
  comments: Comment[];
  total: number;
  page: number;
  pages: number;
};

export type MessageFilter = "unread" | "read" | "archived" | "all";

export type Message = {
  id: number;
  name: string;
  email: string;
  kind: string;
  message: string;
  status: string;
  created: string;
  readAt: string | null;
  archivedAt: string | null;
};

export type MessagesPage = {
  submissions: Message[];
  total: number;
  page: number;
  pages: number;
  unread: number;
};

export type ReactionCount = {
  slug: string;
  type: string;
  count: number;
};

export type ReactionEvent = {
  id: number;
  slug: string;
  type: string;
  voter: string;
  created: string;
};

export type ReactionsData = {
  counts: ReactionCount[];
  events: ReactionEvent[];
};

export type ActivityItem = {
  kind: "comment" | "reaction" | "message";
  id: number;
  slug: string;
  actor: string;
  text: string;
  status: string;
  created: string;
};

export type Overview = {
  pendingComments: number;
  unreadMessages: number;
  topPosts: Array<{ slug: string; count: number }>;
  activity: Array<{
    day: string;
    comments: number;
    reactions: number;
    messages: number;
  }>;
};

export type SiteStatus = {
  run: {
    id: number;
    status: string | null;
    conclusion: string | null;
    createdAt: string;
    updatedAt: string;
    url: string;
    event: string;
  } | null;
  repo: string | null;
  workflowUrl: string | null;
};

export type BlocklistEntry = {
  id: number;
  type: "word" | "ip_hash";
  value: string;
  created: string;
};

export type BlocklistPage = {
  items: BlocklistEntry[];
  total: number;
  page: number;
  pages: number;
};
