/**
 * Layout component with navigation bar.
 *
 * Shows:
 *  - App title (links to home)
 *  - Login / Register links when logged out
 *  - Username + Logout button when logged in
 */

import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="layout">
      <header className="navbar">
        <Link to="/" className="navbar-brand">
          SlopGuesser
        </Link>

        <nav className="navbar-links">
          {isLoading ? null : isAuthenticated ? (
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
              <Link to="/login" className="btn btn-sm btn-outline">
                Login
              </Link>
              <Link to="/register" className="btn btn-sm btn-primary">
                Register
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
