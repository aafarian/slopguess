/**
 * EmptyState -- centered placeholder for empty content areas.
 *
 * Usage:
 *   <EmptyState message="No rounds yet." />
 *   <EmptyState title="Nothing here" message="Check back later." />
 */

interface EmptyStateProps {
  title?: string;
  message: string;
}

export default function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="empty-state-container">
      {title && <h3 className="empty-state-title">{title}</h3>}
      <p className="empty-state-message">{message}</p>
    </div>
  );
}
