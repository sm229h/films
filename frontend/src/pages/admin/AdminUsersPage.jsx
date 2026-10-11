import { useEffect, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAsync, useDebounced, useDocumentMeta } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/ui.jsx';
import { formatJalali, toFaDigits } from '../../lib/format.js';
import { AdminHeader, LoadingRows, Pagination, ROLE_LABEL } from './parts.jsx';
import './admin.css';

const PAGE_SIZE = 20;

const ROLE_OPTIONS = [
  { value: '', label: 'همه نقش‌ها' },
  { value: 'admin', label: 'مدیر اصلی' },
  { value: 'support', label: 'پشتیبان' },
  { value: 'user', label: 'کاربر' },
];
const STATE_OPTIONS = [
  { value: '', label: 'همه حساب‌ها' },
  { value: 'false', label: 'فعال' },
  { value: 'true', label: 'مسدود' },
];

export default function AdminUsersPage() {
  useDocumentMeta({ title: 'مدیریت کاربران' });
  const { isStrictAdmin, user: me } = useAuth();
  const toast = useToast();

  const [filters, setFilters] = useState({ q: '', role: '', blocked: '' });
  const [page, setPage] = useState(1);
  const q = useDebounced(filters.q, 400);
  const { role, blocked } = filters;

  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockError, setBlockError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [q, role, blocked]);

  const { data, loading, error, reload } = useAsync(
    () =>
      adminApi.users({
        q,
        role: role || undefined,
        blocked: blocked || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [q, role, blocked, page],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const changeRole = async (target, nextRole) => {
    if (nextRole === target.role) return;
    try {
      await adminApi.updateUser(target.id, { role: nextRole });
      toast.success(`نقش ${target.email} به «${ROLE_LABEL[nextRole]}» تغییر کرد.`);
      reload();
    } catch (roleError) {
      toast.error(roleError.message);
    }
  };

  const toggleBlock = async (target) => {
    if (target.is_blocked) {
      try {
        await adminApi.updateUser(target.id, { isBlocked: false, blockedReason: null });
        toast.success(`حساب ${target.email} از مسدودی خارج شد.`);
        reload();
      } catch (blockError2) {
        toast.error(blockError2.message);
      }
      return;
    }
    setBlockTarget(target);
    setBlockReason('');
    setBlockError('');
  };

  const submitBlock = async (event) => {
    event.preventDefault();
    setBlockError('');
    if (!blockReason.trim()) {
      setBlockError('ثبت دلیل مسدودسازی الزامی است.');
      return;
    }
    setBusy(true);
    try {
      await adminApi.updateUser(blockTarget.id, {
        isBlocked: true,
        blockedReason: blockReason.trim(),
      });
      toast.success(`حساب ${blockTarget.email} مسدود شد.`);
      setBlockTarget(null);
      reload();
    } catch (blockError2) {
      setBlockError(blockError2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="کاربران"
        description="نقش‌ها، وضعیت اشتراک و مسدودسازی حساب‌ها"
      />

      <div className="admin-card">
        <div className="admin-filters">
          <Input
            type="search"
            placeholder="جستجوی ایمیل یا نام…"
            aria-label="جستجوی کاربر"
            value={filters.q}
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
          <Select
            aria-label="نقش"
            options={ROLE_OPTIONS}
            value={filters.role}
            onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
          />
          <Select
            aria-label="وضعیت حساب"
            options={STATE_OPTIONS}
            value={filters.blocked}
            onChange={(event) => setFilters((prev) => ({ ...prev, blocked: event.target.value }))}
          />
        </div>
      </div>

      {loading ? (
        <LoadingRows count={6} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="users" title="کاربری یافت نشد" description="فیلترها را تغییر دهید." />
      ) : (
        <div className="admin-list">
          {items.map((item) => {
            const self = item.id === me.id;
            return (
              <div className="admin-row" key={item.id}>
                <div className="admin-row__main">
                  <div className="admin-row__title">{item.full_name || item.email}</div>
                  <div className="admin-row__meta">
                    <span dir="ltr">{item.email}</span>
                  </div>
                  <div className="admin-row__meta">
                    عضویت: {formatJalali(item.created_at) ?? '—'}
                    {item.subscription_ends_at
                      ? ` · اشتراک تا ${formatJalali(item.subscription_ends_at)}`
                      : ' · بدون اشتراک فعال'}
                  </div>
                </div>

                {item.is_blocked ? <Badge tone="danger">مسدود</Badge> : null}

                {isStrictAdmin ? (
                  <Select
                    aria-label={`نقش ${item.email}`}
                    className="admin-role-select"
                    options={[
                      { value: 'user', label: 'کاربر' },
                      { value: 'support', label: 'پشتیبان' },
                      { value: 'admin', label: 'مدیر اصلی' },
                    ]}
                    value={item.role}
                    disabled={self}
                    onChange={(event) => changeRole(item, event.target.value)}
                  />
                ) : (
                  <Badge tone={item.role === 'user' ? 'neutral' : 'accent'}>
                    {ROLE_LABEL[item.role] ?? item.role}
                  </Badge>
                )}

                <div className="admin-row__actions">
                  <Button
                    variant={item.is_blocked ? 'outline' : 'danger'}
                    size="sm"
                    icon={item.is_blocked ? 'check' : 'lock'}
                    disabled={self}
                    onClick={() => toggleBlock(item)}
                  >
                    {item.is_blocked ? 'رفع مسدودی' : 'مسدودسازی'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} busy={loading} />

      <Modal
        open={Boolean(blockTarget)}
        onClose={() => setBlockTarget(null)}
        title="مسدودسازی حساب"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockTarget(null)}>
              انصراف
            </Button>
            <Button variant="danger" loading={busy} onClick={submitBlock}>
              مسدود کن
            </Button>
          </>
        }
      >
        <form onSubmit={submitBlock} className="form-grid form-grid--wide">
          <p className="admin-note">
            با مسدودسازی، نشست‌های فعال کاربر بلافاصله بسته می‌شود.
          </p>
          <Field label="دلیل مسدودسازی" required>
            <Textarea
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="مثلاً: تخلف مکرر از قوانین استفاده"
            />
          </Field>
          <FormError>{blockError}</FormError>
        </form>
      </Modal>
    </>
  );
}
