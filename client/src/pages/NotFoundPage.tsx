import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <h1 className="not-found-code">404</h1>
        <p className="not-found-message">
          This page doesn't exist. It may have been moved or the URL is incorrect.
        </p>
        <div className="not-found-actions">
          <Link to="/" className="btn btn-primary">
            Go to Game
          </Link>
          <Link to="/history" className="btn btn-outline">
            View History
          </Link>
        </div>
      </div>
    </div>
  );
}
