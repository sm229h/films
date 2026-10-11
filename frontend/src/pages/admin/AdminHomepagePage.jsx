import { useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAsync, useDebounced, useDocumentMeta } from '../../hooks/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  FormError,
  Input,
  Modal,
  Notice,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { toFaDigits } from '../../lib/format.js';
import {
  AdminHeader,
  BANNER_PLACEMENT_OPTIONS,
  LoadingRows,
  SECTION_SOURCE_LABEL,
  SECTION_SOURCE_OPTIONS,
} from './parts.jsx';
import './admin.css';

const str = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};
const num = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : Number(trimmed);
};

/** One editable homepage section: title, ordering, source and visibility. */
function SectionCard({ section, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    titleFa: section.title_fa,
    subtitle: section.subtitle ?? '',
    layout: section.layout,
    sourceType: section.source_type,
    sourceValue: section.source_value ?? '',
    maxItems: section.max_items,
    isActive: section.is_active,
    sortOrder: section.sort_order,
  });
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.updateSection(section.id, {
        titleFa: form.titleFa.trim(),
        subtitle: str(form.subtitle),
        layout: form.layout,
        sourceType: form.sourceType,
        sourceValue: str(form.sourceValue),
        maxItems: num(form.maxItems) ?? undefined,
        isActive: form.isActive,
        sortOrder: num(form.sortOrder) ?? undefined,
      });
      toast.success('ردیف صفحه اصلی ذخیره شد.');
      onSaved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="admin-card" onSubmit={save}>
      <div className="admin-row" style={{ border: 0, padding: 0, background: 'transparent' }}>
        <div className="admin-row__main">
          <h2 className="admin-card__title">{section.title_fa}</h2>
          <p className="admin-row__meta">
            کلید: <span dir="ltr">{section.key}</span> · منبع:{' '}
            {SECTION_SOURCE_LABEL[section.source_type] ?? section.source_type}
          </p>
        </div>
        <Badge tone={section.is_active ? 'success' : 'warning'}>
          {section.is_active ? 'فعال' : 'غیرفعال'}
        </Badge>
      </div>

      <div className="form-grid">
        <Field label="عنوان">
          <Input
            value={form.titleFa}
            onChange={(event) => setForm((prev) => ({ ...prev, titleFa: event.target.value }))}
          />
        </Field>
        <Field label="زیرعنوان">
          <Input
            value={form.subtitle}
            onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
          />
        </Field>
        <Field label="چیدمان">
          <Select
            value={form.layout}
            options={[
              { value: 'row', label: 'ردیفی (اسکرولی)' },
              { value: 'grid', label: 'شبکه‌ای' },
            ]}
            onChange={(event) => setForm((prev) => ({ ...prev, layout: event.target.value }))}
          />
        </Field>
        <Field label="نوع منبع">
          <Select
            value={form.sourceType}
            options={SECTION_SOURCE_OPTIONS}
            onChange={(event) => setForm((prev) => ({ ...prev, sourceType: event.target.value }))}
          />
        </Field>
        <Field
          label="مقدار منبع"
          hint="برای «یک ژانر مشخص» اسلاگ ژانر (مثلاً action) و برای «انتخاب دستی» خالی بگذارید."
        >
          <Input
            dir="ltr"
            value={form.sourceValue}
            onChange={(event) => setForm((prev) => ({ ...prev, sourceValue: event.target.value }))}
          />
        </Field>
        <Field label="حداکثر تعداد">
          <Input
            inputMode="numeric"
            value={form.maxItems}
            onChange={(event) => setForm((prev) => ({ ...prev, maxItems: event.target.value }))}
          />
        </Field>
        <Field label="ترتیب">
          <Input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
          />
        </Field>
      </div>

      <div className="form-actions">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          />
          نمایش در صفحه اصلی
        </label>
        <Button type="submit" size="sm" loading={saving}>
          ذخیره ردیف
        </Button>
      </div>
    </form>
  );
}

const EMPTY_BANNER = {
  titleFa: '',
  subtitle: '',
  imageUrl: '',
  linkUrl: '',
  placement: 'home',
  sortOrder: '100',
  isActive: true,
};

function BannerModal({ banner, onClose, onSaved }) {
  const toast = useToast();
  const editing = Boolean(banner);
  const [form, setForm] = useState(
    banner
      ? {
          titleFa: banner.title_fa,
          subtitle: banner.subtitle ?? '',
          imageUrl: banner.image_url ?? '',
          linkUrl: banner.link_url ?? '',
          placement: banner.placement ?? 'home',
          sortOrder: String(banner.sort_order ?? 100),
          isActive: Boolean(banner.is_active),
        }
      : EMPTY_BANNER,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.titleFa.trim()) {
      setError('عنوان بنر الزامی است.');
      return;
    }
    // The create endpoint accepts these fields as optional but not null, so an
    // empty value is omitted on create; update accepts null to clear a field.
    const optional = (value) => {
      const text = str(value);
      return editing ? text : text ?? undefined;
    };
    const payload = {
      titleFa: form.titleFa.trim(),
      subtitle: optional(form.subtitle),
      imageUrl: optional(form.imageUrl),
      linkUrl: optional(form.linkUrl),
      placement: form.placement,
      sortOrder: num(form.sortOrder) ?? 100,
      isActive: form.isActive,
    };
    setSaving(true);
    try {
      if (editing) await adminApi.updateBanner(banner.id, payload);
      else await adminApi.createBanner(payload);
      toast.success(editing ? 'بنر به‌روزرسانی شد.' : 'بنر اضافه شد.');
      onSaved();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'ویرایش بنر' : 'افزودن بنر'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={saving} onClick={submit}>
            {editing ? 'ذخیره تغییرات' : 'افزودن بنر'}
          </Button>
        </>
      }
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="عنوان" required>
          <Input
            value={form.titleFa}
            onChange={(event) => setForm((prev) => ({ ...prev, titleFa: event.target.value }))}
            required
          />
        </Field>
        <Field label="زیرعنوان">
          <Input
            value={form.subtitle}
            onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
          />
        </Field>
        <Field label="محل نمایش">
          <Select
            value={form.placement}
            options={BANNER_PLACEMENT_OPTIONS}
            onChange={(event) => setForm((prev) => ({ ...prev, placement: event.target.value }))}
          />
        </Field>
        <Field label="ترتیب">
          <Input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
          />
        </Field>
        <Field label="آدرس تصویر">
          <Input
            dir="ltr"
            value={form.imageUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
          />
        </Field>
        <Field label="آدرس لینک">
          <Input
            dir="ltr"
            value={form.linkUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
            placeholder="/plans"
          />
        </Field>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          />
          نمایش فعال
        </label>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

/** Picks the titles of a hand-curated section. */
function SectionItemsModal({ section, onClose, onSaved }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 400);
  const [selected, setSelected] = useState(() => (section.items ?? []).map((item) => item.id));
  const [saving, setSaving] = useState(false);

  const { data, loading, error } = useAsync(
    () => adminApi.content({ q, pageSize: 30 }),
    [q],
  );

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.setSectionItems(section.id, selected);
      toast.success('آیتم‌های ردیف ذخیره شد.');
      onSaved();
    } catch (saveError) {
      toast.error(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`انتخاب آیتم‌های «${section.title_fa}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={saving} onClick={save}>
            ذخیره انتخاب‌ها
          </Button>
        </>
      }
    >
      <Input
        type="search"
        placeholder="جستجوی عنوان…"
        aria-label="جستجوی عنوان"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {loading ? (
        <LoadingRows count={4} />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <div className="admin-list">
          {(data?.items ?? []).map((item) => {
            const active = selected.includes(item.id);
            return (
              <label className="admin-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(item.id)}
                  aria-label={`انتخاب ${item.title_fa}`}
                />
                <div className="thumb-sm">
                  {item.poster_url ? <img src={item.poster_url} alt="" loading="lazy" /> : null}
                </div>
                <div className="admin-row__main">
                  <div className="admin-row__title">{item.title_fa}</div>
                  <div className="admin-row__meta" dir="ltr">
                    {item.title_en}
                  </div>
                </div>
                {active ? <Badge tone="success">انتخاب‌شده</Badge> : null}
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function AdminHomepagePage() {
  useDocumentMeta({ title: 'صفحه اصلی و بنرها' });
  const toast = useToast();

  const sections = useAsync(() => adminApi.sections(), []);
  const banners = useAsync(() => adminApi.banners(), []);

  const [bannerModal, setBannerModal] = useState(null); // { banner } — null closes
  const [itemsTarget, setItemsTarget] = useState(null);

  const removeBanner = async (banner) => {
    if (!window.confirm(`بنر «${banner.title_fa}» حذف شود؟`)) return;
    try {
      await adminApi.deleteBanner(banner.id);
      toast.success('بنر حذف شد.');
      banners.reload();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const sectionItems = sections.data?.items ?? [];
  const bannerItems = banners.data?.items ?? [];

  return (
    <>
      <AdminHeader
        title="صفحه اصلی و بنرها"
        description="ردیف‌های صفحه اصلی و بنرهای تبلیغاتی را مدیریت کنید."
      />

      <Notice tone="info">
        تغییرات این بخش بلافاصله روی صفحه اصلی سایت اعمال می‌شود.
      </Notice>

      <h2 className="admin-card__title">ردیف‌های صفحه اصلی</h2>
      {sections.loading ? (
        <LoadingRows count={4} />
      ) : sections.error ? (
        <ErrorState error={sections.error} onRetry={sections.reload} />
      ) : (
        <div className="admin-grid-2">
          {sectionItems.map((section) => (
            <div key={section.id} className="admin-section">
              <SectionCard section={section} onSaved={sections.reload} />
              {section.source_type === 'custom' ? (
                <div className="admin-section__foot">
                  <span className="admin-note">
                    {section.items?.length
                      ? `${toFaDigits(section.items.length)} آیتم انتخاب‌شده`
                      : 'هنوز آیتمی انتخاب نشده است.'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    icon="list"
                    onClick={() => setItemsTarget(section)}
                  >
                    انتخاب محتوا
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="admin__head">
        <h2 className="admin-card__title">بنرها</h2>
        <div className="admin__actions">
          <Button icon="plus" onClick={() => setBannerModal({ banner: null })}>
            افزودن بنر
          </Button>
        </div>
      </div>

      {banners.loading ? (
        <LoadingRows count={3} />
      ) : banners.error ? (
        <ErrorState error={banners.error} onRetry={banners.reload} />
      ) : bannerItems.length === 0 ? (
        <p className="admin-note">هنوز بنری ثبت نشده است.</p>
      ) : (
        <div className="admin-list">
          {bannerItems.map((banner) => (
            <div className="admin-row" key={banner.id}>
              <div className="thumb-sm">
                {banner.image_url ? <img src={banner.image_url} alt="" loading="lazy" /> : null}
              </div>
              <div className="admin-row__main">
                <div className="admin-row__title">{banner.title_fa}</div>
                <div className="admin-row__meta">
                  {banner.subtitle || '—'} ·{' '}
                  {BANNER_PLACEMENT_OPTIONS.find((option) => option.value === banner.placement)
                    ?.label ?? banner.placement}
                  {' · ترتیب '}
                  {toFaDigits(banner.sort_order)}
                </div>
              </div>
              <Badge tone={banner.is_active ? 'success' : 'warning'}>
                {banner.is_active ? 'فعال' : 'غیرفعال'}
              </Badge>
              <div className="admin-row__actions">
                <Button
                  variant="outline"
                  size="sm"
                  icon="edit"
                  onClick={() => setBannerModal({ banner })}
                >
                  ویرایش
                </Button>
                <Button variant="danger" size="sm" icon="trash" onClick={() => removeBanner(banner)}>
                  حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {bannerModal ? (
        <BannerModal
          banner={bannerModal.banner}
          onClose={() => setBannerModal(null)}
          onSaved={() => {
            setBannerModal(null);
            banners.reload();
          }}
        />
      ) : null}

      {itemsTarget ? (
        <SectionItemsModal
          section={itemsTarget}
          onClose={() => setItemsTarget(null)}
          onSaved={() => {
            setItemsTarget(null);
            sections.reload();
          }}
        />
      ) : null}
    </>
  );
}
