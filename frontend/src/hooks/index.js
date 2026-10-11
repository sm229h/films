import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and exposes {data, loading, error, reload}.
 * A new `key` (usually the request params serialised) triggers a refetch, and
 * in-flight responses for stale keys are discarded.
 */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, loading: immediate, error: null });
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (requestId.current === id) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (requestId.current === id) setState({ data: null, loading: false, error });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!immediate) return undefined;
    run();
    return () => {
      // Invalidate any pending response when inputs change or we unmount.
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run, setData: (data) => setState((p) => ({ ...p, data })) };
}

/** Debounces a fast-changing value (search input). */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Tracks a media query so layout decisions can be made in JS when needed. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);
    list.addEventListener('change', handler);
    setMatches(list.matches);
    return () => list.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Locks body scroll while a modal or mobile drawer is open. */
export function useBodyLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [locked]);
}

/**
 * Sets per-page <title>, description and Open Graph tags. A pragmatic SEO
 * approach for a client-rendered SPA — the crawler-visible shell is static and
 * per-route tags are injected here.
 */
export function useDocumentMeta({ title, description, image, type = 'website', canonical }) {
  useEffect(() => {
    const brand = 'سینه‌ورس';
    document.title = title ? `${title} | ${brand}` : `${brand} | تماشای آنلاین فیلم و سریال`;

    const setMeta = (selector, attr, value) => {
      if (!value) return;
      let tag = document.head.querySelector(selector);
      if (!tag) {
        tag = document.createElement('meta');
        const [key, val] = selector.replace(/[[\]']/g, '').split('=');
        tag.setAttribute(key.replace('meta', '').trim() || 'name', val);
        document.head.appendChild(tag);
      }
      tag.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:image"]', 'content', image);

    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical || window.location.pathname;
  }, [title, description, image, type, canonical]);
}
