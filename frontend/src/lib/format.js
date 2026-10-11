/** Formatting helpers shared by every card, detail page and admin table. */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Converts Latin digits to Persian digits for display. */
export const toFaDigits = (value) =>
  String(value ?? '').replace(/[0-9]/g, (digit) => FA_DIGITS[Number(digit)]);

export const formatNumber = (value) =>
  value === null || value === undefined ? '—' : toFaDigits(Number(value).toLocaleString('en-US'));

export const formatRating = (value) =>
  value === null || value === undefined ? null : toFaDigits(Number(value).toFixed(1));

export const formatPrice = (toman) => `${formatNumber(toman)} تومان`;

/** 148 → "۲ ساعت و ۲۸ دقیقه" */
export function formatRuntime(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${toFaDigits(rest)} دقیقه`;
  if (!rest) return `${toFaDigits(hours)} ساعت`;
  return `${toFaDigits(hours)} ساعت و ${toFaDigits(rest)} دقیقه`;
}

export const formatSeasonCount = (count) =>
  count ? `${toFaDigits(count)} فصل` : null;

/** 3725 → "۱:۰۲:۰۵" */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '۰:۰۰';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return toFaDigits(h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`);
}

const FA_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** Gregorian date → Persian (Jalali) date string. */
export function formatJalali(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return toFaDigits(date.toISOString().slice(0, 10));
  }
}

export const faMonths = FA_MONTHS;

export const KIND_LABEL = { movie: 'فیلم', series: 'سریال' };

export const ACCESS_LABEL = { free: 'رایگان', premium: 'ویژه' };

export const PAYMENT_STATUS_LABEL = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  failed: 'ناموفق',
  canceled: 'لغو‌شده',
};

/** Builds the canonical detail route for a title. */
export const titlePath = (content) =>
  `/${content.kind === 'series' ? 'series' : 'movies'}/${content.slug}`;

export const watchPath = (content, episodeId) =>
  `/watch/${content.id}${episodeId ? `?episode=${episodeId}` : ''}`;

/** Persian plural-aware label for a number of results. */
export const resultsLabel = (count) =>
  count ? `${formatNumber(count)} نتیجه` : 'نتیجه‌ای یافت نشد';
