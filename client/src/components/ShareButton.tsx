/**
 * ShareButton -- social sharing component with multiple share targets.
 *
 * Supports two modes:
 *  1. **Game result mode** (roundId + userId): shares a game score with link to score card.
 *     Uses getShareMetadata() API for pre-built share URL and text.
 *  2. **Profile mode** (profileUsername): shares a public profile link.
 *
 * Share targets:
 *  - "Copy Link": copies the share URL to clipboard with "Copied!" feedback
 *  - "Share on X": opens Twitter/X tweet intent with pre-filled text
 *  - "Copy for Discord": copies a markdown-formatted message for pasting into Discord
 *  - "Share" (mobile): uses Web Share API when available
 *
 * Usage:
 *   <ShareButton score={85} rank={3} totalGuesses={15} roundId="abc123" userId="user456" />
 *   <ShareButton profileUsername="alice" />
 */

import { useCallback, useEffect, useState } from 'react';
import { getShareMetadata } from '../services/game';
import type { ShareMetadata } from '../types/game';

/** Props for game result sharing mode. */
interface GameShareProps {
  score: number;
  rank: number;
  totalGuesses: number;
  roundId: string;
  userId: string;
  profileUsername?: never;
}

/** Props for profile sharing mode. */
interface ProfileShareProps {
  profileUsername: string;
  score?: never;
  rank?: never;
  totalGuesses?: never;
  roundId?: never;
  userId?: never;
}

type ShareButtonProps = GameShareProps | ProfileShareProps;

const TOAST_DURATION_MS = 2000;

function buildFallbackShareUrl(roundId: string, userId: string): string {
  return `${window.location.origin}/rounds/${roundId}?player=${userId}`;
}

function buildFallbackShareText(score: number, rank: number, totalGuesses: number): string {
  return `I scored ${score}/100 on SlopGuesser! Ranked #${rank} of ${totalGuesses}. Can you beat me?`;
}

function buildProfileShareUrl(username: string): string {
  return `${window.location.origin}/u/${username}`;
}

function buildProfileShareText(username: string): string {
  return `Check out ${username}'s profile on SlopGuesser!`;
}

export default function ShareButton(props: ShareButtonProps) {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('Copied to clipboard!');
  const [metadata, setMetadata] = useState<ShareMetadata | null>(null);

  const isProfileMode = 'profileUsername' in props && !!props.profileUsername;

  // Fetch share metadata from API for game result mode
  useEffect(() => {
    if (isProfileMode || !props.roundId) return;
    let cancelled = false;
    getShareMetadata(props.roundId)
      .then((data) => {
        if (!cancelled) setMetadata(data);
      })
      .catch(() => {
        // Non-critical -- fall back to local URL construction
      });
    return () => { cancelled = true; };
  }, [isProfileMode, props.roundId]);

  // Resolve share URL and text based on mode
  const shareUrl = isProfileMode
    ? buildProfileShareUrl(props.profileUsername!)
    : metadata?.shareUrl ?? buildFallbackShareUrl(props.roundId!, props.userId!);

  const shareText = isProfileMode
    ? buildProfileShareText(props.profileUsername!)
    : metadata
      ? `${metadata.title} ${metadata.description}`
      : buildFallbackShareText(props.score!, props.rank!, props.totalGuesses!);

  const shareTitle = isProfileMode
    ? `${props.profileUsername} on SlopGuesser`
    : metadata?.title ?? 'SlopGuesser';

  // --- Handlers ---

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), TOAST_DURATION_MS);
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Copied!');
    } catch {
      // Fallback: silently fail if clipboard API is unavailable
    }
  }, [shareUrl, showToast]);

  const handleShareTwitter = useCallback(() => {
    const tweetText = encodeURIComponent(shareText);
    const tweetUrl = encodeURIComponent(shareUrl);
    const intentUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
  }, [shareText, shareUrl]);

  const handleCopyDiscord = useCallback(async () => {
    try {
      const discordText = `${shareText}\n${shareUrl}`;
      await navigator.clipboard.writeText(discordText);
      showToast('Copied for Discord!');
    } catch {
      // Fallback: silently fail if clipboard API is unavailable
    }
  }, [shareText, shareUrl, showToast]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
    } catch {
      // User cancelled or share failed -- no action needed
    }
  }, [shareTitle, shareText, shareUrl]);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="share-button">
      <div className="share-button__actions">
        {/* On mobile, show native share as the primary action */}
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

        <button
          type="button"
          className="btn btn-outline btn-sm share-button__btn share-button__btn--discord"
          onClick={handleCopyDiscord}
          aria-label="Copy formatted message for Discord"
        >
          <svg
            className="share-button__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
          </svg>
          Copy for Discord
        </button>
      </div>

      {toastVisible && (
        <div className="share-button__toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
