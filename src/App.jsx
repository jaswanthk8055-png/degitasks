import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import * as microsoftTeams from '@microsoft/teams-js'
import { useAuthStore } from './stores/useAuthStore'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import BoardPage from './pages/BoardPage'
import HomePage from './pages/HomePage'
import InboxPage from './pages/InboxPage'
import DashboardPage from './pages/DashboardPage'
import NotFoundPage from './pages/NotFoundPage'
import ProfilePage from './pages/ProfilePage'
import TeamsConfigPage from './pages/TeamsConfigPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import { initializeTeams, notifyTeamsAppLoaded, getTeamsTheme } from './lib/teams'

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    initializeTeams().then(async (inTeams) => {
      if (inTeams) {
        notifyTeamsAppLoaded()
        const theme = await getTeamsTheme()
        document.documentElement.setAttribute('data-theme', theme)
        microsoftTeams.app.registerOnThemeChangeHandler((t) => {
          document.documentElement.setAttribute('data-theme', t)
        })
      }
    })
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/teams-config" element={<TeamsConfigPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/my-work" element={<Navigate to="/" replace />} />
          <Route path="/tv" element={<Navigate to="/dashboard" replace />} />
          <Route path="/board/:boardId" element={<BoardPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
