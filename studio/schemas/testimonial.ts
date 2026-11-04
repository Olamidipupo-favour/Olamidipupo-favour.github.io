import { defineField, defineType } from "sanity";

export const testimonial = defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (Rule) => Rule.required().max(80) }),
    defineField({ name: "role", title: "Role", type: "string", validation: (Rule) => Rule.required().max(80) }),
    defineField({ name: "company", title: "Company", type: "string", validation: (Rule) => Rule.max(80) }),
    defineField({
      name: "quote",
      title: "Quote",
      type: "text",
      rows: 5,
      validation: (Rule) => Rule.required().max(600),
    }),
    defineField({
      name: "avatar",
      title: "Avatar",
      type: "image",
      options: { hotspot: true },
      fields: [defineField({ name: "alt", title: "Alternative text", type: "string" })],
    }),
    defineField({ name: "link", title: "Profile link", type: "url" }),
    defineField({ name: "order", title: "Order", type: "number", initialValue: 99 }),
  ],
  orderings: [{ title: "Manual order", name: "manual", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "name", subtitle: "company", media: "avatar" } },
});
