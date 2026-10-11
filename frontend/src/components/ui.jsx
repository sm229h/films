import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toFaDigits } from '../lib/format.js';
import { useBodyLock } from '../hooks/index.js';
import './ui.css';

/* ------------------------------------------------------------------- icons -- */

const ICON_PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  heart:
    'M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.8.9-.8A4.6 4.6 0 0 1 19.4 13Z',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.5-4.5',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  close: 'M18 6 6 18M6 6l12 12',
  menu: 'M3 6h18M3 12h18M3 18h18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 18-6-6 6-6',
  chevronRight: 'm9 18 6-6-6-6',
  star: 'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3 6.2 20.4l1.1-6.5L2.6 9.3l6.5-.9z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v4h1',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3h.01',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  chart: 'M3 3v18h18M7 15v3M12 10v8M17 6v12',
  film: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm11 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  grid: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l4 2',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',
  lock: 'M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5z',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9',
  volume: 'M11 5 6 9H3v6h3l5 4V5Zm5 3a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13',
  mute: 'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  skipBack: 'M11 19 4 12l7-7v14Zm9 0-7-7 7-7v14Z',
  skipForward: 'M13 5l7 7-7 7V5Zm-9 0 7 7-7 7V5Z',
  cc: 'M3 5h18v14H3zM10 10a2.5 2.5 0 1 0 0 4M17 10a2.5 2.5 0 1 0 0 4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  calendar: 'M3 5h18v16H3zM8 3v4M16 3v4M3 11h18',
  tag: 'M20 12l-8 8-9-9V3h8l9 9ZM7.5 7.5h.01',
};

export function Icon({ name, size = 20, className = '', ...rest }) {
  const path = ICON_PATHS[name] || ICON_PATHS.info;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}

/* ------------------------------------------------------------------ button -- */

export function Button({
  as,
  to,
  href,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  children,
  className = '',
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    block ? 'btn--block' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children ? <span>{children}</span> : null}
      {iconRight && !loading ? (
        <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} target="_blank" rel="noreferrer noopener" {...rest}>
        {content}
      </a>
    );
  }
  const Component = as || 'button';
  return (
    <Component className={classes} disabled={loading || rest.disabled} {...rest}>
      {content}
    </Component>
  );
}

export function IconButton({ icon, label, size = 'md', variant = 'ghost', active, ...rest }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size} icon-btn--${variant} ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}

/* --------------------------------------------------------------- feedback --- */

export function Spinner({ size = 20, label = 'در حال بارگذاری' }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 8, className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function PosterSkeleton() {
  return (
    <div className="card-skeleton" aria-hidden="true">
      <Skeleton height="100%" radius={12} className="card-skeleton__poster" />
      <Skeleton width="70%" height={14} />
      <Skeleton width="45%" height={12} />
    </div>
  );
}

export function EmptyState({ icon = 'info', title, description, action }) {
  return (
    <div className="state-block">
      <Icon name={icon} size={40} className="state-block__icon" />
      <h3 className="state-block__title">{title}</h3>
      {description ? <p className="state-block__text">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'خطا در دریافت اطلاعات' }) {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.';
  return (
    <div className="state-block state-block--error" role="alert">
      <Icon name="alert" size={40} className="state-block__icon" />
      <h3 className="state-block__title">{title}</h3>
      <p className="state-block__text">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  return <span className={`badge badge--${tone} ${className}`}>{children}</span>;
}

export function RatingBadge({ value, votes }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="rating" title={votes ? `${toFaDigits(votes)} رأی` : 'امتیاز'}>
      <Icon name="star" size={14} className="rating__star" />
      <span className="rating__value">{toFaDigits(Number(value).toFixed(1))}</span>
    </span>
  );
}

/* ------------------------------------------------------------------- modal -- */

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  useBodyLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog for keyboard users.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <h3 className="modal__title">{title}</h3>
          <IconButton icon="close" label="بستن" onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------- форм --- */

export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      {label ? (
        <span className="field__label">
          {label}
          {required ? <em className="field__required">*</em> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {hint && !error ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`input input--area ${className}`} rows={4} {...rest} />;
}

export function Select({ options = [], placeholder, className = '', ...rest }) {
  return (
    <select className={`input input--select ${className}`} {...rest}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="form-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{children}</span>
    </div>
  );
}

export function Notice({ children, tone = 'info', icon = 'info' }) {
  if (!children) return null;
  return (
    <div className={`notice notice--${tone}`}>
      <Icon name={icon} size={18} />
      <span>{children}</span>
    </div>
  );
}
