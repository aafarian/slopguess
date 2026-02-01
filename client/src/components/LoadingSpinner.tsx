/**
 * LoadingSpinner -- centered CSS-only spinner with optional message.
 *
 * Usage:
 *   <LoadingSpinner />
 *   <LoadingSpinner message="Loading round..." />
 */

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner-container">
      <div className="loading-spinner" />
      {message && <p className="loading-spinner-message">{message}</p>}
    </div>
  );
}
