import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'مسیر مورد نظر پیدا نشد.', code: 'not_found' } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, _next) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { message: error.message, code: error.status, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: { message: 'اطلاعات ارسالی معتبر نیست.', code: 400 },
    });
  }

  // Postgres constraint violations map to meaningful client errors.
  const pgMessages = {
    '23505': 'این مورد از قبل ثبت شده است.',
    '23503': 'ارجاع نامعتبر به یک رکورد دیگر.',
    '23514': 'مقدار ارسالی با محدودیت‌های پایگاه داده سازگار نیست.',
  };
  if (error.code && pgMessages[error.code]) {
    return res.status(409).json({ error: { message: pgMessages[error.code], code: 409 } });
  }

  console.error('[error]', error);
  return res.status(500).json({
    error: {
      message: 'خطای غیرمنتظره در سرور رخ داد.',
      code: 500,
      ...(config.env === 'development' ? { debug: error.message } : {}),
    },
  });
}
