import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { billingApi } from '../lib/api.js';
import { useDocumentMeta } from '../hooks/index.js';
import { Button, EmptyState, Icon, Notice } from '../components/ui.jsx';
import { formatJalali } from '../lib/format.js';

/**
 * Payment result page.
 *
 * No real gateway is configured, so this page says so plainly and requires an
 * explicit click to simulate the callback. Nothing here ever claims a real
 * payment succeeded.
 */
export default function CheckoutResultPage() {
  useDocumentMeta({ title: 'نتیجه پرداخت' });
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const authority = searchParams.get('authority');

  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const verify = async () => {
    setStatus('loading');
    setError('');
    try {
      const response = await billingApi.verify(authority);
      setResult(response);
      setStatus('done');
    } catch (verifyError) {
      setError(verifyError.message);
      setStatus('error');
    }
  };

  if (!authority) {
    return (
      <div className="container page">
        <EmptyState
          icon="alert"
          title="اطلاعات پرداخت پیدا نشد"
          description="به نظر می‌رسد این صفحه بدون انجام فرآیند پرداخت باز شده است."
          action={
            <Button to="/plans" variant="outline">
              بازگشت به پلن‌ها
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container page">
      <div className="checkout">
        <h1 className="page-title">نتیجه پرداخت</h1>

        {status === 'done' && result ? (
          <>
            <Notice tone="success">
              پرداخت آزمایشی با موفقیت تأیید شد و اشتراک شما فعال گردید.
            </Notice>
            <div className="checkout__box">
              <div className="checkout__row">
                <span>وضعیت</span>
                <strong>فعال</strong>
              </div>
              <div className="checkout__row">
                <span>شروع</span>
                <strong>{formatJalali(result.subscription?.startsAt)}</strong>
              </div>
              <div className="checkout__row">
                <span>پایان</span>
                <strong>{formatJalali(result.subscription?.endsAt)}</strong>
              </div>
              <div className="checkout__row">
                <span>حالت درگاه</span>
                <strong>{result.sandbox ? 'آزمایشی (بدون کسر وجه)' : 'واقعی'}</strong>
              </div>
            </div>
            <div className="checkout__actions">
              <Button to="/profile?tab=subscription" icon="star">
                مشاهده اشتراک من
              </Button>
              <Button to="/browse" variant="outline">
                شروع تماشا
              </Button>
            </div>
          </>
        ) : (
          <>
            <Notice tone="warning">
              درگاه پرداخت واقعی در این نسخه پیکربندی نشده است. با کلیک روی دکمه زیر، فرآیند
              بازگشت از درگاه به‌صورت آزمایشی شبیه‌سازی می‌شود و هیچ مبلغی از حساب شما کسر
              نمی‌شود.
            </Notice>

            <div className="checkout__box">
              <div className="checkout__row">
                <span>شناسه پرداخت</span>
                <strong className="ltr">{authority}</strong>
              </div>
            </div>

            {error ? <Notice tone="warning">{error}</Notice> : null}

            <div className="checkout__actions">
              <Button size="lg" onClick={verify} loading={status === 'loading'} icon="check">
                تأیید پرداخت آزمایشی
              </Button>
              <Button variant="ghost" onClick={() => navigate('/plans')}>
                انصراف و بازگشت
              </Button>
            </div>
          </>
        )}

        <p className="dim checkout__note">
          <Icon name="info" size={14} /> این صفحه بخشی از معماری پرداخت است؛ برای عملیاتی شدن،
          پیاده‌سازی درگاه رسمی در <span className="ltr">backend/src/routes/billing.js</span>{' '}
          جایگزین حالت آزمایشی می‌شود. <Link to="/plans">مشاهده پلن‌ها</Link>
        </p>
      </div>
    </div>
  );
}


