import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { catalogApi } from '../lib/api.js';
import { useAsync, useDebounced, useDocumentMeta } from '../hooks/index.js';
import { FilterBar, Pagination } from '../components/catalog.jsx';
import { ContentCard } from '../components/media.jsx';
import { EmptyState, ErrorState, Input, PosterSkeleton } from '../components/ui.jsx';

const FILTER_KEYS = [
  'q',
  'kind',
  'genre',
  'country',
  'language',
  'quality',
  'yearFrom',
  'minRating',
  'sort',
  'page',
];

/** Coerces URL params into the shape the API expects (numbers where relevant). */
function readFilters(searchParams) {
  const filters = {};
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value === null || value === '') continue;
    if (['minRating', 'yearFrom', 'page'].includes(key)) filters[key] = Number(value);
    else filters[key] = value;
  }
  return filters;
}

export default function BrowsePage({ fixedKind, title = 'کتابخانه' }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const parsed = readFilters(searchParams);
    return fixedKind ? { ...parsed, kind: fixedKind } : parsed;
  }, [searchParams, fixedKind]);

  const debouncedQuery = useDebounced(filters.q ?? '', 400);

  const meta = useAsync(() => catalogApi.filters(), []);
  const list = useAsync(
    () =>
      catalogApi.list(fixedKind, {
        ...filters,
        q: debouncedQuery || undefined,
      }),
    [JSON.stringify({ ...filters, q: debouncedQuery })],
  );

  useDocumentMeta({
    title: title,
    description: `${title} — فهرست کامل آثار با امکان فیلتر بر اساس ژانر، سال، کشور، زبان، کیفیت و امتیاز در سینه‌ورس.`,
  });

  const patch = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      // Any filter change resets to page 1 unless the change *is* the page.
      if (!('page' in changes)) next.delete('page');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams();
    if (fixedKind) next.set('kind', fixedKind);
    setSearchParams(next, { replace: true });
  }, [fixedKind, setSearchParams]);

  const items = list.data?.items ?? [];

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            جست‌وجو، فیلتر و مرتب‌سازی روی کل کتابخانه اعمال می‌شود.
          </p>
        </div>
      </div>

      <FilterBar
        filters={filters}
        meta={meta.data}
        onChange={patch}
        onReset={reset}
        lockedKind={Boolean(fixedKind)}
        total={list.data?.total}
      >
        <Input
          type="search"
          placeholder="جست‌وجو در عنوان‌ها…"
          value={filters.q ?? ''}
          onChange={(event) => patch({ q: event.target.value })}
          aria-label="جست‌وجو در این فهرست"
        />
      </FilterBar>

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <div className="grid-cards">
          {Array.from({ length: 12 }, (_, index) => (
            <PosterSkeleton key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="search"
          title="نتیجه‌ای یافت نشد"
          description="با تغییر فیلترها یا عبارت جست‌وجو دوباره تلاش کنید."
        />
      ) : (
        <>
          <div className="grid-cards">
            {items.map((item) => (
              <ContentCard key={`${item.kind}-${item.id}`} content={item} />
            ))}
          </div>
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            onChange={(page) => patch({ page })}
          />
        </>
      )}
    </div>
  );
}
