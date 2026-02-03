/**
 * Layout component with navigation bar.
 *
 * Shows:
 *  - App title (links to home / game)
 *  - Nav links: Play, History, Profile (auth only)
 *  - Social nav links: Friends, Challenges, Messages (auth only)
 *  - NotificationBell (auth only)
 *  - Login / Register links when logged out
 *  - Username + Logout button when logged in
 *
 * Uses NavLink for active link highlighting.
 */

import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { fetchXPStatus } from '../services/achievements';
import NotificationBell from './NotificationBell';
import ProBadge from './ProBadge';

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isPro, monetizationEnabled } = useSubscription();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userLevel, setUserLevel] = useState<number | null>(null);

  // Fetch the user's level for the header badge
  useEffect(() => {
    if (!isAuthenticated) {
      setUserLevel(null);
      return;
    }
    fetchXPStatus()
      .then((status) => setUserLevel(status.level))
      .catch(() => {/* Non-critical — silently ignore */});
  }, [isAuthenticated]);

  function handleLogout() {
    logout();
    setMobileMenuOpen(false);
    navigate('/');
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className="layout">
      <header className="navbar">
        <Link to="/" className="navbar-brand" onClick={closeMobileMenu}>
          Slop Guess
        </Link>

        {/* Hamburger toggle for mobile */}
        <button
          type="button"
          className="navbar-toggle"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label="Toggle navigation"
          aria-expanded={mobileMenuOpen}
        >
          <span className={`navbar-toggle-icon ${mobileMenuOpen ? 'navbar-toggle-icon--open' : ''}`} />
        </button>

        <div className={`navbar-menu ${mobileMenuOpen ? 'navbar-menu--open' : ''}`}>
          {/* Game navigation */}
          <nav className="navbar-nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
              }
              onClick={closeMobileMenu}
            >
              Play
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
              }
              onClick={closeMobileMenu}
            >
              History
            </NavLink>
            <NavLink
              to="/leaderboards"
              className={({ isActive }) =>
                `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
              }
              onClick={closeMobileMenu}
            >
              Leaderboards
            </NavLink>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
              }
              onClick={closeMobileMenu}
            >
              Profile
            </NavLink>

            {/* Social feature links (auth only) */}
            {isAuthenticated && (
              <>
                <NavLink
                  to="/friends"
                  className={({ isActive }) =>
                    `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  Friends
                </NavLink>
                <NavLink
                  to="/challenges"
                  className={({ isActive }) =>
                    `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  Challenges
                </NavLink>
                <NavLink
                  to="/messages"
                  className={({ isActive }) =>
                    `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  Messages
                </NavLink>
                <NavLink
                  to="/achievements"
                  className={({ isActive }) =>
                    `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
                  }
                  onClick={closeMobileMenu}
                >
                  Achievements
                </NavLink>
                {monetizationEnabled && (
                  <NavLink
                    to="/pricing"
                    className={({ isActive }) =>
                      `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
                    }
                    onClick={closeMobileMenu}
                  >
                    {isPro ? <ProBadge isPro /> : 'Upgrade'}
                  </NavLink>
                )}
              </>
            )}
          </nav>

          {/* Auth section */}
          <div className="navbar-auth">
            {isAuthenticated ? (
              <>
                <NotificationBell />
                <span className="navbar-user">
                  {user?.username}
                  {userLevel !== null && (
                    <span className="navbar-level-badge">Lv.&nbsp;{userLevel}</span>
                  )}
                  {monetizationEnabled && <ProBadge isPro={isPro} />}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm btn-outline" onClick={closeMobileMenu}>
                  Login
                </Link>
                <Link to="/register" className="btn btn-sm btn-primary" onClick={closeMobileMenu}>
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
