import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { catalogApi } from '../lib/api.js';
import { useAsync, useDebounced, useDocumentMeta } from '../hooks/index.js';
import { ContentCard, GenreChips } from '../components/media.jsx';
import { FilterBar, Pagination } from '../components/catalog.jsx';
import { EmptyState, ErrorState, Input, PosterSkeleton } from '../components/ui.jsx';
import { resultsLabel } from '../lib/format.js';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const term = searchParams.get('q') ?? '';
  const debouncedTerm = useDebounced(term, 350);
  const page = Number(searchParams.get('page')) || 1;
  const genre = searchParams.get('genre') ?? '';
  const kind = searchParams.get('kind') ?? '';
  const sort = searchParams.get('sort') ?? 'popular';

  const meta = useAsync(() => catalogApi.filters(), []);

  const results = useAsync(
    () =>
      catalogApi.search({
        q: debouncedTerm.trim(),
        page,
        pageSize: 24,
        genre: genre || undefined,
        kind: kind || undefined,
        sort: sort || undefined,
      }),
    [debouncedTerm, page, genre, kind, sort],
  );

  const people = useAsync(
    () =>
      debouncedTerm.trim().length >= 2
        ? catalogApi.searchPeople(debouncedTerm.trim())
        : Promise.resolve(null),
    [debouncedTerm],
  );

  useDocumentMeta({
    title: term ? `جست‌وجو برای «${term}»` : 'جست‌وجو',
    description: 'جست‌وجو در عنوان فارسی و انگلیسی فیلم‌ها، سریال‌ها و عوامل در سینه‌ورس.',
  });

  const patch = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const items = results.data?.items ?? [];
  const total = results.data?.total ?? 0;
  const hasTerm = debouncedTerm.trim().length > 0;

  const suggestions = useMemo(
    () => ['اکشن', 'درام', 'علمی-تخیلی', 'جنایی', 'کمدی', 'مستند'],
    [],
  );

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1 className="page-title">جست‌وجو</h1>
          <p className="page-subtitle">
            جست‌وجو در عنوان فارسی و اصلی انجام می‌شود و نیم‌فاصله نیز در نظر گرفته می‌شود.
          </p>
        </div>
      </div>

      <FilterBar
        filters={{ kind: kind || undefined, genre: genre || undefined, sort }}
        meta={meta.data}
        onChange={patch}
        onReset={() => setSearchParams(term ? { q: term } : {}, { replace: true })}
      >
        <Input
          type="search"
          placeholder="نام فیلم، سریال یا عبارت مورد نظر…"
          value={term}
          autoFocus
          onChange={(event) => patch({ q: event.target.value })}
          aria-label="عبارت جست‌وجو"
        />
      </FilterBar>

      {!hasTerm ? (
        <div className="search-hints">
          <EmptyState
            icon="search"
            title="چه چیزی می‌خواهید تماشا کنید؟"
            description="نام اثر یا یکی از موضوع‌های پیشنهادی را انتخاب کنید."
          />
          <div className="search-hints__chips">
            {suggestions.map((suggestion) => (
              <Link key={suggestion} to={`/search?q=${encodeURIComponent(suggestion)}`} className="chip">
                {suggestion}
              </Link>
            ))}
          </div>
        </div>
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={results.reload} />
      ) : results.loading ? (
        <div className="grid-cards">
          {Array.from({ length: 8 }, (_, index) => (
            <PosterSkeleton key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="search"
          title="نتیجه‌ای یافت نشد"
          description={`برای «${debouncedTerm}» موردی پیدا نشد. املای عبارت را بررسی کنید یا فیلترها را تغییر دهید.`}
          action={
            <Link to="/browse" className="btn btn--outline btn--sm">
              مرور کل کتابخانه
            </Link>
          }
        />
      ) : (
        <>
          <p className="filters__count">
            {resultsLabel(total)} برای «<strong>{debouncedTerm}</strong>»
          </p>

          {people.data?.items?.length ? (
            <section className="search-people">
              <h2 className="detail__section-title">عوامل</h2>
              <div className="search-people__list">
                {people.data.items.map((person) => (
                  <Link key={person.id} to={`/person/${person.id}`} className="search-people__item">
                    <span className="cast__photo" style={{ width: 56, height: 56 }}>
                      {person.photo_url ? <img src={person.photo_url} alt="" loading="lazy" /> : null}
                    </span>
                    <span className="search-people__text">
                      <strong>{person.name_fa || person.name_en}</strong>
                      <span className="ltr dim">{person.name_en}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid-cards">
            {items.map((item) => (
              <ContentCard key={`${item.kind}-${item.id}`} content={item} />
            ))}
          </div>
          <Pagination
            page={results.data.page}
            totalPages={results.data.totalPages}
            onChange={(nextPage) => patch({ page: nextPage })}
          />
        </>
      )}
    </div>
  );
}
