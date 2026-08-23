const DEFAULT_PAGE_SIZE = 20;

export async function getPullRequests(db, repositoryId, page = 1) {
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;

  const result = await db.query(
    `
      SELECT pr_id, title, author, created_at
      FROM pull_requests
      WHERE repository_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    [repositoryId, DEFAULT_PAGE_SIZE, offset]
  );

  return {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    total: result.rowCount,
    items: result.rows,
  };
}

export async function getPullRequest(db, repositoryId, prId) {
  const result = await db.query(
    `
      SELECT pr_id, title, author, created_at
      FROM pull_requests
      WHERE repository_id = $1
        AND pr_id = $2
    `,
    [repositoryId, prId]
  );

  return result.rows[0] ?? null;
}
