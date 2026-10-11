import { HttpError } from './http-error.js';

/**
 * Validates `payload` against a zod schema and throws a 400 with per-field
 * messages when it does not match.
 */
export function parse(schema, payload) {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));
  throw new HttpError(400, 'اطلاعات ارسالی معتبر نیست.', details);
}
