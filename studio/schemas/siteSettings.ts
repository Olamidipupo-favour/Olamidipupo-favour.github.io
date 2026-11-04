import { defineField, defineType } from "sanity";

const imageWithAlt = (name: string, title: string, description?: string) =>
  defineField({
    name,
    title,
    type: "image",
    options: { hotspot: true },
    description,
    fields: [
      defineField({
        name: "alt",
        title: "Alternative text",
        type: "string",
        description: "Describe the image for screen readers. Leave empty only if decorative.",
      }),
    ],
  });

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site settings",
  type: "document",
  groups: [
    { name: "identity", title: "Identity", default: true },
    { name: "availability", title: "Availability" },
    { name: "cv", title: "CV" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({ name: "name", title: "Full name", type: "string", group: "identity", validation: (Rule) => Rule.required() }),
    defineField({ name: "shortName", title: "Short name", type: "string", group: "identity", initialValue: "Dipo" }),
    defineField({
      name: "tagline",
      title: "Headline / tagline",
      type: "string",
      group: "identity",
      initialValue: "No cursed energy. Just fundamentals.",
      validation: (Rule) => Rule.required().max(90),
    }),
    defineField({
      name: "subline",
      title: "Subline",
      type: "string",
      group: "identity",
      initialValue: "Backend engineer. Ships APIs that don't fall over.",
      validation: (Rule) => Rule.required().max(140),
    }),
    defineField({
      name: "location",
      title: "Based in",
      type: "string",
      group: "identity",
      description: "City and country only. Never a home address.",
      initialValue: "Ile-Ife, Nigeria",
      validation: (Rule) => Rule.required().max(80),
    }),
    defineField({
      name: "avatar",
      title: "Avatar",
      type: "image",
      group: "identity",
      options: { hotspot: true },
      description: "Use a real photo when ready. The site falls back to a pixel-art placeholder.",
      fields: [defineField({ name: "alt", title: "Alternative text", type: "string" })],
    }),
    imageWithAlt("mascotInk", "Mascot — Ink set", "Transparent WebP/PNG. Placed as supplied; not edited by the site."),
    imageWithAlt("mascotShonen", "Mascot — Shonen set", "Transparent WebP/PNG for Shonen colour mode."),
    defineField({ name: "email", title: "Email", type: "string", group: "identity", validation: (Rule) => Rule.required().email() }),
    defineField({
      name: "socials",
      title: "Social links",
      type: "array",
      group: "identity",
      of: [
        {
          type: "object",
          name: "social",
          fields: [
            defineField({ name: "label", title: "Label", type: "string", validation: (Rule) => Rule.required() }),
            defineField({ name: "url", title: "URL", type: "url", validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: "label", subtitle: "url" } },
        },
      ],
    }),
    defineField({
      name: "availability",
      title: "Availability",
      type: "object",
      group: "availability",
      fields: [
        defineField({
          name: "status",
          title: "Status",
          type: "string",
          options: {
            list: [
              { title: "Open", value: "open" },
              { title: "Limited", value: "limited" },
              { title: "Closed", value: "closed" },
            ],
            layout: "radio",
          },
          initialValue: "open",
          validation: (Rule) => Rule.required(),
        }),
        defineField({
          name: "text",
          title: "Availability text",
          type: "string",
          initialValue: "Open to remote backend roles and select freelance work.",
          validation: (Rule) => Rule.required().max(160),
        }),
      ],
    }),
    defineField({
      name: "nowBuilding",
      title: "Now building",
      type: "string",
      group: "availability",
      description: "Short status line shown on the home page and in the terminal.",
      initialValue: "A queue that refuses to lose jobs.",
      validation: (Rule) => Rule.max(160),
    }),
    defineField({
      name: "cvPdf",
      title: "CV PDF",
      type: "file",
      group: "cv",
      options: { accept: "application/pdf" },
      description: "Upload the public CV. Do not include a phone number or home address.",
    }),
    defineField({
      name: "cv",
      title: "CV content",
      type: "object",
      group: "cv",
      fields: [
        defineField({ name: "summary", title: "Summary", type: "text", rows: 4 }),
        defineField({ name: "skills", title: "Skills", type: "array", of: [{ type: "string" }] }),
        defineField({
          name: "education",
          title: "Education",
          type: "array",
          of: [
            {
              type: "object",
              name: "education",
              fields: [
                defineField({ name: "school", title: "School", type: "string" }),
                defineField({ name: "qualification", title: "Qualification", type: "string" }),
                defineField({ name: "detail", title: "Detail (e.g. CGPA)", type: "string" }),
              ],
            },
          ],
        }),
        defineField({
          name: "awards",
          title: "Awards",
          type: "array",
          of: [
            {
              type: "object",
              name: "award",
              fields: [
                defineField({ name: "title", title: "Award", type: "string" }),
                defineField({ name: "year", title: "Year", type: "string" }),
              ],
            },
          ],
        }),
        defineField({ name: "certifications", title: "Certifications", type: "array", of: [{ type: "string" }] }),
        defineField({
          name: "proofPoints",
          title: "Proof points",
          type: "array",
          of: [
            {
              type: "object",
              name: "proofPoint",
              fields: [
                defineField({ name: "label", title: "Label", type: "string" }),
                defineField({ name: "value", title: "Value", type: "string" }),
              ],
            },
          ],
        }),
      ],
    }),
    defineField({
      name: "seo",
      title: "SEO defaults",
      type: "object",
      group: "seo",
      fields: [
        defineField({ name: "title", title: "Default title", type: "string" }),
        defineField({ name: "description", title: "Default description", type: "text", rows: 3 }),
        imageWithAlt("ogImage", "Default social image", "Optional. The site generates per-page OG cards automatically."),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Site settings" }),
  },
});
