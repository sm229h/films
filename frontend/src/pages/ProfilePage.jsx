import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { authApi, billingApi, libraryApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFavorites } from '../context/SiteContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ContentCard } from '../components/media.jsx';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Icon,
  Input,
  Modal,
  Notice,
  PosterSkeleton,
  Spinner,
} from '../components/ui.jsx';
import {
  PAYMENT_STATUS_LABEL,
  formatJalali,
  formatPrice,
  formatTime,
  toFaDigits,
} from '../lib/format.js';
import './profile.css';

const TABS = [
  { key: 'account', label: 'حساب کاربری', icon: 'user' },
  { key: 'favorites', label: 'علاقه‌مندی‌ها', icon: 'heart' },
  { key: 'continue', label: 'ادامه تماشا', icon: 'play' },
  { key: 'history', label: 'تاریخچه تماشا', icon: 'clock' },
  { key: 'subscription', label: 'اشتراک و پرداخت', icon: 'star' },
];

/* ---------------------------------------------------------------- account --- */

function AccountTab() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(user.fullName ?? '');
  const [savingName, setSavingName] = useState(false);

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async (event) => {
    event.preventDefault();
    setSavingName(true);
    try {
      await authApi.updateProfile({ fullName: fullName.trim() || null });
      await refresh();
      toast.success('نام نمایشی به‌روزرسانی شد.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    if (passwords.newPassword !== passwords.confirm) {
      setPasswordError('رمز عبور جدید و تکرار آن یکسان نیستند.');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast.success('رمز عبور تغییر کرد.');
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      refresh();
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="profile__grid">
      <section className="panel">
        <h2 className="panel__title">اطلاعات حساب</h2>
        <dl className="facts">
          <div className="facts__row">
            <dt>ایمیل</dt>
            <dd className="ltr">{user.email}</dd>
          </div>
          <div className="facts__row">
            <dt>نقش</dt>
            <dd>
              {user.role === 'admin'
                ? 'مدیر سامانه'
                : user.role === 'support'
                  ? 'پشتیبان'
                  : 'کاربر'}
            </dd>
          </div>
          <div className="facts__row">
            <dt>تاریخ عضویت</dt>
            <dd>{formatJalali(user.createdAt)}</dd>
          </div>
        </dl>

        <form className="stack" onSubmit={saveName} style={{ marginTop: 'var(--space-4)' }}>
          <Field label="نام نمایشی">
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} />
          </Field>
          <Button type="submit" variant="outline" loading={savingName}>
            ذخیره نام نمایشی
          </Button>
          <p className="dim">این نام در بخش نظرات و منوی حساب شما نمایش داده می‌شود.</p>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel__title">تغییر رمز عبور</h2>
        <form className="stack" onSubmit={changePassword}>
          <FormError>{passwordError}</FormError>
          <Field label="رمز عبور فعلی" required>
            <Input
              className="ltr"
              type="password"
              required
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))
              }
            />
          </Field>
          <Field label="رمز عبور جدید" hint="حداقل ۸ کاراکتر" required>
            <Input
              className="ltr"
              type="password"
              required
              minLength={8}
              value={passwords.newPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))
              }
            />
          </Field>
          <Field label="تکرار رمز عبور جدید" required>
            <Input
              className="ltr"
              type="password"
              required
              value={passwords.confirm}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, confirm: event.target.value }))
              }
            />
          </Field>
          <Button type="submit" loading={savingPassword} icon="lock">
            تغییر رمز عبور
          </Button>
          <p className="dim">
            با تغییر رمز، همه نشست‌های دیگر شما بسته می‌شود و فقط همین دستگاه وارد می‌ماند.
          </p>
        </form>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- favorites --- */

function FavoritesTab() {
  const { user } = useAuth();
  const favorites = useFavorites();
  const data = useAsync(() => libraryApi.favorites(), [user?.id, favorites.ids.size]);

  if (data.loading) {
    return (
      <div className="grid-cards">
        {Array.from({ length: 6 }, (_, index) => (
          <PosterSkeleton key={index} />
        ))}
      </div>
    );
  }
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  if (!data.data?.items?.length) {
    return (
      <EmptyState
        icon="heart"
        title="فهرست علاقه‌مندی‌ها خالی است"
        description="آثاری که دوست دارید را با زدن نماد قلب روی کارت‌ها ذخیره کنید."
        action={<Button to="/browse" variant="outline">مرور کتابخانه</Button>}
      />
    );
  }

  return (
    <div className="grid-cards">
      {data.data.items.map((item) => (
        <ContentCard key={`${item.kind}-${item.id}`} content={item} />
      ))}
    </div>
  );
}

/* --------------------------------------------------------- continue/history -- */

function ContinueTab() {
  const { user } = useAuth();
  const data = useAsync(() => libraryApi.continueWatching(), [user?.id]);

  if (data.loading) return <Spinner size={26} />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  if (!data.data?.items?.length) {
    return (
      <EmptyState
        icon="play"
        title="در حال تماشا موردی وجود ندارد"
        description="وقتی تماشای اثری را شروع کنید، اینجا برای ادامه نمایش داده می‌شود."
      />
    );
  }

  return (
    <div className="grid-cards">
      {data.data.items.map((item) => {
        const percent = item.duration_seconds
          ? Math.min(100, Math.round((item.position_seconds / item.duration_seconds) * 100))
          : null;
        return (
          <div key={`${item.id}-${item.episode_id ?? 'x'}`} className="continue-item">
            <ContentCard
              content={item}
              progress={{ position_seconds: item.position_seconds, duration_seconds: item.duration_seconds }}
            />
            {percent !== null ? (
              <p className="continue-item__meta">
                {toFaDigits(percent)}٪ تماشا شده
                {item.duration_seconds
                  ? ` • ${formatTime(item.position_seconds)} از ${formatTime(item.duration_seconds)}`
                  : ''}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab() {
  const { user } = useAuth();
  const toast = useToast();
  const data = useAsync(() => libraryApi.history(), [user?.id]);
  const [clearing, setClearing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const clear = async () => {
    setClearing(true);
    try {
      await libraryApi.clearHistory();
      toast.success('تاریخچه تماشا پاک شد.');
      setConfirmOpen(false);
      data.reload();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setClearing(false);
    }
  };

  if (data.loading) return <Spinner size={26} />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  if (!data.data?.items?.length) {
    return (
      <EmptyState
        icon="clock"
        title="تاریخچه‌ای ثبت نشده است"
        description="پس از تماشای هر اثر، سابقه آن در این بخش نمایش داده می‌شود."
      />
    );
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
        <p className="muted">{toFaDigits(data.data.items.length)} اثر تماشا شده</p>
        <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirmOpen(true)}>
          پاک کردن تاریخچه
        </Button>
      </div>
      <div className="grid-cards">
        {data.data.items.map((item) => (
          <ContentCard key={`${item.kind}-${item.id}`} content={item} />
        ))}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="پاک کردن تاریخچه تماشا"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              انصراف
            </Button>
            <Button variant="danger" loading={clearing} onClick={clear}>
              پاک کن
            </Button>
          </>
        }
      >
        <p>تاریخچه تماشای شما پاک می‌شود. این کار «ادامه تماشا» را نیز بازنشانی می‌کند.</p>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ subscription --- */

function SubscriptionTab() {
  const { user } = useAuth();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const subscription = useAsync(() => billingApi.subscription(), [user?.id, refreshing]);
  const payments = useAsync(() => billingApi.payments(), [user?.id, refreshing]);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancel = async () => {
    try {
      await billingApi.cancel();
      toast.success('اشتراک لغو شد.');
      setConfirmCancel(false);
      setRefreshing((prev) => !prev);
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (subscription.loading) return <Spinner size={26} />;
  if (subscription.error) return <ErrorState error={subscription.error} onRetry={subscription.reload} />;

  const active = subscription.data?.active;

  return (
    <div className="profile__grid">
      <section className="panel">
        <h2 className="panel__title">وضعیت اشتراک</h2>
        {active ? (
          <>
            <p className="subscription-active">
              <Badge tone="success">فعال</Badge>
              پلن «{active.planName}»
            </p>
            <dl className="facts">
              <div className="facts__row">
                <dt>شروع</dt>
                <dd>{formatJalali(active.startsAt)}</dd>
              </div>
              <div className="facts__row">
                <dt>پایان</dt>
                <dd>{formatJalali(active.endsAt)}</dd>
              </div>
            </dl>
            <div className="row-between" style={{ marginTop: 'var(--space-4)' }}>
              <Button to="/plans" variant="primary" icon="star">
                تمدید اشتراک
              </Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                لغو تمدید
              </Button>
            </div>
          </>
        ) : (
          <>
            <Notice tone="info">
              در حال حاضر اشتراک فعالی ندارید. با تهیه اشتراک به محتوای ویژه دسترسی پیدا می‌کنید.
            </Notice>
            <Button to="/plans" variant="primary" icon="star" style={{ marginTop: 'var(--space-4)' }}>
              مشاهده پلن‌ها
            </Button>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="panel__title">تاریخچه پرداخت</h2>
        {payments.loading ? (
          <Spinner size={22} />
        ) : payments.data?.items?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>پلن</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {payments.data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.planName || '—'}</td>
                    <td>{formatPrice(payment.amountToman)}</td>
                    <td>
                      <Badge tone={payment.status === 'paid' ? 'success' : 'warning'}>
                        {PAYMENT_STATUS_LABEL[payment.status] || payment.status}
                      </Badge>
                    </td>
                    <td>{formatJalali(payment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">تا کنون پرداختی ثبت نشده است.</p>
        )}
      </section>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="لغو اشتراک"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              انصراف
            </Button>
            <Button variant="danger" onClick={cancel}>
              لغو اشتراک
            </Button>
          </>
        }
      >
        <p>اشتراک شما لغو می‌شود. دسترسی شما تا پایان دوره فعلی ادامه خواهد داشت.</p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------- page --- */

export default function ProfilePage() {
  useDocumentMeta({ title: 'پروفایل من' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'account';

  return (
    <div className="container page">
      <header className="profile__head">
        <div className="profile__avatar" aria-hidden="true">
          {(user.fullName || user.email).trim().slice(0, 1)}
        </div>
        <div>
          <h1 className="page-title">{user.fullName || 'کاربر سینه‌ورس'}</h1>
          <p className="page-subtitle ltr">{user.email}</p>
        </div>
        <Button
          variant="outline"
          icon="logout"
          className="profile__logout"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          خروج از حساب
        </Button>
      </header>

      <nav className="tabs" role="tablist" aria-label="بخش‌های پروفایل">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tabs__item ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setSearchParams(tab.key === 'account' ? {} : { tab: tab.key })}
          >
            <Icon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="profile__panel">
        {activeTab === 'account' ? <AccountTab /> : null}
        {activeTab === 'favorites' ? <FavoritesTab /> : null}
        {activeTab === 'continue' ? <ContinueTab /> : null}
        {activeTab === 'history' ? <HistoryTab /> : null}
        {activeTab === 'subscription' ? <SubscriptionTab /> : null}
      </div>
    </div>
  );
}
