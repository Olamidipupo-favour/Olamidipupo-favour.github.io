import type { APIRoute } from "astro";
import { absoluteUrl } from "@/lib/utils";

export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl("/sitemap-index.xml")}
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
