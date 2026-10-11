import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { catalogApi, libraryApi } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const SiteContext = createContext(null);

const FALLBACK = {
  subscriptionBannerEnabled: true,
  reviewsEnabled: true,
  features: { externalMetadata: false, streaming: true, realPayments: false },
};

/**
 * Public site configuration: branding overrides, feature flags and the
 * subscription banner switch. Anything the admin panel can turn off is read
 * from here so the UI never hard-codes a feature as always-on.
 */
export function SiteProvider({ children }) {
  const [site, setSite] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    catalogApi
      .site()
      .then((data) => {
        if (!cancelled && data) setSite({ ...FALLBACK, ...data });
      })
      .catch(() => {
        /* Keep defaults: the site must render even if /site is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      ...site,
      brand: {
        nameFa: site.brandNameFa || 'سینه‌ورس',
        nameEn: site.brandNameEn || 'CineVerse',
        tagline: site.brandTagline || '',
      },
    }),
    [site],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error('useSite must be used inside <SiteProvider>');
  return context;
}

/* ----------------------------------------------------------------- favorites */

const FavoritesContext = createContext(null);

/**
 * Keeps favourite ids in one place so every card reflects a toggle instantly.
 * The server remains the source of truth — this is a cache that is refreshed
 * whenever the signed-in user changes.
 */
export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(() => new Set());
  const [pending, setPending] = useState(() => new Set());

  const reload = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      return;
    }
    try {
      const result = await libraryApi.favorites();
      setIds(new Set((result?.items ?? []).map((item) => item.id)));
    } catch {
      /* non-fatal: the heart simply shows as not-favourited */
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(
    async (contentId) => {
      if (!user) return { requiresAuth: true };
      const isFavorite = ids.has(contentId);
      setPending((prev) => new Set(prev).add(contentId));
      try {
        if (isFavorite) await libraryApi.removeFavorite(contentId);
        else await libraryApi.addFavorite(contentId);
        setIds((prev) => {
          const next = new Set(prev);
          if (isFavorite) next.delete(contentId);
          else next.add(contentId);
          return next;
        });
        return { ok: true, favorited: !isFavorite };
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(contentId);
          return next;
        });
      }
    },
    [ids, user],
  );

  const value = useMemo(
    () => ({
      ids,
      has: (contentId) => ids.has(contentId),
      isPending: (contentId) => pending.has(contentId),
      toggle,
      reload,
    }),
    [ids, pending, toggle, reload],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return context;
}
