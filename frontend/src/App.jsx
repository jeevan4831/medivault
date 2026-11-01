import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import MainLayout from './layouts/MainLayout.jsx'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import RecipientAccessPage from './pages/RecipientAccessPage.jsx'
import AccessDeniedPage from './pages/sharing/AccessDeniedPage.jsx'
import ExpiredAccessPage from './pages/sharing/ExpiredAccessPage.jsx'
import RevokedAccessPage from './pages/sharing/RevokedAccessPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'
import DocumentDetailsPage from './pages/DocumentDetailsPage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import SharedAccessPage from './pages/SharedAccessPage.jsx'
import AccessHistoryPage from './pages/AccessHistoryPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public pages wrapped with standard public Navbar & Footer */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Public standalone temporary recipient access portal & states */}
        <Route path="/shared-access/:token" element={<RecipientAccessPage />} />
        <Route path="/shared-access/denied" element={<AccessDeniedPage />} />
        <Route path="/shared-access/expired" element={<ExpiredAccessPage />} />
        <Route path="/shared-access/revoked" element={<RevokedAccessPage />} />

        {/* Authenticated user routes wrapped with ProtectedRoute and DashboardLayout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailsPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/shared" element={<SharedAccessPage />} />
            <Route path="/history" element={<AccessHistoryPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<MainLayout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
