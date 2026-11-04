import { defineField, defineType } from "sanity";

export const galleryItem = defineType({
  name: "galleryItem",
  title: "Gallery item",
  type: "document",
  fields: [
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
      fields: [defineField({ name: "alt", title: "Alternative text", type: "string" })],
    }),
    defineField({ name: "caption", title: "Caption", type: "string", validation: (Rule) => Rule.required().max(180) }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      validation: (Rule) => Rule.required(),
    }),
  ],
  orderings: [{ title: "Newest", name: "newest", by: [{ field: "date", direction: "desc" }] }],
  preview: { select: { title: "caption", subtitle: "date", media: "image" } },
});
