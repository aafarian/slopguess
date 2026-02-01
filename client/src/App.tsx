import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import Layout from './components/Layout'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import RoundDetailPage from './pages/RoundDetailPage'
import LeaderboardPage from './pages/LeaderboardPage'
import NotFoundPage from './pages/NotFoundPage'

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

          {/* Player profile (shows inline login prompt when logged out) */}
          <Route path="/profile" element={<ProfilePage />} />

          {/* 404 catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
