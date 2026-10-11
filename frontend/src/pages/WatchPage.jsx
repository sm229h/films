import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { catalogApi, libraryApi, playbackApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ContentRow } from '../components/media.jsx';
import VideoPlayer from '../components/VideoPlayer.jsx';
import { Badge, Button, EmptyState, ErrorState, Icon, Notice, Spinner } from '../components/ui.jsx';
import { KIND_LABEL, formatRuntime, toFaDigits, titlePath } from '../lib/format.js';
import './watch.css';

export default function WatchPage() {
  const { contentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const episodeId = searchParams.get('episode') ? Number(searchParams.get('episode')) : null;

  const manifest = useAsync(
    () => playbackApi.manifest(contentId, episodeId),
    [contentId, episodeId],
  );

  const content = manifest.data?.content;

  // Series need the full episode list for "next episode" and the sidebar.
  const detail = useAsync(
    () => (content?.kind === 'series' ? catalogApi.detail(content.slug) : Promise.resolve(null)),
    [content?.kind, content?.slug],
  );

  const progress = useAsync(
    () => (user ? libraryApi.progressFor(contentId) : Promise.resolve(null)),
    [user?.id, contentId],
  );

  useDocumentMeta({
    title: content ? `تماشای ${content.title_fa}` : 'پخش آنلاین',
    description: content?.title_en,
  });

  const seasons = detail.data?.seasons ?? [];

  /** Flat, ordered episode list used for next/previous navigation. */
  const flatEpisodes = useMemo(
    () =>
      seasons.flatMap((season) =>
        (season.episodes ?? []).map((episode) => ({
          ...episode,
          seasonNumber: season.season_number,
        })),
      ),
    [seasons],
  );

  const currentIndex = flatEpisodes.findIndex((episode) => episode.id === episodeId);
  const nextEpisode = currentIndex >= 0 ? flatEpisodes[currentIndex + 1] : null;

  const startPosition = useMemo(() => {
    const items = progress.data?.items ?? [];
    if (episodeId) {
      const match = items.find((item) => item.episode_id === episodeId);
      return match?.position_seconds ?? 0;
    }
    const movie = items.find((item) => !item.episode_id);
    return movie?.completed ? 0 : movie?.position_seconds ?? 0;
  }, [progress.data, episodeId]);

  const onProgress = useCallback(
    (position, duration) => {
      if (!user) return;
      playbackApi
        .save({
          contentId: Number(contentId),
          episodeId: episodeId ?? null,
          position,
          duration,
        })
        .catch(() => {
          /* Progress reporting is best-effort and must never interrupt playback. */
        });
    },
    [user, contentId, episodeId],
  );

  const goToEpisode = (id) => {
    setSearchParams(id ? { episode: String(id) } : {}, { replace: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ------------------------------------------------------------- render states */

  if (manifest.loading) {
    return (
      <div className="watch watch--loading">
        <Spinner size={34} />
        <span>در حال آماده‌سازی پخش…</span>
      </div>
    );
  }

  if (manifest.error) {
    const status = manifest.error.status;
    const needsSubscription = status === 403;

    return (
      <div className="watch watch--error container">
        <EmptyState
          icon={needsSubscription ? 'lock' : 'alert'}
          title={needsSubscription ? 'برای تماشا به اشتراک نیاز دارید' : 'امکان پخش این محتوا نیست'}
          description={
            manifest.error.message ||
            'این محتوا ویژه مشترکان است یا منبع پخش آن در دسترس نیست.'
          }
          action={
            <div className="watch__error-actions">
              {needsSubscription && !user ? (
                <Button to={`/login?next=${encodeURIComponent(window.location.pathname)}`} icon="user">
                  ورود به حساب
                </Button>
              ) : null}
              {needsSubscription ? (
                <Button to="/plans" variant="primary" icon="star">
                  تهیه اشتراک
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => navigate(-1)}>
                بازگشت
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="watch watch--error container">
        <EmptyState icon="alert" title="محتوا پیدا نشد" />
      </div>
    );
  }

  const playerTitle = manifest.data.episode
    ? `${content.title_fa} — فصل ${toFaDigits(manifest.data.episode.season_number)}، قسمت ${toFaDigits(manifest.data.episode.episode_number)}: ${manifest.data.episode.title_fa}`
    : `${content.title_fa} (${content.title_en})`;

  return (
    <div className="watch">
      <header className="watch__bar">
        <button
          type="button"
          className="watch__back"
          onClick={() => navigate(titlePath(content))}
          aria-label="بازگشت به صفحه اثر"
        >
          <Icon name="chevronRight" size={20} />
        </button>

        <div className="watch__bar-info">
          <strong>{playerTitle}</strong>
          <span className="dim">
            {KIND_LABEL[content.kind]}
            {manifest.data.episode?.runtime_minutes
              ? ` • ${formatRuntime(manifest.data.episode.runtime_minutes)}`
              : ''}
            {content.quality ? ` • ${content.quality}` : ''}
          </span>
        </div>

        <div className="watch__bar-actions">
          <Badge tone={content.access === 'free' ? 'success' : 'accent'}>
            {content.access === 'free' ? 'رایگان' : 'ویژه مشترکان'}
          </Badge>
          <Button to={titlePath(content)} variant="outline" size="sm" icon="info">
            جزئیات
          </Button>
        </div>
      </header>

      <div className="watch__stage">
        <VideoPlayer
          key={`${contentId}-${episodeId ?? 'movie'}`}
          sources={manifest.data.sources}
          subtitles={manifest.data.subtitles}
          startPosition={startPosition}
          title={playerTitle}
          onProgress={onProgress}
          nextEpisode={nextEpisode}
          onNextEpisode={() => {
            if (nextEpisode) goToEpisode(nextEpisode.id);
          }}
        />
      </div>

      {!user ? (
        <div className="container watch__notice">
          <Notice tone="info">
            برای ثبت «ادامه تماشا» و دسترسی به محتوای ویژه، <Link to="/login">وارد حساب خود شوید</Link>.
          </Notice>
        </div>
      ) : null}

      {content.access === 'premium' && !manifest.data.hasSource ? (
        <div className="container watch__notice">
          <Notice tone="warning">
            این اثر ویژه است و منبع پخشی برای آن ثبت نشده؛ پس از ثبت فایل دارای مجوز در پنل
            مدیریت قابل تماشا خواهد بود.
          </Notice>
        </div>
      ) : null}

      <div className="container watch__body">
        {content.kind === 'series' && seasons.length ? (
          <section className="watch__episodes">
            <h2 className="detail__section-title">قسمت‌ها</h2>
            {seasons.map((season) => (
              <div key={season.id} className="watch__season">
                <h3 className="watch__season-title">
                  {season.title_fa || `فصل ${toFaDigits(season.season_number)}`}
                </h3>
                <ul className="watch__episode-list">
                  {(season.episodes ?? []).map((episode) => {
                    const isActive = episode.id === episodeId;
                    const saved = (progress.data?.items ?? []).find(
                      (item) => item.episode_id === episode.id,
                    );
                    return (
                      <li key={episode.id}>
                        <button
                          type="button"
                          className={`watch__episode ${isActive ? 'is-active' : ''}`}
                          onClick={() => goToEpisode(episode.id)}
                          aria-current={isActive}
                        >
                          <span className="watch__episode-num">
                            {toFaDigits(episode.episode_number)}
                          </span>
                          <span className="watch__episode-text">
                            <strong>{episode.title_fa}</strong>
                            <span className="dim">
                              {episode.runtime_minutes
                                ? formatRuntime(episode.runtime_minutes)
                                : 'مدت نامشخص'}
                              {saved && !saved.completed ? ' • نیمه‌تماشا' : ''}
                            </span>
                          </span>
                          {isActive ? <Icon name="play" size={18} /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        <section className="watch__about">
          <h2 className="detail__section-title">درباره این اثر</h2>
          <p className="watch__synopsis">
            {manifest.data.episode?.synopsis || content.synopsis_short}
          </p>
          <Button to={titlePath(content)} variant="outline" icon="info">
            مشاهده صفحه کامل اثر
          </Button>
        </section>
      </div>

      {detail.error ? (
        <div className="container">
          <ErrorState error={detail.error} onRetry={detail.reload} />
        </div>
      ) : null}

      {detail.data?.similar?.length ? (
        <div className="container">
          <ContentRow title="آثار مشابه" items={detail.data.similar} />
        </div>
      ) : null}
    </div>
  );
}
