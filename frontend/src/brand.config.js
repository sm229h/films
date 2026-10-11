/**
 * Central brand configuration.
 *
 * The visual identity (name, tagline, logo mark, accent colour) is defined here
 * and nowhere else. Admin-editable values from the API override the defaults at
 * runtime through `SiteContext`, so renaming the brand — or re-theming it — does
 * not require touching any component.
 */

export const BRAND = {
  nameFa: 'سینه‌ورس',
  nameEn: 'CineVerse',
  tagline: 'دنیای فیلم و سریال خارجی',
  /** Short mark drawn next to the wordmark. */
  mark: 'CV',
  /** Emoji-free inline SVG logo is generated from `mark` in <Logo />. */
  accent: '#e50914',
};

/** Keys a site setting may override, mapped to the brand field it feeds. */
export const THEME_TOKENS = {
  accent: '--accent',
  accentHover: '--accent-hover',
};

/** Applies the accent colour (and any future brand token) to the document. */
export function applyBrandTheme(brand) {
  const root = document.documentElement;
  root.style.setProperty('--accent', brand.accent || BRAND.accent);
  root.style.setProperty(
    '--accent-hover',
    brand.accentHover || brand.accent || BRAND.accent,
  );
}

/** Navigation is data-driven so the header stays a single source of truth. */
export const NAV_ITEMS = [
  { to: '/', label: 'صفحه اصلی', exact: true },
  { to: '/movies', label: 'فیلم‌ها' },
  { to: '/series', label: 'سریال‌ها' },
  { to: '/browse?genre=animation', label: 'انیمیشن‌ها' },
  { to: '/browse?genre=documentary', label: 'مستندها' },
  { to: '/browse', label: 'ژانرها' },
  { to: '/browse?sort=latest', label: 'تازه‌ترین آثار' },
  { to: '/browse?sort=popular', label: 'محبوب‌ترین‌ها' },
];
