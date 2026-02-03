/**
 * ProBadge -- inline "PRO" badge for premium subscribers.
 *
 * Renders a small, visually distinct label next to a username.
 * Only renders when isPro is true.
 *
 * Usage:
 *   <ProBadge isPro={isPro} />
 */

interface ProBadgeProps {
  isPro: boolean;
}

export default function ProBadge({ isPro }: ProBadgeProps) {
  if (!isPro) return null;

  return (
    <span className="pro-badge">PRO</span>
  );
}
