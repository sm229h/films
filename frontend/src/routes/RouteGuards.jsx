import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, Spinner } from '../components/ui.jsx';

/**
 * Client-side guards improve the experience; they are NOT the security boundary.
 * Every protected API route re-checks the session and role on the server.
 */

function Pending({ label }) {
  return (
    <div className="container page">
      <div className="guard-pending">
        <Spinner size={26} />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Pending label="در حال بررسی نشست…" />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <Pending label="در حال بررسی دسترسی…" />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (!isAdmin) {
    return (
      <div className="container page">
        <EmptyState
          icon="lock"
          title="دسترسی مجاز نیست"
          description="این بخش فقط برای مدیران سامانه در دسترس است."
        />
      </div>
    );
  }
  return children;
}
