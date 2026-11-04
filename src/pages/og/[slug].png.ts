import type { APIRoute } from "astro";
import sharp from "sharp";
import { getContent } from "@/lib/content";

type OgProps = {
  kicker: string;
  title: string;
  subtitle: string;
};

const PAGE_META: Record<string, OgProps> = {
  home: {
    kicker: "DIPO.DEV",
    title: "No cursed energy. Just fundamentals.",
    subtitle: "Backend engineer. Ships APIs that don't fall over.",
  },
  projects: {
    kicker: "SELECTED WORK",
    title: "The work, with the numbers attached.",
    subtitle: "Backend case studies, constraints and outcomes.",
  },
  notes: {
    kicker: "NOTES",
    title: "Notes from the terminal.",
    subtitle: "Backends, medicine and the fundamentals.",
  },
  gallery: {
    kicker: "GALLERY",
    title: "Proof I go outside.",
    subtitle: "Frames from the desk, the ward and the terminal.",
  },
  about: {
    kicker: "ABOUT",
    title: "Backend engineer. Future doctor.",
    subtitle: "Same fundamentals.",
  },
  cv: {
    kicker: "CURRICULUM VITAE",
    title: "Dipo, on paper.",
    subtitle: "Roles, proof points, awards and education.",
  },
  "work-with-me": {
    kicker: "WORK WITH ME",
    title: "Backends that behave.",
    subtitle: "Remote roles and select freelance projects.",
  },
  contact: {
    kicker: "CONTACT",
    title: "Let's make it real.",
    subtitle: "Tell me what is breaking, slow, or shipping next.",
  },
  "404": {
    kicker: "ERROR 404",
    title: "Command not found.",
    subtitle: "That route does not exist.",
  },
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function ogSvg({ kicker, title, subtitle }: OgProps): string {
  const lines = wrap(title, 22);
  const fontSize = lines.length > 2 ? 72 : 88;
  const titleMarkup = lines
    .map(
      (line, index) =>
        `<text x="72" y="${300 + index * (fontSize + 6)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="900" font-style="italic" fill="#E8F0EA">${escapeXml(line)}</text>`,
    )
    .join("");
  const subLines = wrap(subtitle, 60).slice(0, 2);
  const subMarkup = subLines
    .map(
      (line, index) =>
        `<text x="76" y="${560 + index * 28}" font-family="DejaVu Sans Mono, monospace" font-size="22" fill="#9AA8A0">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.4" fill="#22C55E" opacity="0.16"/>
    </pattern>
    <pattern id="lines" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <rect width="1" height="34" fill="#E8F0EA" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="#0A0D0C"/>
  <rect width="1200" height="630" fill="url(#lines)"/>
  <rect x="0" y="0" width="1200" height="630" fill="url(#dots)"/>
  <rect x="0" y="0" width="14" height="630" fill="#22C55E"/>
  <rect x="72" y="54" width="56" height="6" fill="#22C55E"/>
  <text x="144" y="64" font-family="DejaVu Sans Mono, monospace" font-size="20" letter-spacing="5" fill="#22C55E">${escapeXml(kicker)}</text>
  <text x="72" y="128" font-family="DejaVu Sans Mono, monospace" font-size="24" fill="#9AA8A0">dipo@portfolio:~$ ship --production</text>
  ${titleMarkup}
  ${subMarkup}
  <line x1="72" y1="590" x2="1128" y2="590" stroke="#2A352E" stroke-width="1"/>
  <text x="72" y="620" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="#9AA8A0">dipo.dev</text>
  <text x="1128" y="620" text-anchor="end" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="#22C55E">99.95% uptime</text>
</svg>`;
}

export async function getStaticPaths() {
  const { projects, posts } = await getContent();
  return [
    ...Object.entries(PAGE_META).map(([slug, props]) => ({ params: { slug }, props })),
    ...projects.map((project) => ({
      params: { slug: `project-${project.slug}` },
      props: {
        kicker: "CASE STUDY",
        title: project.title,
        subtitle: project.summary,
      } satisfies OgProps,
    })),
    ...posts.map((post) => ({
      params: { slug: `note-${post.slug}` },
      props: {
        kicker: "NOTE",
        title: post.title,
        subtitle: post.excerpt,
      } satisfies OgProps,
    })),
  ];
}

export const GET: APIRoute = async ({ props }) => {
  const png = await sharp(Buffer.from(ogSvg(props as OgProps)))
    .png({ compressionLevel: 9 })
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
