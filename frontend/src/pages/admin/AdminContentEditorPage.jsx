import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { adminApi } from '../../lib/api.js';
import { useAsync, useDocumentMeta } from '../../hooks/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  FormError,
  Input,
  Modal,
  Select,
  Skeleton,
  Spinner,
  Textarea,
} from '../../components/ui.jsx';
import { toFaDigits } from '../../lib/format.js';
import { ACCESS_LABEL_FA, AdminHeader, CONTENT_STATUS_LABEL } from './parts.jsx';
import './admin.css';

const EMPTY_FORM = {
  kind: 'movie',
  slug: '',
  titleFa: '',
  titleEn: '',
  synopsisShort: '',
  synopsisFull: '',
  releaseYear: '',
  endYear: '',
  runtimeMinutes: '',
  ageRating: '',
  quality: '',
  ratingValue: '',
  ratingVotes: '',
  countryCode: '',
  originalLanguage: '',
  posterUrl: '',
  backdropUrl: '',
  trailerUrl: '',
  releasedAt: '',
  status: 'draft',
  access: 'premium',
  hasAwards: false,
  genreIds: [],
};

const QUALITY_OPTIONS = ['SD', 'HD', '720p', '1080p', '4K'].map((value) => ({ value, label: value }));

const str = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};
const num = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : Number(trimmed);
};
const day = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed.slice(0, 10);
};

const toForm = (content, countries) => ({
  ...EMPTY_FORM,
  kind: content.kind ?? 'movie',
  slug: content.slug ?? '',
  titleFa: content.title_fa ?? '',
  titleEn: content.title_en ?? '',
  synopsisShort: content.synopsis_short ?? '',
  synopsisFull: content.synopsis_full ?? '',
  releaseYear: content.release_year ?? '',
  endYear: content.end_year ?? '',
  runtimeMinutes: content.runtime_minutes ?? '',
  ageRating: content.age_rating ?? '',
  quality: content.quality ?? '',
  ratingValue: content.rating_value ?? '',
  ratingVotes: content.rating_votes ?? '',
  countryCode: countries.find((country) => country.id === content.country_id)?.code ?? '',
  originalLanguage: content.original_language ?? '',
  posterUrl: content.poster_url ?? '',
  backdropUrl: content.backdrop_url ?? '',
  trailerUrl: content.trailer_url ?? '',
  releasedAt: content.released_at ? String(content.released_at).slice(0, 10) : '',
  status: content.status ?? 'draft',
  access: content.access ?? 'premium',
  hasAwards: Boolean(content.has_awards),
  genreIds: content.genre_ids ?? [],
});

/** Only string fields the API marks nullable are sent as null; the rest are omitted when empty. */
const toPayload = (form) => ({
  kind: form.kind,
  slug: str(form.slug) ?? undefined,
  titleFa: str(form.titleFa) ?? undefined,
  titleEn: str(form.titleEn) ?? undefined,
  synopsisShort: str(form.synopsisShort),
  synopsisFull: str(form.synopsisFull),
  releaseYear: num(form.releaseYear),
  endYear: num(form.endYear),
  runtimeMinutes: num(form.runtimeMinutes),
  ageRating: str(form.ageRating),
  quality: str(form.quality),
  ratingValue: num(form.ratingValue),
  ratingVotes: num(form.ratingVotes),
  countryCode: str(form.countryCode),
  originalLanguage: str(form.originalLanguage),
  posterUrl: str(form.posterUrl),
  backdropUrl: str(form.backdropUrl),
  trailerUrl: str(form.trailerUrl),
  releasedAt: day(form.releasedAt),
  status: form.status,
  access: form.access,
  hasAwards: form.hasAwards,
  genreIds: form.genreIds,
});

function FormSkeleton() {
  return (
    <div className="admin-card">
      <Skeleton width="30%" height={18} />
      <div className="form-grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} height={44} radius={10} />
        ))}
      </div>
    </div>
  );
}

export default function AdminContentEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const contentId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { isStrictAdmin } = useAuth();

  useDocumentMeta({ title: isNew ? 'افزودن محتوا' : 'ویرایش محتوا' });

  const genres = useAsync(() => adminApi.genres(), []);
  const countries = useAsync(() => adminApi.countries(), []);
  const detail = useAsync(
    () => (isNew ? Promise.resolve(null) : adminApi.contentOne(contentId)),
    [contentId, isNew],
  );

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [seasonForm, setSeasonForm] = useState({ seasonNumber: '', titleFa: '', airYear: '' });
  const [episodeTarget, setEpisodeTarget] = useState(null);
  const [episodeForm, setEpisodeForm] = useState({ episodeNumber: '', titleFa: '', runtimeMinutes: '' });
  const [episodeError, setEpisodeError] = useState('');
  const [sourceForm, setSourceForm] = useState({
    label: '',
    url: '',
    quality: '',
    sourceKind: 'hls',
    episodeId: '',
    isDefault: false,
    requiresPremium: true,
  });
  const [sourceError, setSourceError] = useState('');
  const [working, setWorking] = useState(false);

  const loadedContent = detail.data?.content;
  const countryList = countries.data?.items ?? [];

  useEffect(() => {
    if (loadedContent) setForm(toForm(loadedContent, countryList));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedContent, countries.data]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.titleFa.trim() || !form.titleEn.trim()) {
      setError('عنوان فارسی و انگلیسی هر دو الزامی هستند.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const result = await adminApi.createContent(toPayload(form));
        toast.success('محتوا ساخته شد. اکنون می‌توانید فصل‌ها و منابع پخش را اضافه کنید.');
        navigate(`/admin/content/${result.id}`, { replace: true });
      } else {
        await adminApi.updateContent(contentId, toPayload(form));
        toast.success('تغییرات ذخیره شد.');
        detail.reload();
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------- seasons -- */

  const addSeason = async (event) => {
    event.preventDefault();
    setWorking(true);
    try {
      const seasons = detail.data?.seasons ?? [];
      const seasonNumber =
        seasonForm.seasonNumber === '' ? seasons.length + 1 : Number(seasonForm.seasonNumber);
      await adminApi.addSeason(contentId, {
        seasonNumber,
        titleFa: str(seasonForm.titleFa) ?? undefined,
        airYear: num(seasonForm.airYear) ?? undefined,
      });
      setSeasonForm({ seasonNumber: '', titleFa: '', airYear: '' });
      toast.success('فصل ذخیره شد.');
      detail.reload();
    } catch (seasonError) {
      toast.error(seasonError.message);
    } finally {
      setWorking(false);
    }
  };

  const removeSeason = async (season) => {
    if (!window.confirm(`فصل ${toFaDigits(season.season_number)} با تمام قسمت‌هایش حذف شود؟`)) return;
    try {
      await adminApi.deleteSeason(season.id);
      toast.success('فصل حذف شد.');
      detail.reload();
    } catch (seasonError) {
      toast.error(seasonError.message);
    }
  };

  const openEpisode = (season) => {
    setEpisodeTarget(season);
    setEpisodeForm({
      episodeNumber: String((season.episodes?.length ?? 0) + 1),
      titleFa: '',
      runtimeMinutes: '',
    });
    setEpisodeError('');
  };

  const submitEpisode = async (event) => {
    event.preventDefault();
    setEpisodeError('');
    if (!episodeForm.titleFa.trim()) {
      setEpisodeError('عنوان قسمت الزامی است.');
      return;
    }
    setWorking(true);
    try {
      await adminApi.addEpisode(episodeTarget.id, {
        episodeNumber: Number(episodeForm.episodeNumber || 1),
        titleFa: episodeForm.titleFa.trim(),
        runtimeMinutes: num(episodeForm.runtimeMinutes) ?? undefined,
      });
      toast.success('قسمت ذخیره شد.');
      setEpisodeTarget(null);
      detail.reload();
    } catch (episodeAddError) {
      setEpisodeError(episodeAddError.message);
    } finally {
      setWorking(false);
    }
  };

  const removeEpisode = async (episode) => {
    if (!window.confirm(`قسمت ${toFaDigits(episode.episode_number)} حذف شود؟`)) return;
    try {
      await adminApi.deleteEpisode(episode.id);
      toast.success('قسمت حذف شد.');
      detail.reload();
    } catch (episodeError) {
      toast.error(episodeError.message);
    }
  };

  /* ------------------------------------------------------------- sources -- */

  const submitSource = async (event) => {
    event.preventDefault();
    setSourceError('');
    try {
      // Validate the URL up front so the operator gets a clear client-side message.
      // eslint-disable-next-line no-new
      new URL(sourceForm.url.trim());
    } catch {
      setSourceError('آدرس منبع معتبر نیست.');
      return;
    }
    setWorking(true);
    try {
      await adminApi.addSource(contentId, {
        label: sourceForm.label.trim(),
        url: sourceForm.url.trim(),
        quality: str(sourceForm.quality) ?? undefined,
        sourceKind: sourceForm.sourceKind,
        episodeId: sourceForm.episodeId === '' ? null : Number(sourceForm.episodeId),
        isDefault: sourceForm.isDefault,
        requiresPremium: sourceForm.requiresPremium,
      });
      setSourceForm({
        label: '',
        url: '',
        quality: '',
        sourceKind: 'hls',
        episodeId: '',
        isDefault: false,
        requiresPremium: true,
      });
      toast.success('منبع پخش اضافه شد.');
      detail.reload();
    } catch (sourceAddError) {
      setSourceError(sourceAddError.message);
    } finally {
      setWorking(false);
    }
  };

  const removeSource = async (source) => {
    if (!window.confirm(`منبع «${source.label}» حذف شود؟`)) return;
    try {
      await adminApi.deleteSource(source.id);
      toast.success('منبع حذف شد.');
      detail.reload();
    } catch (sourceDeleteError) {
      toast.error(sourceDeleteError.message);
    }
  };

  /* ---------------------------------------------------------------- view -- */

  const genresLoading = genres.loading;
  const detailLoading = !isNew && detail.loading;

  const allEpisodes = (detail.data?.seasons ?? []).flatMap((season) =>
    (season.episodes ?? []).map((episode) => ({
      id: episode.id,
      label: `فصل ${toFaDigits(season.season_number)} · قسمت ${toFaDigits(episode.episode_number)} — ${episode.title_fa}`,
    })),
  );

  return (
    <>
      <AdminHeader
        title={isNew ? 'افزودن محتوا' : 'ویرایش محتوا'}
        description={
          isNew
            ? 'پس از ذخیره، فصل‌ها، قسمت‌ها و منابع پخش را اضافه کنید.'
            : `${form.titleFa} · اسلاگ: ${form.slug || '—'}`
        }
        actions={
          <Button variant="outline" icon="chevronRight" to="/admin/content">
            بازگشت به فهرست
          </Button>
        }
      />

      {!isNew && detail.error ? (
        <ErrorState error={detail.error} onRetry={detail.reload} />
      ) : (
        <>
          {detailLoading ? (
            <FormSkeleton />
          ) : (
            <form className="admin-card" onSubmit={onSubmit}>
              <h2 className="admin-card__title">مشخصات عنوان</h2>

              <div className="form-grid">
                <Field label="نوع محتوا" required>
                  <Select
                    value={form.kind}
                    options={[
                      { value: 'movie', label: 'فیلم' },
                      { value: 'series', label: 'سریال' },
                    ]}
                    onChange={(event) => setField('kind', event.target.value)}
                    disabled={!isNew}
                  />
                </Field>

                <Field label="عنوان فارسی" required>
                  <Input
                    value={form.titleFa}
                    onChange={(event) => setField('titleFa', event.target.value)}
                    required
                  />
                </Field>

                <Field label="عنوان انگلیسی" required>
                  <Input
                    dir="ltr"
                    value={form.titleEn}
                    onChange={(event) => setField('titleEn', event.target.value)}
                    required
                  />
                </Field>

                <Field label="اسلاگ" hint="خالی بگذارید تا از عنوان انگلیسی ساخته شود.">
                  <Input
                    dir="ltr"
                    value={form.slug}
                    onChange={(event) => setField('slug', event.target.value)}
                  />
                </Field>

                <Field label="سال انتشار">
                  <Input
                    inputMode="numeric"
                    value={form.releaseYear}
                    onChange={(event) => setField('releaseYear', event.target.value)}
                  />
                </Field>

                <Field label="سال پایان" hint="فقط برای سریال‌ها">
                  <Input
                    inputMode="numeric"
                    value={form.endYear}
                    onChange={(event) => setField('endYear', event.target.value)}
                  />
                </Field>

                <Field label="مدت (دقیقه)">
                  <Input
                    inputMode="numeric"
                    value={form.runtimeMinutes}
                    onChange={(event) => setField('runtimeMinutes', event.target.value)}
                  />
                </Field>

                <Field label="رده سنی">
                  <Input
                    dir="ltr"
                    value={form.ageRating}
                    onChange={(event) => setField('ageRating', event.target.value)}
                    placeholder="+13"
                  />
                </Field>

                <Field label="کیفیت">
                  <Select
                    placeholder="انتخاب کیفیت"
                    options={QUALITY_OPTIONS}
                    value={form.quality}
                    onChange={(event) => setField('quality', event.target.value)}
                  />
                </Field>

                <Field label="امتیاز" hint="عددی بین ۰ تا ۱۰">
                  <Input
                    inputMode="decimal"
                    value={form.ratingValue}
                    onChange={(event) => setField('ratingValue', event.target.value)}
                  />
                </Field>

                <Field label="تعداد رأی">
                  <Input
                    inputMode="numeric"
                    value={form.ratingVotes}
                    onChange={(event) => setField('ratingVotes', event.target.value)}
                  />
                </Field>

                <Field label="کشور سازنده">
                  <Select
                    placeholder="انتخاب کشور"
                    options={countryList.map((country) => ({
                      value: country.code,
                      label: country.name_fa,
                    }))}
                    value={form.countryCode}
                    onChange={(event) => setField('countryCode', event.target.value)}
                  />
                </Field>

                <Field label="زبان اصلی">
                  <Input
                    dir="ltr"
                    value={form.originalLanguage}
                    onChange={(event) => setField('originalLanguage', event.target.value)}
                    placeholder="en"
                  />
                </Field>

                <Field label="وضعیت انتشار">
                  <Select
                    value={form.status}
                    options={[
                      { value: 'draft', label: CONTENT_STATUS_LABEL.draft },
                      { value: 'published', label: CONTENT_STATUS_LABEL.published },
                    ]}
                    onChange={(event) => setField('status', event.target.value)}
                  />
                </Field>

                <Field label="سطح دسترسی">
                  <Select
                    value={form.access}
                    options={[
                      { value: 'free', label: ACCESS_LABEL_FA.free },
                      { value: 'premium', label: ACCESS_LABEL_FA.premium },
                    ]}
                    onChange={(event) => setField('access', event.target.value)}
                  />
                </Field>

                <Field label="تاریخ انتشار">
                  <Input
                    type="date"
                    dir="ltr"
                    value={form.releasedAt}
                    onChange={(event) => setField('releasedAt', event.target.value)}
                  />
                </Field>
              </div>

              <div className="form-grid form-grid--wide">
                <Field label="خلاصه کوتاه">
                  <Textarea
                    rows={2}
                    value={form.synopsisShort}
                    onChange={(event) => setField('synopsisShort', event.target.value)}
                  />
                </Field>
                <Field label="خلاصه کامل">
                  <Textarea
                    rows={5}
                    value={form.synopsisFull}
                    onChange={(event) => setField('synopsisFull', event.target.value)}
                  />
                </Field>
                <Field label="آدرس پوستر">
                  <Input
                    dir="ltr"
                    value={form.posterUrl}
                    onChange={(event) => setField('posterUrl', event.target.value)}
                  />
                </Field>
                <Field label="آدرس تصویر پس‌زمینه">
                  <Input
                    dir="ltr"
                    value={form.backdropUrl}
                    onChange={(event) => setField('backdropUrl', event.target.value)}
                  />
                </Field>
                <Field label="آدرس تریلر">
                  <Input
                    dir="ltr"
                    value={form.trailerUrl}
                    onChange={(event) => setField('trailerUrl', event.target.value)}
                  />
                </Field>
              </div>

              <Field label="ژانرها">
                {genresLoading ? (
                  <Spinner size={18} />
                ) : (
                  <div className="genre-picker">
                    {(genres.data?.items ?? []).map((genre) => {
                      const active = form.genreIds.includes(genre.id);
                      return (
                        <button
                          type="button"
                          key={genre.id}
                          className={active ? 'is-active' : ''}
                          aria-pressed={active}
                          onClick={() =>
                            setField(
                              'genreIds',
                              active
                                ? form.genreIds.filter((value) => value !== genre.id)
                                : [...form.genreIds, genre.id],
                            )
                          }
                        >
                          {genre.name_fa}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.hasAwards}
                  onChange={(event) => setField('hasAwards', event.target.checked)}
                />
                دارای جایزه (در ردیف «برندگان جوایز» نمایش داده می‌شود)
              </label>

              <FormError>{error}</FormError>

              <div className="form-actions">
                <Button type="submit" loading={saving}>
                  {isNew ? 'ایجاد محتوا' : 'ذخیره تغییرات'}
                </Button>
                <Button variant="ghost" to="/admin/content">
                  انصراف
                </Button>
              </div>
            </form>
          )}

          {!isNew && !detailLoading && detail.data ? (
            <>
              <section className="admin-card">
                <h2 className="admin-card__title">
                  {form.kind === 'series' ? 'فصل‌ها و قسمت‌ها' : 'قسمت‌ها'}
                </h2>

                {(detail.data.seasons ?? []).length === 0 ? (
                  <p className="admin-note">هنوز فصلی ثبت نشده است.</p>
                ) : (
                  <div className="admin-list">
                    {detail.data.seasons.map((season) => (
                      <div className="admin-row admin-row--stack" key={season.id}>
                        <div className="admin-row__main">
                          <div className="admin-row__title">
                            فصل {toFaDigits(season.season_number)}
                            {season.title_fa ? ` — ${season.title_fa}` : ''}
                          </div>
                          <div className="admin-row__meta">
                            {toFaDigits((season.episodes ?? []).length)} قسمت
                            {season.air_year ? ` · ${toFaDigits(season.air_year)}` : ''}
                          </div>
                          <ol className="admin-episodes">
                            {(season.episodes ?? []).map((episode) => (
                              <li key={episode.id}>
                                <span>
                                  {toFaDigits(episode.episode_number)}. {episode.title_fa}
                                  {episode.runtime_minutes
                                    ? ` (${toFaDigits(episode.runtime_minutes)} دقیقه)`
                                    : ''}
                                </span>
                                {isStrictAdmin ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon="trash"
                                    onClick={() => removeEpisode(episode)}
                                  >
                                    حذف
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <div className="admin-row__actions">
                          <Button variant="outline" size="sm" icon="plus" onClick={() => openEpisode(season)}>
                            افزودن قسمت
                          </Button>
                          {isStrictAdmin ? (
                            <Button variant="danger" size="sm" icon="trash" onClick={() => removeSeason(season)}>
                              حذف فصل
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form className="form-grid" onSubmit={addSeason}>
                  <Field label="شماره فصل">
                    <Input
                      inputMode="numeric"
                      value={seasonForm.seasonNumber}
                      onChange={(event) =>
                        setSeasonForm((prev) => ({ ...prev, seasonNumber: event.target.value }))
                      }
                      placeholder="خودکار"
                    />
                  </Field>
                  <Field label="عنوان فصل">
                    <Input
                      value={seasonForm.titleFa}
                      onChange={(event) =>
                        setSeasonForm((prev) => ({ ...prev, titleFa: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="سال پخش">
                    <Input
                      inputMode="numeric"
                      value={seasonForm.airYear}
                      onChange={(event) =>
                        setSeasonForm((prev) => ({ ...prev, airYear: event.target.value }))
                      }
                    />
                  </Field>
                  <div className="form-actions form-actions--end">
                    <Button type="submit" variant="secondary" size="sm" icon="plus" loading={working}>
                      افزودن فصل
                    </Button>
                  </div>
                </form>
              </section>

              <section className="admin-card">
                <h2 className="admin-card__title">منابع پخش</h2>
                <p className="admin-note">
                  دسترسی به این آدرس‌ها از سمت سرور کنترل می‌شود؛ کاربر فقط پس از احراز
                  اشتراک به فایل پخش دسترسی دارد.
                </p>

                {(detail.data.sources ?? []).length === 0 ? (
                  <p className="admin-note">هنوز منبع پخشی ثبت نشده است.</p>
                ) : (
                  <div className="admin-list">
                    {detail.data.sources.map((source) => (
                      <div className="admin-row" key={source.id}>
                        <div className="admin-row__main">
                          <div className="admin-row__title">
                            {source.label}
                            {source.quality ? ` · ${source.quality}` : ''}
                          </div>
                          <div className="admin-row__meta" dir="ltr">
                            {source.url}
                          </div>
                          <div className="admin-row__meta">
                            {source.episode_id
                              ? `قسمت #${toFaDigits(source.episode_id)}`
                              : 'کل عنوان'}{' '}
                            · {source.source_kind === 'mp4' ? 'MP4' : 'HLS'}
                          </div>
                        </div>
                        {source.is_default ? <Badge tone="neutral">پیش‌فرض</Badge> : null}
                        <Badge tone={source.requires_premium ? 'accent' : 'success'}>
                          {source.requires_premium ? 'ویژه' : 'رایگان'}
                        </Badge>
                        <div className="admin-row__actions">
                          <Button variant="danger" size="sm" icon="trash" onClick={() => removeSource(source)}>
                            حذف
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <form className="form-grid" onSubmit={submitSource}>
                  <Field label="برچسب" required>
                    <Input
                      value={sourceForm.label}
                      onChange={(event) =>
                        setSourceForm((prev) => ({ ...prev, label: event.target.value }))
                      }
                      required
                    />
                  </Field>
                  <Field label="آدرس منبع" required>
                    <Input
                      dir="ltr"
                      value={sourceForm.url}
                      onChange={(event) =>
                        setSourceForm((prev) => ({ ...prev, url: event.target.value }))
                      }
                      placeholder="https://…/master.m3u8"
                      required
                    />
                  </Field>
                  <Field label="کیفیت">
                    <Select
                      placeholder="انتخاب کیفیت"
                      options={QUALITY_OPTIONS}
                      value={sourceForm.quality}
                      onChange={(event) =>
                        setSourceForm((prev) => ({ ...prev, quality: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="نوع منبع">
                    <Select
                      value={sourceForm.sourceKind}
                      options={[
                        { value: 'hls', label: 'HLS (m3u8)' },
                        { value: 'mp4', label: 'MP4' },
                      ]}
                      onChange={(event) =>
                        setSourceForm((prev) => ({ ...prev, sourceKind: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="قسمت" hint="خالی بگذارید تا برای کل عنوان باشد.">
                    <Select
                      placeholder="کل عنوان"
                      options={allEpisodes.map((episode) => ({
                        value: String(episode.id),
                        label: episode.label,
                      }))}
                      value={sourceForm.episodeId}
                      onChange={(event) =>
                        setSourceForm((prev) => ({ ...prev, episodeId: event.target.value }))
                      }
                    />
                  </Field>
                  <div className="form-actions form-actions--end">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={sourceForm.isDefault}
                        onChange={(event) =>
                          setSourceForm((prev) => ({ ...prev, isDefault: event.target.checked }))
                        }
                      />
                      منبع پیش‌فرض
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={sourceForm.requiresPremium}
                        onChange={(event) =>
                          setSourceForm((prev) => ({ ...prev, requiresPremium: event.target.checked }))
                        }
                      />
                      نیازمند اشتراک ویژه
                    </label>
                    <Button type="submit" variant="secondary" size="sm" icon="plus" loading={working}>
                      افزودن منبع
                    </Button>
                  </div>
                  <FormError>{sourceError}</FormError>
                </form>
              </section>
            </>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(episodeTarget)}
        onClose={() => setEpisodeTarget(null)}
        title={episodeTarget ? `افزودن قسمت به فصل ${toFaDigits(episodeTarget.season_number)}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEpisodeTarget(null)}>
              انصراف
            </Button>
            <Button loading={working} onClick={submitEpisode}>
              ذخیره قسمت
            </Button>
          </>
        }
      >
        <form className="form-grid form-grid--wide" onSubmit={submitEpisode}>
          <Field label="شماره قسمت">
            <Input
              inputMode="numeric"
              value={episodeForm.episodeNumber}
              onChange={(event) =>
                setEpisodeForm((prev) => ({ ...prev, episodeNumber: event.target.value }))
              }
            />
          </Field>
          <Field label="عنوان قسمت" required>
            <Input
              value={episodeForm.titleFa}
              onChange={(event) =>
                setEpisodeForm((prev) => ({ ...prev, titleFa: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="مدت (دقیقه)">
            <Input
              inputMode="numeric"
              value={episodeForm.runtimeMinutes}
              onChange={(event) =>
                setEpisodeForm((prev) => ({ ...prev, runtimeMinutes: event.target.value }))
              }
            />
          </Field>
          <FormError>{episodeError}</FormError>
        </form>
      </Modal>
    </>
  );
}
