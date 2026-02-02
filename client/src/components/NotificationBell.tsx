/**
 * NotificationBell — bell icon with unread badge and dropdown panel.
 *
 * Features:
 *  - Bell icon with red unread count badge (hidden when 0)
 *  - Dropdown panel with recent notifications
 *  - Type-based icons and navigation on click
 *  - Mark-as-read on notification click
 *  - Polls for unread count every 30 seconds
 *  - Closes dropdown on outside click
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification, NotificationType } from '../types/social';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
} from '../services/social';

/** Polling interval for unread count (ms). */
const POLL_INTERVAL = 30_000;

/** Icon/emoji for each notification type. */
function notificationIcon(type: NotificationType): string {
  switch (type) {
    case 'friend_request':
      return '\u{1F91D}'; // handshake
    case 'friend_accepted':
      return '\u{2705}';  // check mark
    case 'challenge_received':
      return '\u{2694}\uFE0F'; // crossed swords
    case 'challenge_guessed':
      return '\u{1F3AF}'; // bullseye
    case 'new_message':
      return '\u{1F4AC}'; // speech bubble
    default:
      return '\u{1F514}'; // bell
  }
}

/** Human-readable description for a notification. */
function notificationText(notification: Notification): string {
  const data = notification.data as Record<string, string>;
  const from = data.fromUsername ?? data.username ?? 'Someone';

  switch (notification.type) {
    case 'friend_request':
      return `${from} sent you a friend request`;
    case 'friend_accepted':
      return `${from} accepted your friend request`;
    case 'challenge_received':
      return `${from} sent you a challenge`;
    case 'challenge_guessed':
      return `${from} guessed your challenge`;
    case 'new_message':
      return `${from} sent you a message`;
    default:
      return 'New notification';
  }
}

/** Determine the route to navigate to when a notification is clicked. */
function notificationRoute(notification: Notification): string {
  const data = notification.data as Record<string, string>;

  switch (notification.type) {
    case 'friend_request':
    case 'friend_accepted':
      return '/friends';
    case 'challenge_received':
    case 'challenge_guessed':
      return data.challengeId
        ? `/challenges/${data.challengeId}`
        : '/challenges';
    case 'new_message':
      return '/messages';
    default:
      return '/';
  }
}

/** Format a timestamp into a relative time string. */
function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ---- Poll for unread count ----
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { count } = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const id = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchUnreadCount]);

  // ---- Load full notification list when dropdown opens ----
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const { notifications: items } = await getNotifications();
        if (!cancelled) setNotifications(items);
      } catch {
        // Silently ignore
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // ---- Close dropdown on outside click ----
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // ---- Handle notification click ----
  async function handleNotificationClick(notification: Notification) {
    setIsOpen(false);

    // Mark as read optimistically
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await markNotificationRead(notification.id);
      } catch {
        // Best-effort
      }
    }

    navigate(notificationRoute(notification));
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        {/* Bell SVG icon */}
        <svg
          className="notification-bell-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="notification-bell-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-bell-dropdown">
          <div className="notification-bell-dropdown-header">
            <span className="notification-bell-dropdown-title">
              Notifications
            </span>
          </div>

          <div className="notification-bell-dropdown-list">
            {isLoading ? (
              <div className="notification-bell-empty">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-bell-empty">No notifications</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`notification-bell-item${!n.read ? ' notification-bell-item--unread' : ''}`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <span className="notification-bell-item-icon">
                    {notificationIcon(n.type)}
                  </span>
                  <span className="notification-bell-item-body">
                    <span className="notification-bell-item-text">
                      {notificationText(n)}
                    </span>
                    <span className="notification-bell-item-time">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
