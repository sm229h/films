import { useEffect, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAsync, useDocumentMeta } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, ErrorState, Field, FormError, Input, Notice, Skeleton, Textarea } from '../../components/ui.jsx';
import { AdminHeader } from './parts.jsx';
import './admin.css';

const EMPTY = {
  brandNameFa: '',
  brandNameEn: '',
  brandTagline: '',
  supportEmail: '',
  supportPhone: '',
  footerAbout: '',
  subscriptionBannerEnabled: true,
  subscriptionBannerTitle: '',
  subscriptionBannerText: '',
  reviewsEnabled: true,
};

export default function AdminSettingsPage() {
  useDocumentMeta({ title: 'تنظیمات سایت' });
  const { isStrictAdmin } = useAuth();
  const toast = useToast();

  const { data, loading, error, reload } = useAsync(() => adminApi.settings(), []);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (data?.settings) setForm({ ...EMPTY, ...data.settings });
  }, [data]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!form.brandNameFa.trim() || !form.brandNameEn.trim()) {
      setFormError('نام فارسی و انگلیسی برند هر دو الزامی هستند.');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateSettings({
        ...form,
        brandNameFa: form.brandNameFa.trim(),
        brandNameEn: form.brandNameEn.trim(),
        supportEmail: form.supportEmail.trim(),
      });
      toast.success('تنظیمات ذخیره شد.');
      reload();
    } catch (saveError) {
      setFormError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminHeader title="تنظیمات سایت" description="برندینگ، پشتیبانی و ویژگی‌های عمومی" />

      {!isStrictAdmin ? (
        <Notice tone="warning" icon="lock">
          ذخیره تنظیمات فقط برای مدیر اصلی مجاز است؛ شما این بخش را فقط می‌بینید.
        </Notice>
      ) : null}

      {loading ? (
        <div className="admin-card">
          <Skeleton width="40%" height={18} />
          <div className="form-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} height={44} radius={10} />
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <form className="admin-card" onSubmit={onSubmit}>
          <h2 className="admin-card__title">برندینگ</h2>
          <div className="form-grid">
            <Field label="نام فارسی برند" required>
              <Input
                value={form.brandNameFa}
                onChange={(event) => setField('brandNameFa', event.target.value)}
                required
              />
            </Field>
            <Field label="نام انگلیسی برند" required>
              <Input
                dir="ltr"
                value={form.brandNameEn}
                onChange={(event) => setField('brandNameEn', event.target.value)}
                required
              />
            </Field>
            <Field label="شعار">
              <Input
                value={form.brandTagline}
                onChange={(event) => setField('brandTagline', event.target.value)}
              />
            </Field>
            <Field label="ایمیل پشتیبانی">
              <Input
                type="email"
                dir="ltr"
                value={form.supportEmail}
                onChange={(event) => setField('supportEmail', event.target.value)}
              />
            </Field>
            <Field label="تلفن پشتیبانی">
              <Input
                dir="ltr"
                value={form.supportPhone}
                onChange={(event) => setField('supportPhone', event.target.value)}
              />
            </Field>
          </div>

          <Field label="درباره در پابرگ">
            <Textarea
              rows={3}
              value={form.footerAbout}
              onChange={(event) => setField('footerAbout', event.target.value)}
            />
          </Field>

          <h2 className="admin-card__title">بنر اشتراک</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.subscriptionBannerEnabled}
              onChange={(event) => setField('subscriptionBannerEnabled', event.target.checked)}
            />
            نمایش بنر دعوت به اشتراک
          </label>
          <div className="form-grid">
            <Field label="عنوان بنر">
              <Input
                value={form.subscriptionBannerTitle}
                onChange={(event) => setField('subscriptionBannerTitle', event.target.value)}
              />
            </Field>
          </div>
          <Field label="متن بنر">
            <Textarea
              rows={2}
              value={form.subscriptionBannerText}
              onChange={(event) => setField('subscriptionBannerText', event.target.value)}
            />
          </Field>

          <h2 className="admin-card__title">ویژگی‌ها</h2>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.reviewsEnabled}
              onChange={(event) => setField('reviewsEnabled', event.target.checked)}
            />
            فعال بودن نظرات کاربران روی صفحه عنوان‌ها
          </label>

          <Notice tone="info">
            پرداخت واقعی و پخش از سرویس ابری در این نسخه پیکربندی نشده است؛ فرایند خرید در
            حالت آزمایشی اجرا می‌شود.
          </Notice>

          <FormError>{formError}</FormError>

          <div className="form-actions">
            <Button type="submit" loading={saving} disabled={!isStrictAdmin}>
              ذخیره تنظیمات
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
