const MAX_PAGE_SIZE = 200;

/**
 * Reads ?page=/?pageSize= into { page, pageSize, take, skip } (take/skip are
 * ready to spread into a Prisma findMany). pageSize is capped at
 * MAX_PAGE_SIZE.
 *
 * Options: `defaultPageSize` (default 25), and `optIn` -- when true, returns
 * null unless the caller passes ?page=..., so a list endpoint keeps
 * returning its full result set for callers that just need "everything"
 * (e.g. a dropdown picker) while list-view pages opt in by passing
 * page/pageSize.
 */
export function parsePagination(req, options = {}) {
  const { defaultPageSize = 25, optIn = false } = options;
  const rawPage = req.query.page;
  if (optIn && rawPage === undefined) return null;

  const page = Math.max(parseInt(rawPage ?? '1', 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt(req.query.pageSize ?? String(defaultPageSize), 10) || defaultPageSize, 1),
    MAX_PAGE_SIZE
  );
  return { page, pageSize, take: pageSize, skip: (page - 1) * pageSize };
}
