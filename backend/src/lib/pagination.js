export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;

/** Normalises `?page` / `?pageSize` into safe integers plus a SQL OFFSET. */
export function parsePagination(query, { defaultSize = DEFAULT_PAGE_SIZE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.pageSize, 10) || defaultSize;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Builds the standard list envelope returned by every collection endpoint. */
export function paginated(items, total, { page, pageSize }) {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
