import { withBase } from "@/lib/utils";

type Span = {
  _type?: string;
  text?: string;
  marks?: string[];
};

type Block = {
  _type?: string;
  _key?: string;
  style?: string;
  listItem?: "bullet" | "number";
  children?: Span[];
  markDefs?: { _key: string; _type: string; href?: string }[];
  alt?: string;
  url?: string;
  caption?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHref = (href = "#") =>
  /^(https?:\/\/|mailto:|\/|#)/i.test(href)
    ? escapeHtml(withBase(href))
    : "#";

const renderSpans = (
  children: Span[] = [],
  markDefs: Block["markDefs"] = [],
) =>
  children
    .map((child) => {
      let text = escapeHtml(child.text ?? "");
      for (const mark of child.marks ?? []) {
        const def = markDefs?.find((item) => item._key === mark);
        if (mark === "strong") text = `<strong>${text}</strong>`;
        else if (mark === "em") text = `<em>${text}</em>`;
        else if (mark === "code") text = `<code>${text}</code>`;
        else if (mark === "underline") text = `<u>${text}</u>`;
        else if (def?._type === "link") {
          const target = safeHref(def.href);
          const external = target.startsWith("http");
          text = `<a href="${target}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
        }
      }
      return text;
    })
    .join("");

/** Minimal, dependency-free Portable Text renderer for the block types this site uses. */
export function portableTextToHtml(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) out.push(`</${listType}>`);
    listType = null;
  };

  for (const raw of blocks as Block[]) {
    if (raw._type === "image" && raw.url) {
      closeList();
      out.push(
        `<figure><img src="${escapeHtml(raw.url)}" alt="${escapeHtml(raw.alt ?? "")}" loading="lazy" decoding="async" />${
          raw.caption
            ? `<figcaption>${escapeHtml(raw.caption)}</figcaption>`
            : ""
        }</figure>`,
      );
      continue;
    }

    if (raw._type !== "block") continue;

    const content = renderSpans(raw.children, raw.markDefs);
    if (!content.trim()) continue;

    if (raw.listItem) {
      const nextType = raw.listItem === "number" ? "ol" : "ul";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        out.push(`<${listType}>`);
      }
      out.push(`<li>${content}</li>`);
      continue;
    }

    closeList();
    switch (raw.style) {
      case "h2":
        out.push(`<h2>${content}</h2>`);
        break;
      case "h3":
        out.push(`<h3>${content}</h3>`);
        break;
      case "h4":
        out.push(`<h4>${content}</h4>`);
        break;
      case "blockquote":
        out.push(`<blockquote>${content}</blockquote>`);
        break;
      default:
        out.push(`<p>${content}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

export function readingTime(html: string): number {
  const words = html
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function stripPlaceholders(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
