import type { Content } from "@/lib/types";

/**
 * Local fallback content. The site uses Sanity when PUBLIC_SANITY_PROJECT_ID is set;
 * otherwise it builds from these CV facts so the site is never empty or broken.
 * Anything not supplied in the CV is marked [PLACEHOLDER] on purpose.
 */
export const seedContent: Content = {
  settings: {
    name: "Olamidipupo Agboola",
    shortName: "Dipo",
    tagline: "No cursed energy. Just fundamentals.",
    subline: "Backend engineer. Ships APIs that don't fall over.",
    location: "Ile-Ife, Nigeria",
    availability: {
      status: "open",
      text: "Open to remote backend roles and select freelance work.",
    },
    nowBuilding:
      "[PLACEHOLDER] Update this in Sanity: what I am building right now.",
    avatar: null,
    mascotInk: null,
    mascotShonen: null,
    email: "dipoagboola2019@gmail.com",
    socials: [
      { label: "GitHub", url: "https://github.com/olamidipupo-favour" },
      {
        label: "LinkedIn",
        url: "https://www.linkedin.com/in/olamidipupo-agboola-6b3917237",
      },
      { label: "X", url: "https://x.com/zeus_odin009" },
    ],
    cvPdf: null,
    seo: {
      title: "Olamidipupo Agboola — Backend Engineer",
      description:
        "Backend engineer (Python, Go, Node/NestJS, Postgres, Docker, Kubernetes) and MBBS student at OAU. I build APIs that stay up.",
    },
    cv: {
      summary:
        "Backend engineer with 4+ years of experience designing, building and running production systems. I care about fundamentals: clean data models, predictable APIs, observability and systems that survive peak load. Currently an MBBS student at Obafemi Awolowo University.",
      skills: [
        "Python",
        "Go",
        "Node.js / NestJS",
        "PostgreSQL",
        "Redis",
        "Celery",
        "Docker",
        "Kubernetes",
        "CI/CD",
        "System design",
        "Security reviews",
      ],
      education: [
        {
          school: "Obafemi Awolowo University",
          qualification: "MBBS, Medicine and Surgery",
          detail: "CGPA 4.8",
        },
      ],
      awards: [
        { title: "Winner, Buidlcon 2.0 Hackathon" },
        { title: "Winner, Hack n' Heights Hackathon" },
        { title: "Best Mathematics Student in Ondo State", year: "2021" },
        {
          title: "Second place, National Mathematics Olympiads Regionals",
          year: "2021",
        },
      ],
      certifications: ["Certified Python Developer (HackerRank)"],
      proofPoints: [
        { label: "Uptime", value: "99.95%" },
        { label: "Concurrent users", value: "2,500" },
        { label: "Active users", value: "10,000+" },
        { label: "Query response time", value: "-35%" },
        { label: "Peak-load downtime", value: "-50%" },
        { label: "Background throughput", value: "+60%" },
        { label: "Vulnerabilities fixed", value: "15+" },
        { label: "Production bugs", value: "-35%" },
      ],
    },
  },
  projects: [
    {
      id: "seed-tekcify",
      title: "Tekcify",
      slug: "tekcify",
      summary:
        "Centralized auth, PDFx and Campux — backend foundations for software used by 10,000+ people.",
      role: "Development Team Lead",
      stack: [
        "Python",
        "NestJS",
        "PostgreSQL",
        "Redis",
        "Docker",
        "Kubernetes",
      ],
      metrics: [
        { label: "Active users", value: "10,000+" },
        { label: "Uptime", value: "99.95%" },
        { label: "Peak-load downtime", value: "-50%" },
      ],
      problem:
        "[PLACEHOLDER] Add the product context and the constraint Tekcify faced. What was broken, slow or missing?",
      approach:
        "Led the development team and built shared backend foundations: a centralized authentication system, PDFx document tooling and Campux. Containerized services, introduced Kubernetes autoscaling, and moved background work to Celery.",
      outcome:
        "The software supports 10,000+ active users and holds 99.95% uptime. Autoscaling cut peak-load downtime by 50%, and Celery background jobs raised throughput by 60%.",
      links: [],
      cover: null,
      featured: true,
      order: 1,
      bodyHtml:
        "<p>Tekcify builds software for a large user base. I led the development team and owned the shared backend pieces that multiple products depend on.</p><h2>What I built</h2><ul><li>A centralized authentication system shared across products.</li><li>PDFx, document tooling for generating and handling PDFs.</li><li>Campux, a backend service used across the suite.</li></ul><p>[PLACEHOLDER] Add architecture details, a diagram or a link to a public case study.</p>",
    },
    {
      id: "seed-studybuddy",
      title: "StudyBuddy",
      slug: "studybuddy",
      summary:
        "An LLM-driven study assistant, containerized with Docker and shipped through GitHub Actions.",
      role: "Backend Developer / builder",
      stack: ["Python", "LLM APIs", "Docker", "GitHub Actions", "CI/CD"],
      metrics: [{ label: "Delivery", value: "CI/CD" }],
      problem:
        "[PLACEHOLDER] Add the study problem StudyBuddy solves and who it is for.",
      approach:
        "Built the backend for an LLM-driven study assistant, containerized the app with Docker, and automated builds and deploys with GitHub Actions.",
      outcome:
        "[PLACEHOLDER] Add usage numbers, a user quote or a link to the repo when available.",
      links: [],
      cover: null,
      featured: true,
      order: 2,
      bodyHtml:
        "<p>StudyBuddy is an LLM-driven study assistant. I built the backend and the delivery pipeline: Docker for a reproducible runtime, GitHub Actions for automated checks and deploys.</p><p>[PLACEHOLDER] Add the model/provider choices, retrieval design and what you would change next.</p>",
    },
    {
      id: "seed-dido",
      title: "DIDO",
      slug: "dido",
      summary:
        "A decentralized donation platform built around transparent, on-chain giving.",
      role: "Backend / smart contract developer",
      stack: ["Solidity", "Node.js", "PostgreSQL", "Docker"],
      metrics: [],
      problem:
        "[PLACEHOLDER] Add the trust problem DIDO addresses and the people it serves.",
      approach:
        "Built the donation flow and the backend around a decentralized ledger so donations can be verified rather than trusted.",
      outcome:
        "[PLACEHOLDER] Add funds moved, donor count or launch details when available.",
      links: [],
      cover: null,
      featured: true,
      order: 3,
      bodyHtml:
        "<p>DIDO is a decentralized donation platform. The core idea is simple: giving should be verifiable by the people giving and receiving.</p><p>[PLACEHOLDER] Add the contract design, the backend boundaries and a public link.</p>",
    },
    {
      id: "seed-oau-medicos",
      title: "OAU Medicos",
      slug: "oau-medicos",
      summary:
        "A student data system for the College of Medicine at Obafemi Awolowo University.",
      role: "Backend Developer",
      stack: ["Python", "PostgreSQL", "Docker"],
      metrics: [],
      problem:
        "[PLACEHOLDER] Add the administrative problem OAU Medicos removes.",
      approach:
        "Built a student records backend for the college, with a relational data model and containerized deployment.",
      outcome: "[PLACEHOLDER] Add adoption details when available.",
      links: [],
      cover: null,
      featured: true,
      order: 4,
      bodyHtml:
        "<p>OAU Medicos is a student data system for the College of Medicine. It keeps records structured and queryable instead of spread across spreadsheets.</p><p>[PLACEHOLDER] Add the schema, the security model and adoption numbers.</p>",
    },
  ],
  posts: [],
  services: [],
  testimonials: [],
  experience: [
    {
      id: "seed-tekcify-exp",
      company: "Tekcify",
      role: "Development Team Lead",
      location: "",
      startDate: "2024",
      endDate: "Present",
      current: true,
      bullets: [
        "Lead the development team building software used by 10,000+ active users.",
        "Kubernetes autoscaling cut peak-load downtime by 50%.",
      ],
      order: 1,
    },
    {
      id: "seed-pamouja-exp",
      company: "Pamouja",
      role: "Backend Developer",
      location: "",
      startDate: "2024",
      endDate: "Present",
      current: true,
      bullets: [
        "Build the backend for a freelance services marketplace that connects freelancers with people who need work done.",
        "Applied caching and system design principles to keep response paths fast.",
      ],
      order: 2,
    },
    {
      id: "seed-xavier-exp",
      company: "Xavier Paisley",
      role: "Backend Developer",
      location: "",
      startDate: "2024",
      endDate: "2025",
      current: false,
      bullets: [
        "Built the backend for a fintech application for storing landed assets.",
        "Wrote a framework for handling chats across all XP products.",
      ],
      order: 3,
    },
    {
      id: "seed-codecube-exp",
      company: "Codecube",
      role: "Lead Backend Developer",
      location: "Lagos, Nigeria",
      startDate: "2020",
      endDate: "2023",
      current: false,
      bullets: [
        "Led backend development and database management across client projects, including Liteweb.",
        "Built and maintained the backend of every project the team shipped.",
      ],
      order: 4,
    },
  ],
  gallery: [],
};

export const projectsList = seedContent.projects;
