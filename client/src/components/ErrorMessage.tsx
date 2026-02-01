/**
 * ErrorMessage -- displays an error with an optional retry button.
 *
 * Usage:
 *   <ErrorMessage message="Something went wrong." />
 *   <ErrorMessage message="Failed to load." onRetry={() => refetch()} />
 */

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="error-message-container">
      <p className="error-message-text">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="btn btn-sm btn-outline error-message-retry"
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
