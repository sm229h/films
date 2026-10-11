/**
 * Thin fetch wrapper.
 *
 * - Development / single-origin deploy: same-origin (`/api/...` is proxied by
 *   the dev server / the production reverse proxy), so no CORS is required.
 * - Split deploy (static host + separate API): set `VITE_API_BASE_URL` at build
 *   time (e.g. `https://api.example.com`) and requests go there directly with
 *   `credentials: 'include'`. In that case the API must list the frontend
 *   origin in `CORS_ORIGINS` and use a cross-site cookie
 *   (`COOKIE_SAMESITE=none` + `COOKIE_SECURE=1`).
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const BASE = `${API_BASE_URL}/api/v1`;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => search.append(key, item));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, params, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}${toQuery(params)}`, {
      method,
      signal,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.', 0);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || 'خطایی رخ داد. لطفاً دوباره تلاش کنید.';
    throw new ApiError(message, response.status, payload?.error?.details);
  }

  return payload;
}

export const api = {
  get: (path, params, options) => request(path, { params, ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
};

/* ------------------------------------------------------------------ groups -- */

export const catalogApi = {
  home: () => api.get('/home'),
  site: () => api.get('/site'),
  list: (kind, params) => api.get(kind ? `/${kind}` : '/catalog', params),
  filters: () => api.get('/filters'),
  genres: () => api.get('/genres'),
  countries: () => api.get('/countries'),
  detail: (identifier) => api.get(`/titles/${identifier}`),
  search: (params) => api.get('/search', params),
  suggest: (q) => api.get('/search/suggest', { q }),
  searchPeople: (q) => api.get('/people/search', { q, pageSize: 12 }),
  person: (id) => api.get(`/people/${id}`),
  plans: () => api.get('/plans'),
};

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (payload) => api.post('/auth/login', payload),
  register: (payload) => api.post('/auth/register', payload),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (payload) => api.post('/auth/forgot-password', payload),
  resetPassword: (payload) => api.post('/auth/reset-password', payload),
  changePassword: (payload) => api.patch('/auth/password', payload),
  updateProfile: (payload) => api.patch('/users/me', payload),
};

export const libraryApi = {
  favorites: () => api.get('/favorites'),
  addFavorite: (contentId) => api.post('/favorites', { contentId }),
  removeFavorite: (contentId) => api.delete(`/favorites/${contentId}`),
  continueWatching: () => api.get('/watch-progress/continue'),
  progressFor: (contentId) => api.get(`/watch-progress/${contentId}`),
  saveProgress: (payload) => api.put('/watch-progress', payload),
  removeProgress: (contentId) => api.delete(`/watch-progress/${contentId}`),
  history: () => api.get('/history'),
  clearHistory: () => api.delete('/history'),
};

export const playbackApi = {
  manifest: (contentId, episodeId) =>
    api.get(`/playback/${contentId}`, episodeId ? { episodeId } : undefined),
  save: (payload) => api.post('/playback/progress', payload),
};

export const billingApi = {
  subscription: () => api.get('/subscriptions/me'),
  checkout: (planId) => api.post('/subscriptions/checkout', { planId }),
  verify: (authority) => api.post(`/payments/${authority}/verify`),
  payments: () => api.get('/payments/me'),
  cancel: () => api.post('/subscriptions/cancel'),
};

export const reviewsApi = {
  create: (contentId, payload) => api.post(`/reviews/${contentId}`, payload),
  remove: (contentId) => api.delete(`/reviews/${contentId}`),
};

export const adminApi = {
  stats: () => api.get('/admin/stats'),
  content: (params) => api.get('/admin/content', params),
  contentOne: (id) => api.get(`/admin/content/${id}`),
  createContent: (payload) => api.post('/admin/content', payload),
  updateContent: (id, payload) => api.patch(`/admin/content/${id}`, payload),
  deleteContent: (id) => api.delete(`/admin/content/${id}`),
  addSeason: (contentId, payload) => api.post(`/admin/content/${contentId}/seasons`, payload),
  deleteSeason: (id) => api.delete(`/admin/seasons/${id}`),
  addEpisode: (seasonId, payload) => api.post(`/admin/seasons/${seasonId}/episodes`, payload),
  deleteEpisode: (id) => api.delete(`/admin/episodes/${id}`),
  addSource: (contentId, payload) => api.post(`/admin/content/${contentId}/sources`, payload),
  deleteSource: (id) => api.delete(`/admin/sources/${id}`),
  genres: () => api.get('/admin/genres'),
  countries: () => api.get('/admin/countries'),
  people: (q) => api.get('/admin/people', { q }),
  addPerson: (payload) => api.post('/admin/people', payload),
  creditPerson: (contentId, payload) => api.post(`/admin/content/${contentId}/people`, payload),
  users: (params) => api.get('/admin/users', params),
  updateUser: (id, payload) => api.patch(`/admin/users/${id}`, payload),
  sections: () => api.get('/admin/homepage-sections'),
  updateSection: (id, payload) => api.patch(`/admin/homepage-sections/${id}`, payload),
  setSectionItems: (id, contentIds) =>
    api.put(`/admin/homepage-sections/${id}/items`, { contentIds }),
  banners: () => api.get('/admin/banners'),
  createBanner: (payload) => api.post('/admin/banners', payload),
  updateBanner: (id, payload) => api.patch(`/admin/banners/${id}`, payload),
  deleteBanner: (id) => api.delete(`/admin/banners/${id}`),
  settings: () => api.get('/admin/settings'),
  updateSettings: (payload) => api.patch('/admin/settings', payload),
  auditLogs: (params) => api.get('/admin/audit-logs', params),
  payments: (params) => api.get('/admin/payments', params),
};
