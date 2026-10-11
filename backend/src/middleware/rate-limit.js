import rateLimit from 'express-rate-limit';

const json = (message) => ({
  error: { message, code: 429 },
});

/** Global ceiling — generous enough for browsing, blocks crude floods. */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('تعداد درخواست‌ها بیش از حد مجاز است.'),
});

/** Login / register / password reset — brute-force protection. */
export const authLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: json('تلاش‌های ناموفق زیاد بوده است. چند دقیقه بعد دوباره امتحان کنید.'),
});

/** Public read endpoints that hit heavier aggregate queries. */
export const readLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('تعداد درخواست‌ها بیش از حد مجاز است.'),
});
