import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");

const normaliseBase = (value = "/") => {
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
};

const site = (process.env.SITE_URL || env.SITE_URL || "https://dipo.dev").replace(
  /\/+$/,
  "",
);
const base = normaliseBase(process.env.BASE_PATH || env.BASE_PATH || "/");

export default defineConfig({
  site,
  base,
  output: "static",
  integrations: [
    tailwind({ applyBaseStyles: false }),
    sitemap({
      filter: (page) => !page.includes("/og/"),
    }),
  ],
  image: {
    service: { entrypoint: "astro/assets/services/sharp" },
  },
  build: {
    inlineStylesheets: "auto",
  },
});
