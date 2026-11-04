import { createClient } from "@sanity/client";
import { seedContent } from "@/content/seed";
import { portableTextToHtml, readingTime } from "@/lib/portableText";
import type {
  Content,
  Experience,
  GalleryItem,
  ImageRef,
  Post,
  Project,
  Service,
  SiteSettings,
  Testimonial,
} from "@/lib/types";

const projectId = import.meta.env.PUBLIC_SANITY_PROJECT_ID;
const dataset = import.meta.env.PUBLIC_SANITY_DATASET ?? "production";
// Draft previews are local-only. The preview token is never read during a build.
const previewToken = import.meta.env.DEV
  ? import.meta.env.SANITY_PREVIEW_TOKEN
  : undefined;
const token = previewToken ?? import.meta.env.SANITY_API_TOKEN;

export const sanityConfigured = Boolean(projectId);

const client = projectId
  ? createClient({
      projectId,
      dataset,
      apiVersion: "2025-01-01",
      useCdn: !token,
      token,
      perspective: previewToken ? "previewDrafts" : "published",
    })
  : null;

const imageProjection = `{
  alt,
  "url": asset->url,
  "width": asset->metadata.dimensions.width,
  "height": asset->metadata.dimensions.height
}`;

const settingsQuery = `*[_type == "siteSettings"][0]{
  name,
  shortName,
  tagline,
  subline,
  location,
  availability,
  nowBuilding,
  "avatar": avatar${imageProjection},
  "mascotInk": mascotInk${imageProjection},
  "mascotShonen": mascotShonen${imageProjection},
  email,
  socials[]{label, url},
  "cvPdf": cvPdf.asset->url,
  seo,
  cv{
    summary,
    skills,
    education[]{school, qualification, detail},
    awards[]{title, year},
    certifications,
    proofPoints[]{label, value}
  }
}`;

const projectsQuery = `*[_type == "project"] | order(order asc, _createdAt desc){
  "id": _id,
  title,
  "slug": slug.current,
  summary,
  role,
  stack,
  metrics[]{label, value},
  problem,
  approach,
  outcome,
  links[]{label, url},
  "cover": cover${imageProjection},
  featured,
  order,
  body[]{
    ...,
    _type == "image" => { ..., "url": asset->url }
  }
}`;

const postsQuery = `*[_type == "post"] | order(publishedAt desc){
  "id": _id,
  title,
  "slug": slug.current,
  excerpt,
  "cover": cover${imageProjection},
  tags,
  body[]{
    ...,
    _type == "image" => { ..., "url": asset->url }
  },
  publishedAt
}`;

const servicesQuery = `*[_type == "service"] | order(order asc){
  "id": _id, title, description, deliverables, startingPrice, order
}`;

const testimonialsQuery = `*[_type == "testimonial"] | order(order asc){
  "id": _id, name, role, company, quote,
  "avatar": avatar${imageProjection},
  link, order
}`;

const experienceQuery = `*[_type == "experience"] | order(order asc){
  "id": _id, company, role, location, startDate, endDate, current, bullets, order
}`;

const galleryQuery = `*[_type == "galleryItem"] | order(date desc){
  "id": _id,
  "image": image${imageProjection},
  caption,
  date
}`;

const asImage = (image: ImageRef | undefined | null): ImageRef =>
  image?.url ? image : null;

function normaliseSettings(raw: any): SiteSettings {
  if (!raw) return seedContent.settings;
  const fallback = seedContent.settings;
  return {
    name: raw.name || fallback.name,
    shortName: raw.shortName || fallback.shortName,
    tagline: raw.tagline || fallback.tagline,
    subline: raw.subline || fallback.subline,
    location: raw.location || fallback.location,
    availability: {
      status: raw.availability?.status || fallback.availability.status,
      text: raw.availability?.text || fallback.availability.text,
    },
    nowBuilding: raw.nowBuilding || fallback.nowBuilding,
    avatar: asImage(raw.avatar),
    mascotInk: asImage(raw.mascotInk),
    mascotShonen: asImage(raw.mascotShonen),
    email: raw.email || fallback.email,
    socials:
      Array.isArray(raw.socials) && raw.socials.length
        ? raw.socials
        : fallback.socials,
    cvPdf: raw.cvPdf || null,
    seo: {
      title: raw.seo?.title || fallback.seo.title,
      description: raw.seo?.description || fallback.seo.description,
      ogImage: asImage(raw.seo?.ogImage),
    },
    cv: {
      summary: raw.cv?.summary || fallback.cv.summary,
      skills: raw.cv?.skills?.length ? raw.cv.skills : fallback.cv.skills,
      education: raw.cv?.education?.length
        ? raw.cv.education
        : fallback.cv.education,
      awards: raw.cv?.awards?.length ? raw.cv.awards : fallback.cv.awards,
      certifications: raw.cv?.certifications?.length
        ? raw.cv.certifications
        : fallback.cv.certifications,
      proofPoints: raw.cv?.proofPoints?.length
        ? raw.cv.proofPoints
        : fallback.cv.proofPoints,
    },
  };
}

const normaliseProject = (raw: any): Project => ({
  id: raw.id,
  title: raw.title,
  slug: raw.slug,
  summary: raw.summary ?? "",
  role: raw.role ?? "",
  stack: raw.stack ?? [],
  metrics: raw.metrics ?? [],
  problem: raw.problem ?? "",
  approach: raw.approach ?? "",
  outcome: raw.outcome ?? "",
  links: raw.links ?? [],
  cover: asImage(raw.cover),
  featured: Boolean(raw.featured),
  order: raw.order ?? 99,
  bodyHtml: portableTextToHtml(raw.body),
});

const normalisePost = (raw: any): Post => {
  const bodyHtml = portableTextToHtml(raw.body);
  return {
    id: raw.id,
    title: raw.title,
    slug: raw.slug,
    excerpt: raw.excerpt ?? "",
    cover: asImage(raw.cover),
    tags: raw.tags ?? [],
    bodyHtml,
    publishedAt: raw.publishedAt ?? new Date().toISOString(),
    readingTime: readingTime(bodyHtml),
  };
};

async function fetchSanity(): Promise<Content> {
  if (!client) return seedContent;

  const [settings, projects, posts, services, testimonials, experience, gallery] =
    await Promise.all([
      client.fetch(settingsQuery),
      client.fetch(projectsQuery),
      client.fetch(postsQuery),
      client.fetch(servicesQuery),
      client.fetch(testimonialsQuery),
      client.fetch(experienceQuery),
      client.fetch(galleryQuery),
    ]);

  return {
    settings: normaliseSettings(settings),
    projects: projects.length
      ? projects.map(normaliseProject)
      : seedContent.projects,
    posts: posts.map(normalisePost),
    services: services.map((service: any) => ({
      ...service,
      id: service.id,
      deliverables: service.deliverables ?? [],
    })) as Service[],
    testimonials: testimonials.map((item: any) => ({
      ...item,
      id: item.id,
      avatar: asImage(item.avatar),
    })) as Testimonial[],
    experience: (experience.length
      ? experience
      : seedContent.experience) as Experience[],
    gallery: gallery.map((item: any) => ({
      ...item,
      id: item.id,
      image: asImage(item.image),
    })) as GalleryItem[],
  };
}

let cached: Content | null = null;

/** Fetched once per build (or dev server restart). */
export async function getContent(): Promise<Content> {
  if (cached) return cached;
  if (!sanityConfigured) {
    cached = seedContent;
    return cached;
  }
  try {
    cached = await fetchSanity();
    return cached;
  } catch (error) {
    console.warn(
      "[content] Sanity fetch failed, building from local CV fallback.",
      error,
    );
    cached = seedContent;
    return cached;
  }
}
