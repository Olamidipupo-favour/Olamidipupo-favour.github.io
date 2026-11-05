import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { listApprovedComments, PUBLIC_COMMENTS_SQL } from "../src/comments";

function d1Adapter(db: DatabaseSync): Pick<D1Database, "prepare"> {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async all() {
              return { results: db.prepare(sql).all(...values) };
            },
          };
        },
      };
    },
  } as unknown as Pick<D1Database, "prepare">;
}

describe("public comments", () => {
  it("returns approved comments only", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z'
      );
      INSERT INTO comments (slug, name, body, status) VALUES
        ('post', 'Approved', 'visible', 'approved'),
        ('post', 'Pending', 'hidden', 'pending'),
        ('post', 'Rejected', 'hidden', 'rejected'),
        ('post', 'Spam', 'hidden', 'spam');
    `);

    const comments = await listApprovedComments(d1Adapter(db), "post");

    expect(PUBLIC_COMMENTS_SQL).toContain("status = 'approved'");
    expect(comments.map((comment) => comment.name)).toEqual(["Approved"]);
    db.close();
  });
});
