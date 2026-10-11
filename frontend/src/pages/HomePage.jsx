import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { billingApi, catalogApi } from '../lib/api.js';
import { useAsync, useDocumentMeta } from '../hooks/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { ContentRow, GenreChips, HeroSlider } from '../components/media.jsx';
import { Badge, Button, ErrorState, Icon, Notice } from '../components/ui.jsx';
import { formatJalali } from '../lib/format.js';
import './home.css';

/* --------------------------------------------------------- subscription CTA -- */

const BENEFITS = [
  'دسترسی به آرشیو کامل فیلم و سریال',
  'تماشا در کیفیت تا 4K روی تلویزیون، موبایل و لپ‌تاپ',
  'تماشای بدون تبلیغات در همه دستگاه‌ها',
  'دانلود برای تماشای آفلاین',
];

function SubscriptionBanner() {
  const { user } = useAuth();
  const site = useSite();
  const { data } = useAsync(
    () => (user ? billingApi.subscription() : Promise.resolve(null)),
    [user?.id],
  );

  const active = data?.active;

  return (
    <section className="promo" aria-labelledby="promo-title">
      <span className="promo__glow" aria-hidden="true" />
      <div className="promo__content">
        <Badge tone="gold">
          <Icon name="star" size={12} />
          اشتراک ویژه
        </Badge>
        <h2 className="promo__title" id="promo-title">
          {site.subscriptionBannerTitle}
        </h2>
        <p className="promo__text">{site.subscriptionBannerText}</p>

        <ul className="promo__benefits">
          {BENEFITS.map((benefit) => (
            <li key={benefit}>
              <Icon name="check" size={16} />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <div className="promo__actions">
          <Button to="/plans" size="lg" icon="star">
            {active ? 'تمدید یا تغییر پلن' : 'انتخاب پلن اشتراک'}
          </Button>
          {active ? (
            <span className="promo__status">
              <Icon name="calendar" size={16} />
              اشتراک «{active.planName}» تا {formatJalali(active.endsAt)} فعال است
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- page --- */

export default function HomePage() {
  useDocumentMeta({
    title: 'تماشای آنلاین فیلم و سریال خارجی',
    description:
      'سینه‌ورس: تماشای آنلاین فیلم، سریال، انیمیشن و مستند خارجی با زیرنویس فارسی، کیفیت تا 4K و ادامه تماشا از هر دستگاه.',
  });

  const navigate = useNavigate();
  const site = useSite();
  const home = useAsync(() => catalogApi.home(), []);
  const genres = useAsync(() => catalogApi.genres(), []);

  const sections = home.data?.sections ?? [];
  const hero = home.data?.hero ?? [];
  const banners = home.data?.banners ?? [];

  /** Continue-watching cards need their saved position for the progress bar. */
  const progressById = useMemo(() => {
    const map = {};
    const section = sections.find((item) => item.sourceType === 'continue_watching');
    for (const item of section?.items ?? []) {
      map[`${item.id}:${item.episode_id ?? 'x'}`] = {
        position_seconds: item.position_seconds,
        duration_seconds: item.duration_seconds,
      };
    }
    return map;
  }, [sections]);

  if (home.error) {
    return (
      <div className="container page">
        <ErrorState error={home.error} onRetry={home.reload} />
      </div>
    );
  }

  return (
    <div className="home">
      <HeroSlider items={hero} loading={home.loading} />

      <div className="container">
        <section className="home__genres" aria-label="مرور بر اساس ژانر">
          <div className="row-between">
            <h2 className="row-section__title">مرور بر اساس ژانر</h2>
            <Link to="/browse" className="row-section__more">
              همه ژانرها
              <Icon name="chevronLeft" size={16} />
            </Link>
          </div>
          {genres.loading ? (
            <div className="chips">
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className="chip chip--skeleton" />
              ))}
            </div>
          ) : (
            <GenreChips
              genres={(genres.data?.items ?? []).slice(0, 12)}
              onSelect={(slug) => {
                if (slug) navigate(`/browse?genre=${slug}`);
              }}
            />
          )}
        </section>

        {banners.length && banners[0].image_url ? (
          <Link to={banners[0].link_url || '/plans'} className="home__banner">
            <img src={banners[0].image_url} alt={banners[0].title_fa} loading="lazy" />
            <span className="home__banner-text">
              <strong>{banners[0].title_fa}</strong>
              {banners[0].subtitle ? <span>{banners[0].subtitle}</span> : null}
            </span>
          </Link>
        ) : null}

        {home.loading
          ? Array.from({ length: 3 }, (_, index) => (
              <ContentRow key={index} title="در حال بارگذاری" items={[]} loading />
            ))
          : sections.map((section, index) => (
              <div key={section.key}>
                <ContentRow
                  title={section.title}
                  subtitle={section.subtitle}
                  items={section.items}
                  progressById={progressById}
                  viewAllTo={
                    section.sourceType === 'genre'
                      ? `/browse?genre=${section.key}`
                      : `/browse?sort=${section.sourceType === 'new' ? 'latest' : 'popular'}`
                  }
                />
                {/* The subscription banner sits after the first three rows. */}
                {index === 2 && site.subscriptionBannerEnabled ? <SubscriptionBanner /> : null}
              </div>
            ))}

        <Notice tone="info">
          این نسخه با داده‌های نمونه اجرا می‌شود. اطلاعات و پوستر آثار از منابع عمومی گردآوری شده و
          فایل‌های پخش، نمونه هستند؛ برای انتشار واقعی به سرویس دارای مجوز و درگاه
          پرداخت نیاز است.
        </Notice>
      </div>
    </div>
  );
}
