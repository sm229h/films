import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSite } from '../../context/SiteContext.jsx';
import { Button, Icon } from '../../components/ui.jsx';
import './admin.css';

const ADMIN_NAV = [
  { to: '/admin', label: 'داشبورد', icon: 'chart', exact: true },
  { to: '/admin/content', label: 'مدیریت محتوا', icon: 'film' },
  { to: '/admin/homepage', label: 'صفحه اصلی و بنرها', icon: 'grid' },
  { to: '/admin/users', label: 'کاربران', icon: 'users' },
  { to: '/admin/settings', label: 'تنظیمات سایت', icon: 'settings' },
];

export default function AdminLayout() {
  const { user, isStrictAdmin, logout } = useAuth();
  const site = useSite();
  const navigate = useNavigate();

  return (
    <div className="admin">
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <span className="logo__mark" aria-hidden="true">
            {site.brand.nameEn?.slice(0, 2).toUpperCase() || 'CV'}
          </span>
          <div>
            <strong>پنل مدیریت</strong>
            <span className="dim">{site.brand.nameFa}</span>
          </div>
        </div>

        <nav className="admin__nav" aria-label="ناوبری پنل مدیریت">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin__foot">
          <div className="admin__user">
            <strong>{user.fullName || user.email}</strong>
            <span className="dim">
              {isStrictAdmin ? 'مدیر اصلی' : user.role === 'support' ? 'پشتیبان' : 'کاربر'}
            </span>
          </div>
          <Button to="/" variant="outline" size="sm" block icon="external">
            مشاهده سایت
          </Button>
          <Button
            variant="ghost"
            size="sm"
            block
            icon="logout"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            خروج
          </Button>
        </div>
      </aside>

      <div className="admin__main">
        <p className="admin__hint">
          دسترسی شما در هر درخواست توسط سرور بررسی می‌شود؛ پنهان بودن دکمه‌ها جایگزین کنترل
          دسترسی نیست.
        </p>
        <Outlet />
      </div>
    </div>
  );
}
