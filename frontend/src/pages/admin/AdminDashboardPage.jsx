import { adminApi } from '../../lib/api.js';
import { useAsync, useDocumentMeta } from '../../hooks/index.js';
import { Badge, ErrorState, Icon, Skeleton } from '../../components/ui.jsx';
import {
  KIND_LABEL,
  PAYMENT_STATUS_LABEL,
  formatJalali,
  formatNumber,
  formatPrice,
  toFaDigits,
} from '../../lib/format.js';
import { AdminHeader, LoadingRows } from './parts.jsx';
import './admin.css';

const PAYMENT_TONE = { paid: 'success', pending: 'warning', failed: 'danger', canceled: 'neutral' };

function Stat({ icon, label, value, extra }) {
  return (
    <div className="stat">
      <span className="stat__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
      {extra ? <span className="stat__extra">{extra}</span> : null}
    </div>
  );
}

export default function AdminDashboardPage() {
  useDocumentMeta({ title: 'داشبورد مدیریت' });
  const { data, loading, error, reload } = useAsync(() => adminApi.stats(), []);

  if (error) {
    return (
      <>
        <AdminHeader title="داشبورد" description="نمای کلی وضعیت سامانه" />
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <AdminHeader title="داشبورد" description="نمای کلی وضعیت سامانه" />
        <div className="stat-grid">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="stat" key={index}>
              <Skeleton width={34} height={34} radius={6} />
              <Skeleton width="55%" height={22} />
              <Skeleton width="80%" height={12} />
            </div>
          ))}
        </div>
        <LoadingRows count={3} />
      </>
    );
  }

  const { users, content, subscriptions, payments, views, topContent, recentPayments } = data;

  const stats = [
    {
      icon: 'users',
      label: 'کاربران',
      value: toFaDigits(users.total),
      extra: `${toFaDigits(users.last_30_days)} کاربر تازه در ۳۰ روز گذشته`,
    },
    {
      icon: 'film',
      label: 'عنوان‌ها',
      value: toFaDigits(content.movies + content.series),
      extra: `${toFaDigits(content.movies)} فیلم · ${toFaDigits(content.series)} سریال`,
    },
    {
      icon: 'star',
      label: 'اشتراک‌های فعال',
      value: toFaDigits(subscriptions.active),
      extra: `${toFaDigits(subscriptions.canceled)} لغو‌شده`,
    },
    {
      icon: 'tag',
      label: 'درآمد کل',
      value: formatPrice(Number(payments.total_toman)),
      extra: `${formatPrice(Number(payments.last_30_days_toman))} در ۳۰ روز گذشته`,
    },
    {
      icon: 'eye',
      label: 'بازدید ثبت‌شده',
      value: formatNumber(views),
      extra: `${toFaDigits(content.drafts)} پیش‌نویس در انتظار انتشار`,
    },
  ];

  return (
    <>
      <AdminHeader title="داشبورد" description="نمای کلی وضعیت سامانه" />

      <div className="stat-grid">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>

      <div className="admin-grid-2">
        <section className="admin-card">
          <h2 className="admin-card__title">پربیننده‌ترین عنوان‌ها</h2>
          {topContent.length === 0 ? (
            <p className="admin-note">هنوز بازدیدی ثبت نشده است.</p>
          ) : (
            <div className="admin-list">
              {topContent.map((item) => (
                <div className="admin-row" key={item.id}>
                  <div className="thumb-sm">
                    {item.poster_url ? <img src={item.poster_url} alt="" loading="lazy" /> : null}
                  </div>
                  <div className="admin-row__main">
                    <div className="admin-row__title">{item.title_fa}</div>
                    <div className="admin-row__meta">
                      <span dir="ltr">{item.title_en}</span> · {KIND_LABEL[item.kind]}
                    </div>
                  </div>
                  <Badge tone="neutral">{toFaDigits(item.views)} بازدید</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-card">
          <h2 className="admin-card__title">آخرین پرداخت‌ها</h2>
          {recentPayments.length === 0 ? (
            <p className="admin-note">پرداختی ثبت نشده است.</p>
          ) : (
            <div className="admin-list">
              {recentPayments.map((payment) => (
                <div className="admin-row" key={payment.id}>
                  <div className="admin-row__main">
                    <div className="admin-row__title">{payment.email ?? 'کاربر حذف‌شده'}</div>
                    <div className="admin-row__meta">
                      {payment.plan_name ?? 'بدون طرح'} · {formatJalali(payment.created_at)}
                    </div>
                  </div>
                  <span className="admin-row__meta">{formatPrice(Number(payment.amount_toman))}</span>
                  <Badge tone={PAYMENT_TONE[payment.status] ?? 'neutral'}>
                    {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
