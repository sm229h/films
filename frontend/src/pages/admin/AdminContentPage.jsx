import { useEffect, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAsync, useDebounced, useDocumentMeta } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Badge, Button, EmptyState, ErrorState, Input, Select } from '../../components/ui.jsx';
import { KIND_LABEL, toFaDigits } from '../../lib/format.js';
import {
  ACCESS_LABEL_FA,
  AdminHeader,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_TONE,
  LoadingRows,
  Pagination,
} from './parts.jsx';
import './admin.css';

const PAGE_SIZE = 20;

const KIND_OPTIONS = [
  { value: 'movie', label: 'فیلم' },
  { value: 'series', label: 'سریال' },
];
const STATUS_OPTIONS = [
  { value: 'published', label: 'منتشرشده' },
  { value: 'draft', label: 'پیش‌نویس' },
];
const ACCESS_OPTIONS = [
  { value: 'free', label: 'رایگان' },
  { value: 'premium', label: 'ویژه' },
];

export default function AdminContentPage() {
  useDocumentMeta({ title: 'مدیریت محتوا' });
  const { isStrictAdmin } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState({ q: '', kind: '', status: '', access: '' });
  const [page, setPage] = useState(1);
  const q = useDebounced(filters.q, 400);
  const { kind, status, access } = filters;

  useEffect(() => {
    setPage(1);
  }, [q, kind, status, access]);

  const { data, loading, error, reload } = useAsync(
    () =>
      adminApi.content({
        q,
        kind: kind || undefined,
        status: status || undefined,
        access: access || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [q, kind, status, access, page],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const remove = async (item) => {
    if (!window.confirm(`«${item.title_fa}» برای همیشه حذف شود؟`)) return;
    try {
      await adminApi.deleteContent(item.id);
      toast.success('محتوا حذف شد.');
      reload();
    } catch (deleteError) {
      toast.error(deleteError.message);
    }
  };

  return (
    <>
      <AdminHeader
        title="مدیریت محتوا"
        description="جست‌وجو، ویرایش و انتشار فیلم‌ها و سریال‌ها"
        actions={
          <Button to="/admin/content/new" icon="plus">
            افزودن محتوا
          </Button>
        }
      />

      <div className="admin-card">
        <div className="admin-filters">
          <Input
            type="search"
            placeholder="جستجوی عنوان…"
            aria-label="جستجوی عنوان"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
          <Select
            aria-label="نوع محتوا"
            placeholder="همه انواع"
            options={KIND_OPTIONS}
            value={filters.kind}
            onChange={(event) => setFilters((prev) => ({ ...prev, kind: event.target.value }))}
          />
          <Select
            aria-label="وضعیت انتشار"
            placeholder="همه وضعیت‌ها"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          />
          <Select
            aria-label="سطح دسترسی"
            placeholder="همه سطوح دسترسی"
            options={ACCESS_OPTIONS}
            value={filters.access}
            onChange={(event) => setFilters((prev) => ({ ...prev, access: event.target.value }))}
          />
        </div>
      </div>

      {loading ? (
        <LoadingRows count={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="film"
          title="محتوایی یافت نشد"
          description="فیلترها را تغییر دهید یا یک عنوان تازه اضافه کنید."
        />
      ) : (
        <div className="admin-list">
          {items.map((item) => (
            <div className="admin-row" key={item.id}>
              <div className="thumb-sm">
                {item.poster_url ? <img src={item.poster_url} alt="" loading="lazy" /> : null}
              </div>
              <div className="admin-row__main">
                <div className="admin-row__title">{item.title_fa}</div>
                <div className="admin-row__meta">
                  <span dir="ltr">{item.title_en}</span> · {KIND_LABEL[item.kind]} ·{' '}
                  {toFaDigits(item.release_year ?? '—')}
                  {item.kind === 'series' ? ` · ${toFaDigits(item.season_count)} فصل` : ''}
                </div>
              </div>
              <Badge tone={CONTENT_STATUS_TONE[item.status] ?? 'neutral'}>
                {CONTENT_STATUS_LABEL[item.status] ?? item.status}
              </Badge>
              <Badge tone={item.access === 'free' ? 'neutral' : 'accent'}>
                {ACCESS_LABEL_FA[item.access] ?? item.access}
              </Badge>
              <div className="admin-row__actions">
                <Button variant="outline" size="sm" icon="edit" to={`/admin/content/${item.id}`}>
                  ویرایش
                </Button>
                {isStrictAdmin ? (
                  <Button variant="danger" size="sm" icon="trash" onClick={() => remove(item)}>
                    حذف
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={setPage}
        busy={loading}
      />
    </>
  );
}
