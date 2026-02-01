/**
 * Layout component with navigation bar.
 *
 * Shows:
 *  - App title (links to home / game)
 *  - Nav links: Play, History, Profile (auth only)
 *  - Login / Register links when logged out
 *  - Username + Logout button when logged in
 *
 * Uses NavLink for active link highlighting.
 */

import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              to="/profile"
              className={({ isActive }) =>
                `navbar-nav-link ${isActive ? 'navbar-nav-link--active' : ''}`
              }
              onClick={closeMobileMenu}
            >
              Profile
            </NavLink>
          </nav>

          {/* Auth section */}
          <div className="navbar-auth">
            {isAuthenticated ? (
              <>
                <span className="navbar-user">
                  {user?.username}
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
