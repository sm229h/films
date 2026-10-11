/**
 * Small shared pieces for the admin panel: page header, pagination and the
 * label/tone maps used by every list. Kept here so the six admin screens share
 * one copy instead of six slightly different ones.
 */
import { Button } from '../../components/ui.jsx';
import { toFaDigits } from '../../lib/format.js';

export const CONTENT_STATUS_LABEL = { published: 'منتشرشده', draft: 'پیش‌نویس' };
export const CONTENT_STATUS_TONE = { published: 'success', draft: 'warning' };
export const ACCESS_LABEL_FA = { free: 'رایگان', premium: 'ویژه' };
export const ROLE_LABEL = { admin: 'مدیر اصلی', support: 'پشتیبان', user: 'کاربر' };

export const SECTION_SOURCE_LABEL = {
  trending: 'ترندها',
  popular: 'محبوب‌ترین‌ها',
  top_rated: 'بالاترین امتیاز',
  new: 'تازه‌اضافه‌شده‌ها',
  awards: 'برندگان جوایز',
  genre: 'یک ژانر مشخص',
  custom: 'انتخاب دستی',
  continue_watching: 'ادامه تماشا (شخصی)',
};

export const SECTION_SOURCE_OPTIONS = Object.entries(SECTION_SOURCE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const BANNER_PLACEMENT_OPTIONS = [
  { value: 'home', label: 'صفحه اصلی' },
  { value: 'movies', label: 'فیلم‌ها' },
  { value: 'series', label: 'سریال‌ها' },
  { value: 'plans', label: 'صفحه اشتراک' },
];

export function AdminHeader({ title, description, actions }) {
  return (
    <header className="admin__head">
      <div>
        <h1 className="admin__title">{title}</h1>
        {description ? <p className="admin__desc">{description}</p> : null}
      </div>
      {actions ? <div className="admin__actions">{actions}</div> : null}
    </header>
  );
}

export function Pagination({ page, pageSize, total, onChange, busy }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="admin-pager" aria-label="صفحه‌بندی">
      <Button
        variant="outline"
        size="sm"
        icon="chevronRight"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        قبلی
      </Button>
      <span>
        صفحه {toFaDigits(page)} از {toFaDigits(pages)}
      </span>
      <Button
        variant="outline"
        size="sm"
        iconRight="chevronLeft"
        disabled={busy || page >= pages}
        onClick={() => onChange(page + 1)}
      >
        بعدی
      </Button>
    </nav>
  );
}

export function LoadingRows({ count = 4 }) {
  return (
    <div className="admin-list" aria-busy="true" aria-label="در حال بارگذاری">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="admin-row admin-row--ghost" />
      ))}
    </div>
  );
}
