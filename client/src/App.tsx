import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import RoundDetailPage from './pages/RoundDetailPage'
import LeaderboardPage from './pages/LeaderboardPage'

/**
 * Wrapper that redirects unauthenticated users to /login.
 * Shows nothing while the initial auth check is in progress.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null
  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(window.location.pathname)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          {/* Main game experience at root */}
          <Route path="/" element={<GamePage />} />

          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Round history / archive */}
          <Route path="/history" element={<HistoryPage />} />

          {/* Round detail and leaderboard */}
          <Route path="/rounds/:roundId" element={<RoundDetailPage />} />
          <Route path="/rounds/:roundId/leaderboard" element={<LeaderboardPage />} />

          {/* Protected: player profile */}
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />

          {/* 404 catch-all — redirect to game */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
