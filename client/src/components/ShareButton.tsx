/**
 * ShareButton -- social sharing component with clipboard copy and native share support.
 *
 * Provides three sharing methods:
 *  - "Copy Link" button: copies share URL to clipboard with toast notification
 *  - "Share on X" button: opens Twitter/X tweet intent in new window
 *  - "Share" button: uses Web Share API if available (typically mobile)
 *
 * Usage:
 *   <ShareButton score={85} rank={3} totalGuesses={15} roundId="abc123" userId="user456" />
 */

import { useCallback, useState } from 'react';

interface ShareButtonProps {
  score: number;
  rank: number;
  totalGuesses: number;
  roundId: string;
  userId: string;
}

const TOAST_DURATION_MS = 2000;

function buildShareUrl(roundId: string, userId: string): string {
  return `${window.location.origin}/rounds/${roundId}?player=${userId}`;
}

function buildShareText(score: number, rank: number, totalGuesses: number): string {
  return `I scored ${score}/100 on Slop Guess! Rank #${rank} of ${totalGuesses}. Can you beat me?`;
}

export default function ShareButton({
  score,
  rank,
  totalGuesses,
  roundId,
  userId,
}: ShareButtonProps) {
  const [toastVisible, setToastVisible] = useState(false);

  const shareUrl = buildShareUrl(roundId, userId);
  const shareText = buildShareText(score, rank, totalGuesses);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), TOAST_DURATION_MS);
    } catch {
      // Fallback: silently fail if clipboard API is unavailable
    }
  }, [shareText, shareUrl]);

  const handleShareTwitter = useCallback(() => {
    const tweetText = encodeURIComponent(shareText);
    const tweetUrl = encodeURIComponent(shareUrl);
    const intentUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }, [shareText, shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: 'Slop Guess',
        text: shareText,
        url: shareUrl,
      });
    } catch {
      // User cancelled or share failed -- no action needed
    }
  }, [shareText, shareUrl]);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="share-button">
      <div className="share-button__actions">
        <button
          type="button"
          className="btn btn-outline btn-sm share-button__btn"
          onClick={handleCopyLink}
          aria-label="Copy share link to clipboard"
        >
          <svg
            className="share-button__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy Link
        </button>

        <button
          type="button"
          className="btn btn-outline btn-sm share-button__btn"
          onClick={handleShareTwitter}
          aria-label="Share on X (Twitter)"
        >
          <svg
            className="share-button__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>

        {canNativeShare && (
          <button
            type="button"
            className="btn btn-outline btn-sm share-button__btn"
            onClick={handleNativeShare}
            aria-label="Share using device share menu"
          >
            <svg
              className="share-button__icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
        )}
      </div>

      {toastVisible && (
        <div className="share-button__toast" role="status" aria-live="polite">
          Copied to clipboard!
        </div>
      )}
    </div>
  );
}
