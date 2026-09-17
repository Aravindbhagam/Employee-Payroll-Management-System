import { Request } from 'express';

const MAX_PAGE_SIZE = 200;

export interface PageInfo {
  page: number;
  pageSize: number;
  take: number;
  skip: number;
}

interface Options {
  defaultPageSize?: number;
  // When true, returns null unless the caller passes ?page=..., so a list
  // endpoint keeps returning its full result set for callers that just
  // need "everything" (e.g. a dropdown picker) while list-view pages opt
  // in by passing page/pageSize.
  optIn?: boolean;
}

export function parsePagination(req: Request, options: Options = {}): PageInfo | null {
  const { defaultPageSize = 25, optIn = false } = options;
  const rawPage = req.query.page as string | undefined;
  if (optIn && rawPage === undefined) return null;

  const page = Math.max(parseInt(rawPage ?? '1', 10) || 1, 1);
  const pageSize = Math.min(
    Math.max(parseInt((req.query.pageSize as string | undefined) ?? String(defaultPageSize), 10) || defaultPageSize, 1),
    MAX_PAGE_SIZE
  );
  return { page, pageSize, take: pageSize, skip: (page - 1) * pageSize };
}
