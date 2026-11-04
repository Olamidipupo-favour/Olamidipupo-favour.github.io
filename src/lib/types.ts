export type ImageRef = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
} | null;

export type Social = {
  label: string;
  url: string;
};

export type CvEducation = {
  school: string;
  qualification: string;
  detail?: string;
};

export type CvAward = {
  title: string;
  year?: string;
};

export type SiteSettings = {
  name: string;
  shortName: string;
  tagline: string;
  subline: string;
  /** "Ile-Ife, Nigeria" — city only, never a home address. */
  location: string;
  availability: {
    status: "open" | "limited" | "closed";
    text: string;
  };
  nowBuilding: string;
  avatar: ImageRef;
  mascotInk: ImageRef;
  mascotShonen: ImageRef;
  email: string;
  socials: Social[];
  cvPdf: string | null;
  seo: {
    title: string;
    description: string;
    ogImage?: ImageRef;
  };
  cv: {
    summary: string;
    skills: string[];
    education: CvEducation[];
    awards: CvAward[];
    certifications: string[];
    proofPoints: { label: string; value: string }[];
  };
};

export type Metric = {
  label: string;
  value: string;
};

export type Project = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  role: string;
  stack: string[];
  metrics: Metric[];
  problem: string;
  approach: string;
  outcome: string;
  links: { label: string; url: string }[];
  cover: ImageRef;
  featured: boolean;
  order: number;
  bodyHtml: string;
};

export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  cover: ImageRef;
  tags: string[];
  bodyHtml: string;
  publishedAt: string;
  readingTime: number;
};

export type Service = {
  id: string;
  title: string;
  description: string;
  deliverables: string[];
  startingPrice: string | null;
  order: number;
};

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  company: string;
  quote: string;
  avatar: ImageRef;
  link: string | null;
  order: number;
};

export type Experience = {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
  order: number;
};

export type GalleryItem = {
  id: string;
  image: ImageRef;
  caption: string;
  date: string;
};

export type Content = {
  settings: SiteSettings;
  projects: Project[];
  posts: Post[];
  services: Service[];
  testimonials: Testimonial[];
  experience: Experience[];
  gallery: GalleryItem[];
};
