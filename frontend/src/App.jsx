import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout, PlainLayout } from './components/layout.jsx';
import { RequireAdmin, RequireAuth } from './routes/RouteGuards.jsx';

import HomePage from './pages/HomePage.jsx';
import BrowsePage from './pages/BrowsePage.jsx';
import DetailPage from './pages/DetailPage.jsx';
import WatchPage from './pages/WatchPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import PersonPage from './pages/PersonPage.jsx';
import PlansPage from './pages/PlansPage.jsx';
import CheckoutResultPage from './pages/CheckoutResultPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/auth.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { AboutPage, ContactPage, PrivacyPage, TermsPage } from './pages/StaticPages.jsx';

import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx';
import AdminContentPage from './pages/admin/AdminContentPage.jsx';
import AdminContentEditorPage from './pages/admin/AdminContentEditorPage.jsx';
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx';
import AdminHomepagePage from './pages/admin/AdminHomepagePage.jsx';
import AdminSettingsPage from './pages/admin/AdminSettingsPage.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public site with header + footer */}
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="movies" element={<BrowsePage fixedKind="movie" title="فیلم‌ها" />} />
        <Route path="series" element={<BrowsePage fixedKind="series" title="سریال‌ها" />} />
        <Route path="browse" element={<BrowsePage title="کتابخانه" />} />
        <Route path="movies/:slug" element={<DetailPage expectKind="movie" />} />
        <Route path="series/:slug" element={<DetailPage expectKind="series" />} />
        <Route path="title/:slug" element={<DetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="person/:id" element={<PersonPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="checkout/result" element={<CheckoutResultPage />} />

        <Route
          path="profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Immersive player — no site chrome */}
      <Route element={<PlainLayout />}>
        <Route path="watch/:contentId" element={<WatchPage />} />
      </Route>

      {/* Admin panel — separate shell, server-enforced access */}
      <Route
        path="admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="content" element={<AdminContentPage />} />
        <Route path="content/new" element={<AdminContentEditorPage />} />
        <Route path="content/:id" element={<AdminContentEditorPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="homepage" element={<AdminHomepagePage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
