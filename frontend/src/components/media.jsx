import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  formatRating,
  formatRuntime,
  formatSeasonCount,
  toFaDigits,
  titlePath,
  watchPath,
  KIND_LABEL,
} from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFavorites } from '../context/SiteContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Icon, IconButton, RatingBadge, Badge, Button, PosterSkeleton, Skeleton } from './ui.jsx';
import './media.css';

/* ------------------------------------------------------------------ poster -- */

/**
 * Poster image with a graceful fallback: if the image cannot be loaded (offline
 * preview, broken URL) a generated gradient placeholder carrying the title is
 * shown instead of a broken-image icon.
 */
export function Poster({ src, alt, title, className = '', sizes, priority = false }) {
  const [state, setState] = useState(src ? 'loading' : 'failed');

  useEffect(() => {
    setState(src ? 'loading' : 'failed');
  }, [src]);

  return (
    <div className={`poster ${className}`}>
      {state === 'loading' ? <span className="poster__placeholder" aria-hidden="true" /> : null}
      {state !== 'failed' && src ? (
        <img
          className={`poster__img ${state === 'loaded' ? 'is-loaded' : ''}`}
          src={src}
          alt={alt || title}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      ) : null}
      {state === 'failed' ? (
        <span className="poster__fallback" aria-hidden="true">
          <span className="poster__fallback-text ltr">{title || alt}</span>
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- content card -- */

export function ContentCard({ content, progress, className = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const favorites = useFavorites();
  const toast = useToast();

  const isFavorite = favorites.has(content.id);
  const to = titlePath(content);

  const onToggleFavorite = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const result = await favorites.toggle(content.id);
      if (result?.requiresAuth) {
        toast.info('برای افزودن به علاقه‌مندی‌ها وارد حساب خود شوید.');
        return;
      }
      toast.success(result.favorited ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها حذف شد.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const runtimeLabel =
    content.kind === 'movie'
      ? formatRuntime(content.runtime_minutes)
      : formatSeasonCount(content.season_count);

  const percent =
    progress && progress.duration_seconds
      ? Math.min(100, Math.round((progress.position_seconds / progress.duration_seconds) * 100))
      : null;

  return (
    <article className={`card ${className}`}>
      <Link to={to} className="card__link" aria-label={`${content.title_fa} (${content.title_en})`}>
        <Poster
          src={content.poster_url}
          alt={`پوستر ${content.title_fa}`}
          title={content.title_fa}
          className="card__poster"
          sizes="(max-width: 640px) 45vw, 200px"
        />

        <span className="card__scrim" aria-hidden="true" />

        <span className="card__badges">
          {content.quality ? <Badge tone="quality">{content.quality}</Badge> : null}
          {content.access === 'free' ? <Badge tone="success">رایگان</Badge> : null}
        </span>

        {percent !== null ? (
          <span className="card__progress" aria-label={`${toFaDigits(percent)}٪ تماشا شده`}>
            <span className="card__progress-bar" style={{ width: `${percent}%` }} />
          </span>
        ) : null}

        <span className="card__hover">
          <span className="card__hover-title">{content.title_fa}</span>
          <span className="card__hover-meta">
            <RatingBadge value={ratingOf(content)} />
            <span className="dim">{KIND_LABEL[content.kind]}</span>
          </span>
          <span className="card__hover-actions">
            <Button
              as="span"
              size="sm"
              icon="play"
              variant="secondary"
              className="card__play"
            >
              تماشا
            </Button>
          </span>
        </span>
      </Link>

      <button
        type="button"
        className={`card__fav ${isFavorite ? 'is-active' : ''}`}
        onClick={onToggleFavorite}
        disabled={favorites.isPending(content.id)}
        aria-label={isFavorite ? `حذف ${content.title_fa} از علاقه‌مندی‌ها` : `افزودن ${content.title_fa} به علاقه‌مندی‌ها`}
        aria-pressed={isFavorite}
        title={user ? 'افزودن به علاقه‌مندی‌ها' : 'برای افزودن وارد شوید'}
      >
        <Icon name="heart" size={16} className="card__fav-icon" />
      </button>

      <div className="card__meta">
        <Link to={to} className="card__title">
          {content.title_fa}
        </Link>
        <span className="card__sub ltr" title={content.title_en}>
          {content.title_en}
        </span>
        <div className="card__facts">
          {content.release_year ? <span>{toFaDigits(content.release_year)}</span> : null}
          {runtimeLabel ? <span>{runtimeLabel}</span> : null}
          <span className="card__rating">
            <RatingBadge value={ratingOf(content)} votes={content.rating_votes} />
          </span>
        </div>
      </div>
    </article>
  );
}

/** Series have no single rating column semantics beyond rating_value; keep it explicit. */
const ratingOf = (content) => content.rating_value ?? null;

/* --------------------------------------------------------------------- row -- */

export function ContentRow({ title, subtitle, items = [], progressById, viewAllTo, loading = false }) {
  const scrollerRef = useRef(null);

  const scrollBy = (direction) => {
    const node = scrollerRef.current;
    if (!node) return;
    // RTL: scrolling "forward" moves negative along the X axis.
    node.scrollBy({ left: direction * -(node.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="row-section">
      <header className="row-section__head">
        <div>
          <h2 className="row-section__title">{title}</h2>
          {subtitle ? <p className="row-section__subtitle">{subtitle}</p> : null}
        </div>
        <div className="row-section__tools">
          {viewAllTo ? (
            <Link to={viewAllTo} className="row-section__more">
              همه
              <Icon name="chevronLeft" size={16} />
            </Link>
          ) : null}
          <span className="row-section__arrows">
            <IconButton icon="chevronRight" label="بعدی" size="sm" onClick={() => scrollBy(-1)} />
            <IconButton icon="chevronLeft" label="قبلی" size="sm" onClick={() => scrollBy(1)} />
          </span>
        </div>
      </header>

      <div className="row-scroller" ref={scrollerRef} tabIndex={0} aria-label={`${title} — فهرست افقی`}>
        {loading
          ? Array.from({ length: 6 }, (_, index) => <PosterSkeleton key={index} />)
          : items.map((item) => (
              <ContentCard
                key={`${item.kind}-${item.id}`}
                content={item}
                progress={progressById?.[`${item.id}:${item.episode_id ?? 'x'}`]}
                className="row-scroller__item"
              />
            ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- hero slider -- */

const AUTOPLAY_MS = 9000;

/**
 * Cinematic hero slider. Manual controls always available; autoplay pauses on
 * hover/focus and is disabled entirely for users who prefer reduced motion.
 */
export function HeroSlider({ items = [], loading = false }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const toast = useToast();
  const favorites = useFavorites();
  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const count = items.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (paused || reduceMotion || count <= 1) return undefined;
    const timer = setTimeout(() => setIndex((prev) => (prev + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduceMotion, count]);

  const go = useCallback(
    (delta) => setIndex((prev) => (prev + delta + count) % count),
    [count],
  );

  if (loading) {
    return (
      <section className="hero hero--loading">
        <div className="hero__inner container">
          <Skeleton width="120px" height={18} />
          <Skeleton width="min(420px, 70vw)" height={48} />
          <Skeleton width="min(560px, 80vw)" height={20} />
          <Skeleton width="min(560px, 80vw)" height={20} />
          <Skeleton width="260px" height={44} />
        </div>
      </section>
    );
  }

  if (!count) return null;

  const active = items[index];
  const meta = [
    active.release_year ? toFaDigits(active.release_year) : null,
    active.kind === 'movie'
      ? formatRuntime(active.runtime_minutes)
      : formatSeasonCount(active.season_count),
    (active.genres || []).slice(0, 3).map((genre) => genre.nameFa).join(' • ') || null,
  ].filter(Boolean);

  const onFavorite = async () => {
    try {
      const result = await favorites.toggle(active.id);
      if (result?.requiresAuth) {
        toast.info('برای افزودن به علاقه‌مندی‌ها وارد حساب خود شوید.');
        return;
      }
      toast.success(result.favorited ? 'به علاقه‌مندی‌ها اضافه شد.' : 'از علاقه‌مندی‌ها حذف شد.');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="اسلایدر"
      aria-label="آثار منتخب"
    >
      {items.map((item, itemIndex) => (
        <div
          key={item.id}
          className={`hero__slide ${itemIndex === index ? 'is-active' : ''}`}
          aria-hidden={itemIndex !== index}
        >
          <Poster
            src={item.backdrop_url}
            alt=""
            title={item.title_fa}
            className="hero__backdrop"
            priority={itemIndex === 0}
            sizes="100vw"
          />
        </div>
      ))}

      <div className="hero__gradient" aria-hidden="true" />

      <div className="hero__inner container">
        <div className="hero__badges">
          {active.quality ? <Badge tone="quality">{active.quality}</Badge> : null}
          {active.access === 'free' ? <Badge tone="success">رایگان</Badge> : null}
          {active.age_rating ? <Badge tone="neutral">{active.age_rating}</Badge> : null}
          <Badge tone="accent">
            <Icon name={active.kind === 'series' ? 'list' : 'film'} size={12} />
            {KIND_LABEL[active.kind]}
          </Badge>
        </div>

        <h1 className="hero__title">{active.title_fa}</h1>
        <p className="hero__original ltr">{active.title_en}</p>

        <div className="hero__meta">
          <RatingBadge value={active.rating_value} votes={active.rating_votes} />
          {meta.map((entry) => (
            <span key={entry} className="hero__meta-item">
              {entry}
            </span>
          ))}
        </div>

        <p className="hero__synopsis">{active.synopsis_short}</p>

        <div className="hero__actions">
          <Button to={watchPath(active)} size="lg" icon="play">
            تماشای فیلم
          </Button>
          <Button to={titlePath(active)} size="lg" variant="outline" icon="info">
            مشاهده جزئیات
          </Button>
          <IconButton
            icon="heart"
            label="افزودن به علاقه‌مندی‌ها"
            variant="solid"
            className={favorites.has(active.id) ? 'is-active' : ''}
            onClick={onFavorite}
          />
        </div>
      </div>

      {count > 1 ? (
        <div className="hero__controls container">
          <div className="hero__dots" role="tablist" aria-label="انتخاب اسلاید">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={itemIndex === index}
                aria-label={`${item.title_fa}`}
                className={`hero__dot ${itemIndex === index ? 'is-active' : ''}`}
                onClick={() => setIndex(itemIndex)}
              >
                <span className="hero__dot-fill" />
              </button>
            ))}
          </div>
          <div className="hero__arrows">
            <IconButton icon="chevronRight" label="اسلاید قبلی" variant="solid" onClick={() => go(-1)} />
            <IconButton icon="chevronLeft" label="اسلاید بعدی" variant="solid" onClick={() => go(1)} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------- genre chips -- */

export function GenreChips({ genres = [], activeSlug, onSelect, allLabel = 'همه ژانرها' }) {
  return (
    <div className="chips" role="group" aria-label="فیلتر ژانر">
      <button
        type="button"
        className={`chip ${!activeSlug ? 'is-active' : ''}`}
        onClick={() => onSelect?.('')}
      >
        {allLabel}
      </button>
      {genres.map((genre) => (
        <button
          key={genre.slug}
          type="button"
          className={`chip ${activeSlug === genre.slug ? 'is-active' : ''}`}
          onClick={() => onSelect?.(genre.slug)}
          aria-pressed={activeSlug === genre.slug}
        >
          {genre.name_fa}
        </button>
      ))}
    </div>
  );
}
