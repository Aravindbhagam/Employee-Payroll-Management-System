const MAX_PAGE_SIZE = 200;

/**
 * options: { defaultPageSize?: number, optIn?: boolean }
 * When optIn is true, returns null unless the caller passes ?page=..., so a
 * list endpoint keeps returning its full result set for callers that just
 * need "everything" (e.g. a dropdown picker) while list-view pages opt in
 * by passing page/pageSize.
 */
function parsePagination(req, options = {}) {
  const { defaultPageSize = 25, optIn = false } = options;
  const rawPage = req.query.page;
  if (optIn && rawPage === undefined) return null;

  const page = Math.max(parseInt(rawPage ?? '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize ?? String(defaultPageSize), 10) || defaultPageSize, 1), MAX_PAGE_SIZE);
  return { page, pageSize, take: pageSize, skip: (page - 1) * pageSize };
}

module.exports = { parsePagination };
