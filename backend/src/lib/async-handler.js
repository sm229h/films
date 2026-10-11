/**
 * Wraps an async route handler so rejected promises reach the Express error
 * middleware instead of crashing the process.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
