import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getContent } from "@/lib/content";
import { absoluteUrl, siteUrl } from "@/lib/utils";

export async function GET(context: APIContext) {
  const { posts, settings } = await getContent();

  return rss({
    title: "Dipo Agboola — Notes",
    description:
      "Backend notes, med-school notes and arguments about fundamentals.",
    site: context.site ? absoluteUrl("/") : siteUrl,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: new Date(post.publishedAt),
      description: post.excerpt,
      link: absoluteUrl(`/notes/${post.slug}/`),
      content: post.bodyHtml,
      categories: post.tags,
    })),
    customData: `<language>en-ng</language><copyright>© ${new Date().getFullYear()} ${settings.name}</copyright>`,
  });
}
