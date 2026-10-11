import { query } from '../db/pool.js';

/**
 * Defaults live in code so a fresh database still renders a complete site.
 * Anything stored in `site_settings` overrides them, which is what the admin
 * panel writes to.
 */
export const DEFAULT_SETTINGS = {
  brandNameFa: 'سینه‌ورس',
  brandNameEn: 'CineVerse',
  brandTagline: 'دنیای فیلم و سریال خارجی',
  supportEmail: 'support@example.com',
  supportPhone: '',
  subscriptionBannerEnabled: true,
  subscriptionBannerTitle: 'اشتراک ویژه سینه‌ورس',
  subscriptionBannerText:
    'دسترسی نامحدود به آرشیو کامل فیلم و سریال، کیفیت تا 4K و تماشای بدون تبلیغات.',
  reviewsEnabled: true,
  footerAbout:
    'سینه‌ورس یک پلتفرم نمایش خانگی برای تماشای آنلاین فیلم، سریال و مستندهای خارجی است.',
};

export async function getSettings() {
  const { rows } = await query('SELECT key, value FROM site_settings');
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(patch) {
  const entries = Object.entries(patch);
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  return getSettings();
}

/** The public subset consumed by the web client (branding, feature flags). */
export async function getPublicSiteInfo() {
  const settings = await getSettings();
  return {
    brandNameFa: settings.brandNameFa,
    brandNameEn: settings.brandNameEn,
    brandTagline: settings.brandTagline,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    subscriptionBannerEnabled: settings.subscriptionBannerEnabled,
    subscriptionBannerTitle: settings.subscriptionBannerTitle,
    subscriptionBannerText: settings.subscriptionBannerText,
    reviewsEnabled: settings.reviewsEnabled,
    footerAbout: settings.footerAbout,
    features: {
      // Explicitly surfaced so the UI never implies working infrastructure
      // that is not configured.
      externalMetadata: Boolean(process.env.TMDB_API_KEY),
      streaming: true,
      realPayments: false,
    },
  };
}
