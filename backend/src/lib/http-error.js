/** Application error carrying an HTTP status code and a client-safe message. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'برای دسترسی به این بخش باید وارد شوید.') =>
  new HttpError(401, message);
export const forbidden = (message = 'شما به این بخش دسترسی ندارید.') =>
  new HttpError(403, message);
export const notFound = (message = 'موردی یافت نشد.') => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
export const tooMany = (message = 'تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.') =>
  new HttpError(429, message);
