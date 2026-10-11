import { useMemo } from 'react';
import { Button, Icon, Select } from './ui.jsx';
import { toFaDigits } from '../lib/format.js';
import './catalog.css';

const SORT_OPTIONS = [
  { value: 'latest', label: 'جدیدترین' },
  { value: 'popular', label: 'محبوب‌ترین' },
  { value: 'rating', label: 'بالاترین امتیاز' },
  { value: 'az', label: 'الفبا (A-Z)' },
  { value: 'oldest', label: 'قدیمی‌ترین' },
];

const KIND_TABS = [
  { value: '', label: 'همه' },
  { value: 'movie', label: 'فیلم' },
  { value: 'series', label: 'سریال' },
];

/**
 * Every control here maps to a real query parameter that the API applies to the
 * database query — nothing is decorative.
 */
export function FilterBar({ filters, meta, onChange, onReset, lockedKind = false, total, children }) {
  const genreOptions = useMemo(
    () => (meta?.genres ?? []).map((genre) => ({ value: genre.value, label: genre.label })),
    [meta],
  );

  const activeCount = [
    filters.kind,
    filters.genre,
    filters.country,
    filters.language,
    filters.quality,
    filters.yearFrom,
    filters.minRating,
  ].filter(Boolean).length;

  return (
    <section className="filters" aria-label="فیلترها">
      <div className="filters__top">
        {!lockedKind ? (
          <div className="segmented" role="tablist" aria-label="نوع محتوا">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.value || 'all'}
                type="button"
                role="tab"
                aria-selected={(filters.kind ?? '') === tab.value}
                className={`segmented__item ${(filters.kind ?? '') === tab.value ? 'is-active' : ''}`}
                onClick={() => onChange({ kind: tab.value || undefined, page: 1 })}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="filters__search">{children}</div>

        <div className="filters__sort">
          <Select
            aria-label="مرتب‌سازی"
            value={filters.sort || 'latest'}
            onChange={(event) => onChange({ sort: event.target.value, page: 1 })}
            options={SORT_OPTIONS}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon="close"
          onClick={onReset}
          disabled={!activeCount}
          className="filters__reset"
        >
          حذف فیلترها{activeCount ? ` (${toFaDigits(activeCount)})` : ''}
        </Button>
      </div>

      <div className="filters__grid">
        <label className="filters__field">
          <span className="filters__label">ژانر</span>
          <Select
            value={filters.genre || ''}
            placeholder="همه ژانرها"
            onChange={(event) => onChange({ genre: event.target.value || undefined, page: 1 })}
            options={genreOptions}
          />
        </label>

        <label className="filters__field">
          <span className="filters__label">کشور سازنده</span>
          <Select
            value={filters.country || ''}
            placeholder="همه کشورها"
            onChange={(event) => onChange({ country: event.target.value || undefined, page: 1 })}
            options={meta?.countries ?? []}
          />
        </label>

        <label className="filters__field">
          <span className="filters__label">زبان اصلی</span>
          <Select
            value={filters.language || ''}
            placeholder="همه زبان‌ها"
            onChange={(event) => onChange({ language: event.target.value || undefined, page: 1 })}
            options={meta?.languages ?? []}
          />
        </label>

        <label className="filters__field">
          <span className="filters__label">سال انتشار</span>
          <Select
            value={filters.yearFrom || ''}
            placeholder="همه سال‌ها"
            onChange={(event) => onChange({ yearFrom: event.target.value || undefined, page: 1 })}
            options={meta?.years ?? []}
          />
        </label>

        <label className="filters__field">
          <span className="filters__label">کیفیت</span>
          <Select
            value={filters.quality || ''}
            placeholder="همه کیفیت‌ها"
            onChange={(event) => onChange({ quality: event.target.value || undefined, page: 1 })}
            options={meta?.qualities ?? []}
          />
        </label>

        <label className="filters__field filters__field--range">
          <span className="filters__label">
            حداقل امتیاز:{' '}
            <strong className="filters__value">
              {filters.minRating ? toFaDigits(Number(filters.minRating).toFixed(1)) : 'همه'}
            </strong>
          </span>
          <input
            className="range"
            type="range"
            min="0"
            max="9"
            step="0.5"
            value={filters.minRating || 0}
            onChange={(event) =>
              onChange({
                minRating: Number(event.target.value) || undefined,
                page: 1,
              })
            }
            aria-label="حداقل امتیاز"
          />
        </label>
      </div>

      {total !== undefined ? (
        <p className="filters__count">
          <Icon name="list" size={15} />
          {total ? `${toFaDigits(total)} عنوان با فیلترهای فعلی` : 'عنوانی با این فیلترها پیدا نشد'}
        </p>
      ) : null}
    </section>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;

  const pages = [];
  const push = (value) => {
    if (value >= 1 && value <= totalPages && !pages.includes(value)) pages.push(value);
  };
  push(1);
  for (let offset = -1; offset <= 1; offset += 1) push(page + offset);
  push(totalPages);
  pages.sort((a, b) => a - b);

  return (
    <nav className="pagination" aria-label="صفحه‌بندی">
      <Button
        variant="outline"
        size="sm"
        icon="chevronRight"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        قبلی
      </Button>

      {pages.map((value, index) => {
        const previous = pages[index - 1];
        const gap = previous && value - previous > 1;
        return (
          <span key={value} className="pagination__cell">
            {gap ? <span className="pagination__gap">…</span> : null}
            <button
              type="button"
              className={`pagination__page ${value === page ? 'is-active' : ''}`}
              onClick={() => onChange(value)}
              aria-current={value === page ? 'page' : undefined}
            >
              {toFaDigits(value)}
            </button>
          </span>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        iconRight="chevronLeft"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        بعدی
      </Button>
    </nav>
  );
}
