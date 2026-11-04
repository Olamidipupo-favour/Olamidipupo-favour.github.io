export const siteUrl = (import.meta.env.SITE_URL ?? "https://dipo.dev").replace(
  /\/+$/,
  "",
);

/** Leading slash, no trailing slash. Empty for a custom domain or user site. */
export const basePath = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Prefix an internal path with Astro's configured BASE_URL. */
export function withBase(path: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("#")) return path;
  if (!path.startsWith("/")) return path;
  return `${basePath}${path}` || "/";
}

export const apiBase = import.meta.env.PUBLIC_API_URL ?? "";

export function formatDate(date: string): string {
  if (!date) return "[date]";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function isoDate(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toISOString();
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(withBase(path), siteUrl).toString();
}

export function isPlaceholder(value: string | undefined | null): boolean {
  return typeof value === "string" && value.includes("[PLACEHOLDER");
}

export function stripPlaceholderMarkup(value: string): string {
  return value.replace(/\[PLACEHOLDER[^\]]*\]/g, "").trim();
}

export const statusLabels = {
  open: "Available",
  limited: "Limited availability",
  closed: "Not taking work",
} as const;

export const readingTimeLabel = (minutes: number) =>
  `${minutes} min read`; // computed at build time from the CMS body
