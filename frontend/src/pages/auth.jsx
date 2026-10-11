import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { authApi } from '../lib/api.js';
import { useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, FormError, Input, Notice } from '../components/ui.jsx';
import './auth.css';

/* Shared shell: a centred card with the brand mark. */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth__card rise">
        <header className="auth__head">
          <h1 className="auth__title">{title}</h1>
          {subtitle ? <p className="auth__subtitle">{subtitle}</p> : null}
        </header>
        {children}
        {footer ? <footer className="auth__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function LoginPage() {
  useDocumentMeta({ title: 'ورود به حساب', description: 'ورود به حساب کاربری سینه‌ورس.' });
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const next = searchParams.get('next');

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form);
      toast.success(`خوش آمدید${user.fullName ? `، ${user.fullName}` : ''}!`);
      navigate(next && next.startsWith('/') ? next : '/', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="ورود به حساب"
      subtitle="برای تماشای محتوای ویژه و ثبت علاقه‌مندی‌ها وارد شوید."
      footer={
        <>
          حساب کاربری ندارید؟ <Link to="/register">ثبت‌نام کنید</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={onSubmit}>
        <FormError>{error}</FormError>

        <Field label="ایمیل" htmlFor="email" required>
          <Input
            id="email"
            className="ltr"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="رمز عبور" htmlFor="password" required>
          <Input
            id="password"
            className="ltr"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </Field>

        <div className="auth__row">
          <Link to="/forgot-password" className="auth__link">
            رمز عبور را فراموش کرده‌اید؟
          </Link>
        </div>

        <Button type="submit" size="lg" block loading={loading}>
          ورود
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  useDocumentMeta({ title: 'ساخت حساب کاربری', description: 'ثبت‌نام در سینه‌ورس.' });
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('رمز عبور و تکرار آن یکسان نیستند.');
      return;
    }
    if (form.password.length < 8) {
      setError('رمز عبور باید حداقل ۸ کاراکتر باشد.');
      return;
    }
    setLoading(true);
    try {
      await register({ email: form.email, password: form.password, fullName: form.fullName });
      toast.success('حساب شما ساخته شد.');
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="ساخت حساب کاربری"
      subtitle="با ساخت حساب می‌توانید علاقه‌مندی‌ها و ادامه تماشا را ذخیره کنید."
      footer={
        <>
          قبلاً ثبت‌نام کرده‌اید؟ <Link to="/login">وارد شوید</Link>
        </>
      }
    >
      <form className="auth__form" onSubmit={onSubmit}>
        <FormError>{error}</FormError>

        <Field label="نام نمایشی" hint="اختیاری — در بخش نظرات نمایش داده می‌شود.">
          <Input
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="مثلاً سارا"
            maxLength={120}
          />
        </Field>

        <Field label="ایمیل" required>
          <Input
            className="ltr"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
        </Field>

        <Field label="رمز عبور" hint="حداقل ۸ کاراکتر" required>
          <Input
            className="ltr"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </Field>

        <Field label="تکرار رمز عبور" required>
          <Input
            className="ltr"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(event) => setForm((prev) => ({ ...prev, confirm: event.target.value }))}
          />
        </Field>

        <Button type="submit" size="lg" block loading={loading}>
          ثبت‌نام
        </Button>

        <p className="auth__legal">
          با ثبت‌نام، <Link to="/terms">قوانین استفاده</Link> و{' '}
          <Link to="/privacy">حریم خصوصی</Link> را می‌پذیرید.
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  useDocumentMeta({ title: 'بازیابی رمز عبور' });
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [devToken, setDevToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const request = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authApi.forgotPassword({ email });
      setResult(response.message);
      if (response.devToken) setDevToken(response.devToken);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword({ token: devToken, password: newPassword });
      setDone(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="بازیابی رمز عبور"
      subtitle="نشانی ایمیل حساب خود را وارد کنید."
      footer={
        <>
          <Link to="/login">بازگشت به صفحه ورود</Link>
        </>
      }
    >
      {done ? (
        <Notice tone="success">
          رمز عبور شما تغییر کرد. حالا می‌توانید <Link to="/login">وارد شوید</Link>.
        </Notice>
      ) : (
        <form className="auth__form" onSubmit={reset}>
          <FormError>{error}</FormError>

          <Field label="ایمیل" required>
            <Input
              className="ltr"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          {!devToken ? (
            <Button type="button" size="lg" block loading={loading} onClick={request}>
              دریافت لینک بازیابی
            </Button>
          ) : null}

          {result ? <Notice tone="info">{result}</Notice> : null}

          {devToken ? (
            <>
              <Notice tone="warning">
                حالت توسعه: سرویس ارسال ایمیل پیکربندی نشده است، بنابراین توکن بازیابی مستقیماً
                نمایش داده می‌شود. پس از اتصال سرویس ایمیل، این بخش حذف می‌شود.
              </Notice>

              <Field label="رمز عبور جدید" hint="حداقل ۸ کاراکتر" required>
                <Input
                  className="ltr"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>

              <Button type="submit" size="lg" block loading={loading}>
                تغییر رمز عبور
              </Button>
            </>
          ) : null}
        </form>
      )}
    </AuthShell>
  );
}
