/**
 * Home page — welcome message with current auth status.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <div className="home-page">
      <h1>SlopGuesser</h1>
      <p>A multiplayer AI image guessing game</p>

      {isLoading ? (
        <p className="home-status">Loading...</p>
      ) : isAuthenticated ? (
        <div className="home-status">
          <p>
            Welcome back, <strong>{user?.username}</strong>!
          </p>
          <p className="home-hint">Game rounds coming soon...</p>
        </div>
      ) : (
        <div className="home-status">
          <p>Sign in to start guessing.</p>
          <div className="home-actions">
            <Link to="/login" className="btn btn-primary">
              Login
            </Link>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
