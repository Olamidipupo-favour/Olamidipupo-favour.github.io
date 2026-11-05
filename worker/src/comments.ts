// Public comment reads are intentionally filtered here and nowhere else.
export const PUBLIC_COMMENTS_SQL =
  "SELECT id, name, body, created_at AS created FROM comments WHERE slug = ? AND status = 'approved' ORDER BY created_at ASC LIMIT 100";

export type PublicComment = {
  id: number;
  name: string;
  body: string;
  created: string;
};

export async function listApprovedComments(
  db: Pick<D1Database, "prepare">,
  slug: string,
): Promise<PublicComment[]> {
  const { results } = await db
    .prepare(PUBLIC_COMMENTS_SQL)
    .bind(slug)
    .all<PublicComment>();
  return results;
}
