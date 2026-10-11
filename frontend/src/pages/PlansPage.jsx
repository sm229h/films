import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { billingApi, catalogApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  Notice,
  Spinner,
} from '../components/ui.jsx';
import { formatJalali, formatPrice, toFaDigits } from '../lib/format.js';
import './plans.css';

export default function PlansPage() {
  useDocumentMeta({
    title: 'پلن‌های اشتراک',
    description: 'پلن‌های اشتراک سینه‌ورس و امکان تماشای محتوای ویژه.',
  });

  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busyPlan, setBusyPlan] = useState(null);

  const plans = useAsync(() => catalogApi.plans(), []);
  const subscription = useAsync(
    () => (user ? billingApi.subscription() : Promise.resolve(null)),
    [user?.id],
  );

  const startCheckout = async (plan) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent('/plans')}`);
      return;
    }
    setBusyPlan(plan.id);
    try {
      const result = await billingApi.checkout(plan.id);
      if (result.gateway?.notice) toast.info(result.gateway.notice);
      navigate(result.callbackUrl);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyPlan(null);
    }
  };

  if (plans.error) {
    return (
      <div className="container page">
        <ErrorState error={plans.error} onRetry={plans.reload} />
      </div>
    );
  }

  const active = subscription.data?.active;
  const gateway = plans.data?.gateway;

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <h1 className="page-title">پلن‌های اشتراک</h1>
          <p className="page-subtitle">
            محتوای ویژه فقط برای مشترکان فعال قابل تماشا است؛ کنترل دسترسی در سرور انجام می‌شود.
          </p>
        </div>
      </div>

      {active ? (
        <Notice tone="success">
          اشتراک «{active.planName}» شما تا {formatJalali(active.endsAt)} فعال است. با خرید پلن
          جدید، اعتبار به انتهای اشتراک فعلی اضافه می‌شود.
        </Notice>
      ) : null}

      {gateway?.sandbox ? (
        <Notice tone="warning">
          <span>
            درگاه پرداخت واقعی در این نسخه پیکربندی نشده است. پرداخت‌ها در حالت آزمایشی ثبت
            می‌شوند و هیچ مبلغی از حساب شما کسر نمی‌شود. برای فعال‌سازی پرداخت واقعی، درگاه
            (مانند زرین‌پال یا آیدی‌پی) باید در متغیرهای محیطی سرور تنظیم شود.
          </span>
        </Notice>
      ) : null}

      {plans.loading ? (
        <div className="plans">
          <Spinner size={30} />
        </div>
      ) : !plans.data?.items?.length ? (
        <EmptyState
          icon="star"
          title="پلنی تعریف نشده است"
          description="هنوز پلن اشتراکی در سامانه ثبت نشده است."
        />
      ) : (
        <div className="plans">
          {plans.data.items.map((plan, index) => (
            <article
              key={plan.id}
              className={`plan ${index === 1 ? 'plan--featured' : ''}`}
            >
              {index === 1 ? (
                <span className="plan__ribbon">
                  <Icon name="star" size={12} />
                  پیشنهاد ویژه
                </span>
              ) : null}

              <h2 className="plan__name">{plan.name}</h2>
              {plan.description ? <p className="plan__desc">{plan.description}</p> : null}

              <p className="plan__price">
                <strong>{formatPrice(plan.priceToman)}</strong>
                <span className="dim">/ {toFaDigits(plan.durationDays)} روز</span>
              </p>

              <ul className="plan__features">
                {(plan.features ?? []).map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={16} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                block
                size="lg"
                variant={index === 1 ? 'primary' : 'outline'}
                loading={busyPlan === plan.id}
                onClick={() => startCheckout(plan)}
              >
                {user ? 'انتخاب و پرداخت' : 'ورود و انتخاب پلن'}
              </Button>
            </article>
          ))}
        </div>
      )}

      <section className="plans__faq">
        <h2 className="detail__section-title">پرسش‌های پرتکرار</h2>
        <dl className="faq">
          <div>
            <dt>آیا محتوای رایگان هم وجود دارد؟</dt>
            <dd>
              بله. بخشی از آثار با برچسب «رایگان» بدون اشتراک قابل تماشا هستند؛ بقیه ویژه
              مشترکان است.
            </dd>
          </div>
          <div>
            <dt>اگر اشتراکم تمام شود چه می‌شود؟</dt>
            <dd>
              دسترسی به محتوای ویژه متوقف می‌شود، اما حساب، علاقه‌مندی‌ها و پیشرفت تماشا باقی
              می‌ماند و با تمدید ادامه پیدا می‌کند.
            </dd>
          </div>
          <div>
            <dt>امکان لغو وجود دارد؟</dt>
            <dd>
              بله، از بخش <Link to="/profile?tab=subscription">اشتراک من</Link> می‌توانید تمدید
              را لغو کنید. دسترسی تا پایان دوره فعال می‌ماند.
            </dd>
          </div>
        </dl>
      </section>

      <p className="dim">
        <Badge tone="neutral">یادآوری</Badge> برای انتشار واقعی، اتصال به درگاه پرداخت دارای
        مجوز و تنظیم کلیدهای آن ضروری است؛ در حال حاضر تنها معماری و رابط کاربری آماده شده است.
      </p>
    </div>
  );
}
