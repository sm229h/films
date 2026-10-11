import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BRAND, NAV_ITEMS } from '../brand.config.js';
import { catalogApi } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSite } from '../context/SiteContext.jsx';
import { useBodyLock, useDebounced } from '../hooks/index.js';
import { Button, Icon, IconButton, Spinner } from './ui.jsx';
import './layout.css';

/* ------------------------------------------------------------------- logo --- */

export function Logo({ brand, compact = false }) {
  return (
    <Link to="/" className="logo" aria-label={`${brand.nameFa} — صفحه اصلی`}>
      <span className="logo__mark" aria-hidden="true">
        {brand.nameEn?.slice(0, 2).toUpperCase() || BRAND.mark}
      </span>
      {!compact ? (
        <span className="logo__text">
          <strong className="logo__fa">{brand.nameFa}</strong>
          <span className="logo__en ltr">{brand.nameEn}</span>
        </span>
      ) : null}
    </Link>
  );
}

/* ---------------------------------------------------------- search overlay --- */

function SearchOverlay({ open, onClose }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState({ titles: [], people: [] });
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(term, 300);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  useBodyLock(open);

  useEffect(() => {
    if (open) {
      setTerm('');
      setResults({ titles: [], people: [] });
      const timer = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = debounced.trim();
    if (trimmed.length < 2) {
      setResults({ titles: [], people: [] });
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    catalogApi
      .suggest(trimmed)
      .then((data) => {
        if (!cancelled) setResults(data ?? { titles: [], people: [] });
      })
      .catch(() => {
        if (!cancelled) setResults({ titles: [], people: [] });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    onClose();
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const hasResults = results.titles.length || results.people.length;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="جست‌وجو">
      <div className="search-overlay__backdrop" onClick={onClose} />
      <div className="search-overlay__panel">
        <form className="search-overlay__form" onSubmit={submit} role="search">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            type="search"
            className="search-overlay__input"
            placeholder="نام فیلم، سریال، بازیگر یا کارگردان…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label="عبارت جست‌وجو"
          />
          {loading ? <Spinner size={18} /> : null}
          <IconButton icon="close" label="بستن جست‌وجو" onClick={onClose} />
        </form>

        {term.trim().length >= 2 ? (
          <div className="search-overlay__results">
            {!hasResults && !loading ? (
              <p className="search-overlay__empty">نتیجه‌ای برای «{term}» پیدا نشد.</p>
            ) : null}

            {results.titles.length ? (
              <div className="search-overlay__group">
                <p className="search-overlay__group-title">آثار</p>
                <ul>
                  {results.titles.map((title) => (
                    <li key={title.id}>
                      <Link
                        to={`/${title.kind === 'series' ? 'series' : 'movies'}/${title.slug}`}
                        onClick={onClose}
                        className="search-overlay__item"
                      >
                        <span className="search-overlay__thumb">
                          {title.poster_url ? (
                            <img src={title.poster_url} alt="" loading="lazy" />
                          ) : null}
                        </span>
                        <span className="search-overlay__item-text">
                          <strong>{title.title_fa}</strong>
                          <span className="ltr dim">
                            {title.title_en}
                            {title.release_year ? ` · ${title.release_year}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {results.people.length ? (
              <div className="search-overlay__group">
                <p className="search-overlay__group-title">افراد</p>
                <ul>
                  {results.people.map((person) => (
                    <li key={person.id}>
                      <Link
                        to={`/person/${person.id}`}
                        onClick={onClose}
                        className="search-overlay__item"
                      >
                        <span className="search-overlay__thumb search-overlay__thumb--round">
                          {person.photo_url ? (
                            <img src={person.photo_url} alt="" loading="lazy" />
                          ) : null}
                        </span>
                        <span className="search-overlay__item-text">
                          <strong>{person.name_fa || person.name_en}</strong>
                          <span className="ltr dim">{person.name_en}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="search-overlay__hint">
            نام اثر یا بازیگر را تایپ کنید. جست‌وجو در عنوان فارسی و انگلیسی انجام می‌شود.
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- profile --- */

function ProfileMenu({ user, isAdmin, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const initials = (user.fullName || user.email || '?').trim().slice(0, 1);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-menu__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="منوی حساب کاربری"
      >
        <span className="profile-menu__avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="profile-menu__name">{user.fullName || user.email.split('@')[0]}</span>
        <Icon name="chevronDown" size={14} />
      </button>

      {open ? (
        <div className="profile-menu__panel" role="menu">
          <div className="profile-menu__head">
            <strong>{user.fullName || 'کاربر'}</strong>
            <span className="dim ltr">{user.email}</span>
          </div>
          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="user" size={16} /> پروفایل من
          </Link>
          <Link to="/profile?tab=favorites" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="heart" size={16} /> علاقه‌مندی‌ها
          </Link>
          <Link to="/profile?tab=history" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="clock" size={16} /> تاریخچه تماشا
          </Link>
          <Link to="/plans" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="star" size={16} /> اشتراک من
          </Link>
          {isAdmin ? (
            <Link to="/admin" role="menuitem" onClick={() => setOpen(false)} className="profile-menu__admin">
              <Icon name="settings" size={16} /> پنل مدیریت
            </Link>
          ) : null}
          <button type="button" role="menuitem" onClick={onLogout} className="profile-menu__logout">
            <Icon name="logout" size={16} /> خروج از حساب
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ header --- */

export function Header() {
  const site = useSite();
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  useBodyLock(drawerOpen);

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      <a className="skip-link" href="#main">
        پرش به محتوای اصلی
      </a>
      <header
        className={`header ${scrolled ? 'is-scrolled' : ''} ${isHome && !scrolled ? 'is-transparent' : ''}`}
      >
        <div className="header__inner container">
          <IconButton
            icon="menu"
            label="باز کردن منو"
            className="header__burger"
            onClick={() => setDrawerOpen(true)}
          />
          <Logo brand={site.brand} />

          <nav className="header__nav" aria-label="ناوبری اصلی">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                className={({ isActive }) => `header__link ${isActive ? 'is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header__actions">
            <IconButton icon="search" label="جست‌وجو" onClick={() => setSearchOpen(true)} />
            {user ? (
              <Link to="/profile?tab=favorites" className="header__icon-link" aria-label="علاقه‌مندی‌ها">
                <Icon name="heart" size={20} />
              </Link>
            ) : null}
            {user ? (
              <ProfileMenu user={user} isAdmin={isAdmin} onLogout={onLogout} />
            ) : (
              <div className="header__auth">
                <Button to="/login" variant="ghost" size="sm">
                  ورود
                </Button>
                <Button to="/register" variant="primary" size="sm">
                  ثبت‌نام
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div className={`drawer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer__backdrop" onClick={() => setDrawerOpen(false)} />
        <aside className="drawer__panel" role="dialog" aria-modal={drawerOpen} aria-label="منو">
          <div className="drawer__head">
            <Logo brand={site.brand} />
            <IconButton icon="close" label="بستن منو" onClick={() => setDrawerOpen(false)} />
          </div>
          <nav className="drawer__nav" aria-label="ناوبری موبایل">
            {NAV_ITEMS.map((item) => (
              <Link key={item.to} to={item.to} className="drawer__link">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="drawer__foot">
            {user ? (
              <>
                <Button to="/profile" variant="outline" block icon="user">
                  پروفایل من
                </Button>
                {isAdmin ? (
                  <Button to="/admin" variant="outline" block icon="settings">
                    پنل مدیریت
                  </Button>
                ) : null}
                <Button variant="ghost" block icon="logout" onClick={onLogout}>
                  خروج از حساب
                </Button>
              </>
            ) : (
              <>
                <Button to="/login" variant="outline" block>
                  ورود
                </Button>
                <Button to="/register" variant="primary" block>
                  ثبت‌نام
                </Button>
              </>
            )}
          </div>
        </aside>
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ footer --- */

export function Footer() {
  const site = useSite();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__inner container">
        <div className="footer__brand">
          <Logo brand={site.brand} />
          <p className="footer__about">{site.footerAbout}</p>
        </div>

        <nav className="footer__col" aria-label="دسته‌بندی‌ها">
          <h3 className="footer__title">دسته‌بندی‌ها</h3>
          <Link to="/movies">فیلم‌ها</Link>
          <Link to="/series">سریال‌ها</Link>
          <Link to="/browse?genre=animation">انیمیشن‌ها</Link>
          <Link to="/browse?genre=documentary">مستندها</Link>
          <Link to="/browse">همه ژانرها</Link>
        </nav>

        <nav className="footer__col" aria-label="حساب کاربری">
          <h3 className="footer__title">حساب کاربری</h3>
          <Link to="/login">ورود</Link>
          <Link to="/register">ثبت‌نام</Link>
          <Link to="/profile">پروفایل</Link>
          <Link to="/plans">پلن‌های اشتراک</Link>
        </nav>

        <nav className="footer__col" aria-label="درباره سایت">
          <h3 className="footer__title">درباره ما</h3>
          <Link to="/about">درباره سینه‌ورس</Link>
          <Link to="/contact">تماس با ما</Link>
          <Link to="/terms">قوانین استفاده</Link>
          <Link to="/privacy">حریم خصوصی</Link>
        </nav>
      </div>

      <div className="footer__bottom container">
        <p>© {year} {site.brand.nameFa} — همه حقوق محفوظ است.</p>
        <p className="footer__note">
          این نسخه با داده‌های نمونه اجرا می‌شود؛ اطلاعات و تصاویر واقعی آثار پس از اتصال
          سرویس دارای مجوز جایگزین می‌شوند.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ layout --- */

export function Layout() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

/** Chrome-free shell used by the player and the admin panel. */
export function PlainLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return (
    <main id="main">
      <Outlet />
    </main>
  );
}
