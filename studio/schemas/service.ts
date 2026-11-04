import { defineField, defineType } from "sanity";

export const service = defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (Rule) => Rule.required().max(90) }),
    defineField({ name: "description", title: "Description", type: "text", rows: 4, validation: (Rule) => Rule.required().max(320) }),
    defineField({
      name: "deliverables",
      title: "Deliverables",
      type: "array",
      of: [{ type: "string" }],
      validation: (Rule) => Rule.max(8),
    }),
    defineField({
      name: "startingPrice",
      title: "Starting price",
      type: "string",
      description: "Optional and honest. Leave empty rather than inventing a price.",
    }),
    defineField({ name: "order", title: "Order", type: "number", initialValue: 99 }),
  ],
  orderings: [{ title: "Manual order", name: "manual", by: [{ field: "order", direction: "asc" }] }],
  preview: { select: { title: "title", subtitle: "startingPrice" } },
});
