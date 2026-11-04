import { defineField, defineType } from "sanity";

export const experience = defineType({
  name: "experience",
  title: "Experience",
  type: "document",
  fields: [
    defineField({ name: "company", title: "Company", type: "string", validation: (Rule) => Rule.required().max(90) }),
    defineField({ name: "role", title: "Role", type: "string", validation: (Rule) => Rule.required().max(90) }),
    defineField({ name: "location", title: "Location", type: "string", description: "City or Remote. Never a home address." }),
    defineField({ name: "startDate", title: "Start date", type: "string", validation: (Rule) => Rule.required() }),
    defineField({ name: "endDate", title: "End date", type: "string", initialValue: "Present" }),
    defineField({ name: "current", title: "Current role", type: "boolean", initialValue: false }),
    defineField({
      name: "bullets",
      title: "Bullets",
      type: "array",
      of: [{ type: "string" }],
      validation: (Rule) => Rule.max(6),
    }),
    defineField({ name: "order", title: "Order", type: "number", initialValue: 99 }),
  ],
  orderings: [{ title: "Manual order", name: "manual", by: [{ field: "order", direction: "asc" }] }],
  preview: {
    select: { title: "role", subtitle: "company" },
  },
});
