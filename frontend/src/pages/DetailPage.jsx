import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';

import { catalogApi, libraryApi, reviewsApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useFavorites, useSite } from '../context/SiteContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  ACCESS_LABEL,
  KIND_LABEL,
  formatNumber,
  formatRating,
  formatRuntime,
  formatJalali,
  formatTime,
  toFaDigits,
  watchPath,
} from '../lib/format.js';
import { ContentRow, Poster } from '../components/media.jsx';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Modal,
  Notice,
  RatingBadge,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui.jsx';
import './detail.css';

/* --------------------------------------------------------------- sub-blocks -- */

function CastList({ cast = [], crew = [] }) {
  const directors = crew.filter((person) => person.role === 'director');
  if (!cast.length && !directors.length) return null;

  return (
    <section className="detail__section">
      <h2 className="detail__section-title">عوامل و بازیگران</h2>

      {directors.length ? (
        <p className="detail__crew">
          <span className="detail__crew-label">کارگردان:</span>
          {directors.map((person, index) => (
            <span key={person.id}>
              <Link to={`/person/${person.id}`} className="detail__crew-link">
                {person.name_fa || person.name_en}
              </Link>
              {index < directors.length - 1 ? '، ' : ''}
            </span>
          ))}
        </p>
      ) : null}

      {cast.length ? (
        <div className="cast">
          {cast.map((person) => (
            <Link key={person.id} to={`/person/${person.id}`} className="cast__item">
              <span className="cast__photo">
                {person.photo_url ? <img src={person.photo_url} alt="" loading="lazy" /> : null}
              </span>
              <span className="cast__name">{person.name_fa || person.name_en}</span>
              {person.character_name ? (
                <span className="cast__role">{person.character_name}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EpisodesSection({ content, seasons = [], progressList = [], onWatch }) {
  const [openSeason, setOpenSeason] = useState(seasons[0]?.season_number ?? null);

  useEffect(() => {
    setOpenSeason(seasons[0]?.season_number ?? null);
  }, [seasons]);

  if (!seasons.length) {
    return (
      <section className="detail__section">
        <h2 className="detail__section-title">فصل‌ها و قسمت‌ها</h2>
        <EmptyState
          icon="list"
          title="هنوز قسمتی ثبت نشده است"
          description="برای این سریال هنوز اطلاعات فصل و قسمت در سامانه وارد نشده است."
        />
      </section>
    );
  }

  const progressByEpisode = Object.fromEntries(
    progressList.filter((item) => item.episode_id).map((item) => [item.episode_id, item]),
  );

  return (
    <section className="detail__section">
      <h2 className="detail__section-title">فصل‌ها و قسمت‌ها</h2>

      <div className="seasons">
        {seasons.map((season) => {
          const isOpen = openSeason === season.season_number;
          const episodes = season.episodes ?? [];
          return (
            <div key={season.id} className={`season ${isOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="season__head"
                onClick={() => setOpenSeason(isOpen ? null : season.season_number)}
                aria-expanded={isOpen}
              >
                <span className="season__title">
                  <Icon name="list" size={18} />
                  {season.title_fa || `فصل ${season.season_number}`}
                </span>
                <span className="season__meta">
                  {season.air_year ? <span>{toFaDigits(season.air_year)}</span> : null}
                  <span>{toFaDigits(episodes.length)} قسمت</span>
                  <Icon name="chevronDown" size={18} className="season__chevron" />
                </span>
              </button>

              {isOpen ? (
                <ol className="episodes">
                  {episodes.map((episode) => {
                    const progress = progressByEpisode[episode.id];
                    const percent =
                      progress?.duration_seconds
                        ? Math.min(
                            100,
                            Math.round(
                              (progress.position_seconds / progress.duration_seconds) * 100,
                            ),
                          )
                        : null;
                    return (
                      <li key={episode.id} className="episode">
                        <button
                          type="button"
                          className="episode__main"
                          onClick={() => onWatch(episode.id)}
                        >
                          <span className="episode__index">
                            {toFaDigits(episode.episode_number)}
                          </span>
                          <span className="episode__still">
                            {episode.still_url ? (
                              <img src={episode.still_url} alt="" loading="lazy" />
                            ) : null}
                            <span className="episode__play">
                              <Icon name="play" size={16} />
                            </span>
                            {percent !== null ? (
                              <span className="episode__progress">
                                <span style={{ width: `${percent}%` }} />
                              </span>
                            ) : null}
                          </span>
                          <span className="episode__text">
                            <strong>{episode.title_fa}</strong>
                            {episode.synopsis ? <span>{episode.synopsis}</span> : null}
                            <span className="episode__facts">
                              {episode.runtime_minutes
                                ? formatRuntime(episode.runtime_minutes)
                                : null}
                              {episode.air_date ? ` • ${formatJalali(episode.air_date)}` : ''}
                              {percent !== null ? ` • ${toFaDigits(percent)}٪ تماشا شده` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="dim">
        وضعیت انتشار: همه فصل‌های ثبت‌شده در سامانه منتشر شده‌اند. قسمت‌های منتشرنشده نمایش
        داده نمی‌شوند. {content.end_year ? `پایان پخش: ${toFaDigits(content.end_year)}` : ''}
      </p>
    </section>
  );
}

function ReviewsSection({ content, reviews = [], onChanged }) {
  const site = useSite();
  const { user } = useAuth();
  const toast = useToast();
  const [rating, setRating] = useState(8);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const mine = reviews.find((review) => review.email === user?.email);

  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment ?? '');
    }
  }, [mine]);

  if (!site.reviewsEnabled) {
    return (
      <section className="detail__section">
        <h2 className="detail__section-title">امتیاز و نظر کاربران</h2>
        <Notice tone="info">بخش نظرات توسط مدیر سایت غیرفعال شده است.</Notice>
      </section>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await reviewsApi.create(content.id, { rating, comment });
      toast.success('امتیاز و نظر شما ثبت شد.');
      onChanged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await reviewsApi.remove(content.id);
      setComment('');
      toast.success('نظر شما حذف شد.');
      onChanged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="detail__section" id="reviews">
      <h2 className="detail__section-title">
        امتیاز و نظر کاربران
        {reviews.length ? <span className="dim"> ({toFaDigits(reviews.length)} نظر)</span> : null}
      </h2>

      {user ? (
        <form className="review-form" onSubmit={submit}>
          <div className="review-form__row">
            <Field label="امتیاز شما (۱ تا ۱۰)">
              <Select
                value={String(rating)}
                onChange={(event) => setRating(Number(event.target.value))}
                options={Array.from({ length: 10 }, (_, index) => ({
                  value: String(10 - index),
                  label: toFaDigits(10 - index),
                }))}
              />
            </Field>
            <Field label="متن نظر (اختیاری)" htmlFor="review-comment">
              <Textarea
                id="review-comment"
                value={comment}
                maxLength={2000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="تجربه تماشای خود را بنویسید…"
              />
            </Field>
          </div>
          <div className="review-form__actions">
            <Button type="submit" loading={saving} icon="check">
              {mine ? 'به‌روزرسانی نظر' : 'ثبت نظر'}
            </Button>
            {mine ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={saving}>
                حذف نظر من
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <Notice tone="info">
          برای ثبت امتیاز و نظر <Link to="/login">وارد حساب خود شوید</Link>.
        </Notice>
      )}

      {reviews.length ? (
        <ul className="reviews">
          {reviews.map((review, index) => (
            <li key={`${review.created_at}-${index}`} className="review">
              <div className="review__head">
                <span className="review__author">{review.full_name || 'کاربر سینه‌ورس'}</span>
                <RatingBadge value={review.rating} />
                <span className="dim">{formatJalali(review.created_at)}</span>
              </div>
              {review.comment ? <p className="review__text">{review.comment}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">هنوز نظری ثبت نشده است؛ اولین نفر باشید.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------- page --- */

export default function DetailPage({ expectKind }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const favorites = useFavorites();
  const toast = useToast();
  const [trailerOpen, setTrailerOpen] = useState(false);

  const detail = useAsync(() => catalogApi.detail(slug), [slug]);
  const progress = useAsync(
    () =>
      user && detail.data?.content?.id
        ? libraryApi.progressFor(detail.data.content.id)
        : Promise.resolve(null),
    [user?.id, detail.data?.content?.id],
  );

  const content = detail.data?.content;

  useDocumentMeta({
    title: content ? `${content.title_fa} (${content.title_en})` : 'جزئیات اثر',
    description: content?.synopsis_short || content?.synopsis_full,
    image: content?.backdrop_url,
    type: content?.kind === 'series' ? 'video.tv_show' : 'video.movie',
  });

  const resume = useMemo(() => {
    const items = progress.data?.items ?? [];
    const movieProgress = items.find((item) => !item.episode_id);
    if (!movieProgress || movieProgress.completed) return null;
    return movieProgress;
  }, [progress.data]);

  if (detail.error) {
    return (
      <div className="container page">
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </div>
    );
  }

  if (detail.loading) {
    return (
      <div className="container page">
        <div className="detail-skeleton">
          <Skeleton width="100%" height={280} radius={16} />
          <Skeleton width="220px" height={30} />
          <Skeleton width="min(520px, 80%)" height={18} />
          <Skeleton width="min(520px, 80%)" height={18} />
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="container page">
        <EmptyState
          icon="alert"
          title="اثر پیدا نشد"
          description="ممکن است این عنوان حذف شده یا آدرس اشتباه باشد."
          action={<Button to="/browse" variant="outline">بازگشت به کتابخانه</Button>}
        />
      </div>
    );
  }

  // Keep canonical URLs: /movies/… for films, /series/… for shows.
  if (expectKind && content.kind !== expectKind) {
    return <Navigate to={`/${content.kind === 'series' ? 'series' : 'movies'}/${content.slug}`} replace />;
  }

  const facts = [
    { label: 'سال انتشار', value: content.release_year ? toFaDigits(content.release_year) : null },
    { label: 'کشور سازنده', value: content.country_fa },
    { label: 'زبان اصلی', value: content.original_language },
    content.kind === 'movie'
      ? { label: 'مدت زمان', value: formatRuntime(content.runtime_minutes) }
      : { label: 'تعداد فصل', value: detail.data.seasons.length ? toFaDigits(detail.data.seasons.length) : null },
    { label: 'رده‌بندی سنی', value: content.age_rating },
    { label: 'کیفیت', value: content.quality },
    { label: 'دسترسی', value: ACCESS_LABEL[content.access] },
  ].filter((fact) => fact.value);

  const firstEpisodeId = detail.data.seasons[0]?.episodes?.[0]?.id ?? null;
  const resumeEpisode = (progress.data?.items ?? []).find(
    (item) => item.episode_id && !item.completed,
  )?.episode_id;

  const watchTarget = watchPath(content, resumeEpisode || firstEpisodeId);

  const onFavorite = async () => {
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

  return (
    <article className="detail">
      <header className="detail__hero">
        <div className="detail__backdrop">
          <Poster src={content.backdrop_url} alt="" title={content.title_fa} priority />
        </div>
        <div className="detail__hero-gradient" aria-hidden="true" />

        <div className="detail__hero-inner container">
          <div className="detail__poster">
            <Poster src={content.poster_url} alt={`پوستر ${content.title_fa}`} title={content.title_fa} />
          </div>

          <div className="detail__intro">
            <div className="detail__badges">
              <Badge tone="accent">
                <Icon name={content.kind === 'series' ? 'list' : 'film'} size={12} />
                {KIND_LABEL[content.kind]}
              </Badge>
              {content.quality ? <Badge tone="quality">{content.quality}</Badge> : null}
              {content.access === 'free' ? <Badge tone="success">رایگان</Badge> : null}
              {content.age_rating ? <Badge tone="neutral">{content.age_rating}</Badge> : null}
            </div>

            <h1 className="detail__title">{content.title_fa}</h1>
            <p className="detail__original ltr">{content.title_en}</p>

            <div className="detail__meta">
              <RatingBadge value={content.rating_value} votes={content.rating_votes} />
              {content.rating_source ? (
                <span className="dim">منبع امتیاز: {content.rating_source}</span>
              ) : null}
              {content.rating_votes ? (
                <span className="dim">{formatNumber(content.rating_votes)} رأی</span>
              ) : null}
            </div>

            <div className="detail__genres">
              {(content.genres ?? []).map((genre) => (
                <Link key={genre.slug} to={`/browse?genre=${genre.slug}`} className="chip">
                  {genre.nameFa}
                </Link>
              ))}
            </div>

            <div className="detail__actions">
              <Button to={watchTarget} size="lg" icon="play">
                {resume ? `ادامه تماشا (${formatTime(resume.position_seconds)})` : 'تماشای آنلاین'}
              </Button>
              <Button
                size="lg"
                variant="outline"
                icon={favorites.has(content.id) ? 'check' : 'plus'}
                onClick={onFavorite}
                disabled={favorites.isPending(content.id)}
              >
                {favorites.has(content.id) ? 'در فهرست من' : 'افزودن به فهرست'}
              </Button>
              {content.trailer_url ? (
                <Button size="lg" variant="ghost" icon="play" onClick={() => setTrailerOpen(true)}>
                  تریلر
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="container detail__body">
        {content.access === 'premium' && !user ? (
          <Notice tone="warning">
            این اثر ویژه مشترکان است. پس از ورود و تهیه اشتراک قابل تماشا خواهد بود.
          </Notice>
        ) : null}

        <section className="detail__section">
          <h2 className="detail__section-title">خلاصه داستان</h2>
          <p className="detail__synopsis">{content.synopsis_full || content.synopsis_short}</p>
          {!content.synopsis_full ? (
            <p className="dim">خلاصه کامل این اثر در سامانه ثبت نشده است.</p>
          ) : null}
        </section>

        <section className="detail__section">
          <h2 className="detail__section-title">اطلاعات اثر</h2>
          <dl className="facts">
            {facts.map((fact) => (
              <div key={fact.label} className="facts__row">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <CastList cast={detail.data.cast} crew={detail.data.crew} />

        {content.kind === 'series' ? (
          <EpisodesSection
            content={content}
            seasons={detail.data.seasons}
            progressList={progress.data?.items ?? []}
            onWatch={(episodeId) => navigate(watchPath(content, episodeId))}
          />
        ) : null}

        <ReviewsSection
          content={content}
          reviews={detail.data.reviews}
          onChanged={() => {
            detail.reload();
            progress.reload();
          }}
        />

        {detail.data.similar?.length ? (
          <ContentRow title="آثار مشابه" items={detail.data.similar} />
        ) : null}
      </div>

      <Modal
        open={trailerOpen}
        onClose={() => setTrailerOpen(false)}
        title={`تریلر ${content.title_fa}`}
        size="lg"
      >
        <div className="trailer">
          {/* The sample trailer is a public placeholder video, not the real film. */}
          <video src={content.trailer_url} controls playsInline className="trailer__video" />
          <Notice tone="info">
            این ویدئو یک نمونه عمومی است و تریلر رسمی اثر نیست. برای انتشار واقعی، فایل تریلر
            دارای مجوز لازم است.
          </Notice>
        </div>
      </Modal>
    </article>
  );
}
