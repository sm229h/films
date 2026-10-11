import { Link } from 'react-router-dom';
import { useDocumentMeta } from '../hooks/index.js';
import { useSite } from '../context/SiteContext.jsx';
import { Button, Notice } from '../components/ui.jsx';

export default function NotFoundPage() {
  useDocumentMeta({
    title: 'صفحه پیدا نشد (۴۰۴)',
    description: 'صفحه مورد نظر در سینه‌ورس وجود ندارد.',
  });

  return (
    <div className="container page">
      <div className="notfound">
        <p className="notfound__code">۴۰۴</p>
        <h1 className="notfound__title">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
        <p className="muted">
          ممکن است نشانی تغییر کرده باشد یا این صفحه حذف شده باشد.
        </p>
        <div className="notfound__actions">
          <Button to="/" icon="film">
            صفحه اصلی
          </Button>
          <Button to="/browse" variant="outline" icon="search">
            مرور کتابخانه
          </Button>
        </div>
      </div>
      <style>{`
        .notfound {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4);
          text-align: center;
          padding-block: var(--space-8);
        }
        .notfound__code {
          font-size: clamp(64px, 12vw, 120px);
          font-weight: 800;
          line-height: 1;
          color: var(--accent);
          opacity: 0.9;
        }
        .notfound__title {
          font-size: clamp(20px, 3vw, 28px);
        }
        .notfound__actions {
          display: flex;
          gap: var(--space-3);
          flex-wrap: wrap;
          justify-content: center;
          margin-top: var(--space-3);
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------- static pages -- */

function StaticShell({ title, children }) {
  return (
    <div className="container page">
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="prose">{children}</div>
      <style>{`
        .prose {
          max-width: 78ch;
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          line-height: 2;
          color: var(--text-muted);
        }
        .prose h2 {
          color: var(--text);
          font-size: 17px;
          margin-top: var(--space-3);
        }
        .prose p { font-size: 14.5px; }
        .prose ul { display: flex; flex-direction: column; gap: 6px; }
        .prose li { font-size: 14.5px; }
        .prose li::before { content: '•'; color: var(--accent); margin-inline-end: 8px; }
      `}</style>
    </div>
  );
}

export function AboutPage() {
  useDocumentMeta({
    title: 'درباره ما',
    description: 'درباره پلتفرم نمایش خانگی سینه‌ورس و امکانات آن.',
  });
  const site = useSite();

  return (
    <StaticShell title="درباره سینه‌ورس">
      <p>{site.footerAbout}</p>
      <h2>چه چیزی در این نسخه آماده است؟</h2>
      <ul>
        <li>کتابخانه محتوا با صفحه اختصاصی فیلم و سریال، فصل‌ها و قسمت‌ها</li>
        <li>جست‌وجوی فارسی و انگلیسی، فیلترهای کاربردی و مرتب‌سازی واقعی</li>
        <li>پلیر تحت وب با پشتیبانی HLS، انتخاب کیفیت، زیرنویس و ادامه تماشا</li>
        <li>حساب کاربری با نشست امن، فهرست علاقه‌مندی‌ها و تاریخچه تماشا</li>
        <li>پلن‌های اشتراک و کنترل دسترسی سمت سرور برای محتوای ویژه</li>
        <li>پنل مدیریت برای مدیریت محتوا، کاربران و چیدمان صفحه اصلی</li>
      </ul>
      <h2>چه چیزی هنوز نیاز به تنظیمات دارد؟</h2>
      <p>
        این نسخه با داده‌های نمونه اجرا می‌شود. برای انتشار واقعی، به سرویس اطلاعات فیلم دارای
        مجوز، منابع ویدئوی قانونی، فضای ذخیره‌سازی و پهنای باند، و درگاه پرداخت نیاز است. هیچ‌کدام
        از این موارد در این نسخه به‌صورت فعال و واقعی ارائه نشده‌اند.
      </p>
      <Notice tone="info">
        نام برند موقت است و از یک فایل تنظیمات مرکزی خوانده می‌شود؛ قابل تغییر از پنل مدیریت.
      </Notice>
    </StaticShell>
  );
}

export function ContactPage() {
  useDocumentMeta({
    title: 'تماس با ما',
    description: 'راه‌های ارتباطی با پشتیبانی سینه‌ورس.',
  });
  const site = useSite();

  return (
    <StaticShell title="تماس با ما">
      <p>برای پرسش‌ها، گزارش خطا یا پیشنهادها از راه‌های زیر با ما در ارتباط باشید.</p>
      <ul>
        <li>
          ایمیل پشتیبانی: <span className="ltr">{site.supportEmail}</span>
        </li>
        {site.supportPhone ? <li>تلفن: <span className="ltr">{site.supportPhone}</span></li> : null}
      </ul>
      <Notice tone="warning">
        فرم پیام‌رسان در این نسخه فعال نیست، زیرا سرویس ارسال ایمیل پیکربندی نشده است. برای فعال
        شدن آن باید سرویس ایمیل در متغیرهای محیطی تنظیم شود.
      </Notice>
    </StaticShell>
  );
}

export function TermsPage() {
  useDocumentMeta({
    title: 'قوانین استفاده',
    description: 'شرایط استفاده از سرویس سینه‌ورس.',
  });
  return (
    <StaticShell title="قوانین استفاده">
      <p>
        این متن یک نمونه است و باید پیش از انتشار واقعی توسط تیم حقوقی بازبینی و جایگزین شود.
      </p>
      <h2>۱. حساب کاربری</h2>
      <p>
        کاربر مسئول حفظ امنیت رمز عبور خود است. استفاده اشتراکی از یک حساب با تعداد دستگاه‌های
        مجاز در پلن انتخابی محدود است.
      </p>
      <h2>۲. محتوا و مالکیت معنوی</h2>
      <p>
        پخش تمام آثار باید بر پایه مجوز رسمی صورت گیرد. هیچ فایل یا منبعی بدون مجوز در سامانه
        منتشر نمی‌شود.
      </p>
      <h2>۳. اشتراک و پرداخت</h2>
      <p>
        پرداخت‌ها از طریق درگاه رسمی انجام می‌شود. در این نسخه درگاه واقعی فعال نیست و پرداخت‌ها
        در حالت آزمایشی ثبت می‌شوند.
      </p>
      <h2>۴. رفتار کاربران</h2>
      <p>ثبت نظر توهین‌آمیز یا غیرقانونی موجب محدودیت دسترسی خواهد شد.</p>
    </StaticShell>
  );
}

export function PrivacyPage() {
  useDocumentMeta({
    title: 'حریم خصوصی',
    description: 'نحوه نگهداری و استفاده از اطلاعات کاربران در سینه‌ورس.',
  });
  return (
    <StaticShell title="حریم خصوصی">
      <p>
        این متن یک نمونه است و پیش از انتشار واقعی باید با سیاست رسمی سازمان جایگزین شود.
      </p>
      <h2>اطلاعاتی که ذخیره می‌شود</h2>
      <ul>
        <li>ایمیل و نام نمایشی برای ورود و نمایش در بخش نظرات</li>
        <li>رمز عبور به‌صورت هش‌شده (هرگز به‌صورت متن ساده)</li>
        <li>فهرست علاقه‌مندی‌ها، پیشرفت تماشا و تاریخچه پخش برای ارائه «ادامه تماشا»</li>
        <li>نشست‌های فعال برای امکان خروج و ابطال دسترسی</li>
      </ul>
      <h2>اشتراک‌گذاری اطلاعات</h2>
      <p>
        اطلاعات کاربران بدون رضایت یا الزام قانونی با شخص ثالث به اشتراک گذاشته نمی‌شود. کلیدهای
        سرویس‌های بیرونی فقط در سرور نگهداری می‌شوند و هرگز به مرورگر فرستاده نمی‌شوند.
      </p>
      <h2>حذف اطلاعات</h2>
      <p>کاربر می‌تواند با درخواست از پشتیبانی، حذف حساب و اطلاعات مرتبط را پیگیری کند.</p>
    </StaticShell>
  );
}
