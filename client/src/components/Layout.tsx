/**
 * Layout component with navigation bar.
 *
 * Nav structure:
 *  - Play, History, Leaderboards (top-level)
 *  - "Social" dropdown: Friends, Challenges, Messages (auth only)
 *  - Username dropdown: Profile, Achievements, Upgrade, Logout (auth only)
 *  - Login / Register when logged out
 *
 * Uses NavLink for active link highlighting.
 */

import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { fetchXPStatus } from '../services/achievements';
import NotificationBell from './NotificationBell';
import ProBadge from './ProBadge';

/** Paths that should mark the Social dropdown as active. */
const SOCIAL_PATHS = ['/friends', '/challenges', '/group-challenges', '/messages', '/activity'];

/** Paths that should mark the Account dropdown as active. */
const ACCOUNT_PATHS = ['/profile', '/achievements', '/pricing'];

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isPro, monetizationEnabled } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userLevel, setUserLevel] = useState<number | null>(null);

  // Dropdown open state
  const [openDropdown, setOpenDropdown] = useState<'social' | 'account' | null>(null);
  const socialRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Fetch the user's level for the header badge
  useEffect(() => {
    if (!isAuthenticated) {
      setUserLevel(null);
      return;
    }
    fetchXPStatus()
      .then((status) => setUserLevel(status.level))
      .catch(() => {/* Non-critical */});
  }, [isAuthenticated]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        socialRef.current?.contains(target) ||
        accountRef.current?.contains(target)
      ) {
        return;
      }
      setOpenDropdown(null);
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [openDropdown]);

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
    logout();
    navigate('/');
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
    setOpenDropdown(null);
  }

  function toggleDropdown(name: 'social' | 'account') {
    setOpenDropdown((prev) => (prev === name ? null : name));
  }

  const isSocialActive = SOCIAL_PATHS.some((p) => location.pathname.startsWith(p));
  const isAccountActive = ACCOUNT_PATHS.some((p) => location.pathname.startsWith(p));

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
          {/* Primary nav links */}
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

            {/* Social dropdown (auth only) */}
            {isAuthenticated && (
              <div
                className="navbar-dropdown-wrapper"
                ref={socialRef}
              >
                <button
                  type="button"
                  className={`navbar-nav-link navbar-dropdown-trigger${isSocialActive ? ' navbar-nav-link--active' : ''}`}
                  onClick={() => toggleDropdown('social')}
                  aria-expanded={openDropdown === 'social'}
                >
                  Social
                  <span className="navbar-dropdown-arrow" aria-hidden="true" />
                </button>
                {openDropdown === 'social' && (
                  <div className="navbar-dropdown-menu">
                    <NavLink
                      to="/friends"
                      className={({ isActive }) =>
                        `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                      }
                    >
                      Friends
                    </NavLink>
                    <NavLink
                      to="/challenges"
                      className={({ isActive }) =>
                        `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                      }
                    >
                      Challenges
                    </NavLink>
                    <NavLink
                      to="/group-challenges"
                      className={({ isActive }) =>
                        `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                      }
                    >
                      Group Challenges
                    </NavLink>
                    <NavLink
                      to="/messages"
                      className={({ isActive }) =>
                        `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                      }
                    >
                      Messages
                    </NavLink>
                    <NavLink
                      to="/activity"
                      className={({ isActive }) =>
                        `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                      }
                    >
                      Activity
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Auth section */}
          <div className="navbar-auth">
            {isAuthenticated ? (
              <>
                <NotificationBell />

                {/* Account dropdown */}
                <div
                  className="navbar-dropdown-wrapper"
                  ref={accountRef}
                >
                  <button
                    type="button"
                    className={`navbar-account-trigger${isAccountActive ? ' navbar-account-trigger--active' : ''}`}
                    onClick={() => toggleDropdown('account')}
                    aria-expanded={openDropdown === 'account'}
                  >
                    <span className="navbar-account-icon" aria-hidden="true">&#9679;</span>
                    <span className="navbar-account-name">{user?.username}</span>
                    {userLevel !== null && (
                      <span className="navbar-level-badge">Lv.&nbsp;{userLevel}</span>
                    )}
                    {monetizationEnabled && <ProBadge isPro={isPro} />}
                    <span className="navbar-dropdown-arrow" aria-hidden="true" />
                  </button>
                  {openDropdown === 'account' && (
                    <div className="navbar-dropdown-menu navbar-dropdown-menu--right">
                      <NavLink
                        to="/profile"
                        className={({ isActive }) =>
                          `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                        }
                      >
                        Profile
                      </NavLink>
                      <NavLink
                        to="/achievements"
                        className={({ isActive }) =>
                          `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                        }
                      >
                        Achievements
                      </NavLink>
                      {monetizationEnabled && (
                        <NavLink
                          to="/pricing"
                          className={({ isActive }) =>
                            `navbar-dropdown-item${isActive ? ' navbar-dropdown-item--active' : ''}`
                          }
                        >
                          {isPro ? 'Pro Plan' : 'Upgrade'}
                        </NavLink>
                      )}
                      <div className="navbar-dropdown-divider" />
                      <button
                        type="button"
                        className="navbar-dropdown-item navbar-dropdown-item--danger"
                        onClick={handleLogout}
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
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
