import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { SubscriptionProvider } from './hooks/useSubscription'
import Layout from './components/Layout'
import GamePage from './pages/GamePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HistoryPage from './pages/HistoryPage'
import ProfilePage from './pages/ProfilePage'
import RoundDetailPage from './pages/RoundDetailPage'
import LeaderboardPage from './pages/LeaderboardPage'
import FriendsPage from './pages/FriendsPage'
import ChallengePage from './pages/ChallengePage'
import ChallengeDetailPage from './pages/ChallengeDetailPage'
import MessagesPage from './pages/MessagesPage'
import PricingPage from './pages/PricingPage'
import SubscriptionSuccessPage from './pages/SubscriptionSuccessPage'
import SubscriptionCancelPage from './pages/SubscriptionCancelPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
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

            {/* Social */}
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/challenges" element={<ChallengePage />} />
            <Route path="/challenges/:challengeId" element={<ChallengeDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />

            {/* Subscription / monetization */}
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/subscription/success" element={<SubscriptionSuccessPage />} />
            <Route path="/subscription/cancel" element={<SubscriptionCancelPage />} />

            {/* 404 catch-all */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </SubscriptionProvider>
    </AuthProvider>
  )
}

export default App
