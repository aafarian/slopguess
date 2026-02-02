/**
 * MessagesPage -- direct messaging between friends.
 *
 * Route: /messages (requires authentication)
 *
 * Two views controlled by the `userId` search param:
 *  1. Conversation List (default, no userId) -- all conversations with
 *     partner username, latest message preview, unread badge, and timestamp.
 *  2. Conversation Detail (?userId=X) -- chronological messages between the
 *     current user and the selected partner, with input for sending new
 *     messages and 10-second polling for incoming messages.
 *
 * Redirects to /login if the user is not authenticated.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getConversations,
  getConversation,
  sendMessage,
  markMessageRead,
} from '../services/social';
import type { ConversationPreview, Message } from '../types/social';
import type { Pagination } from '../types/game';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import './MessagesPage.css';

const POLL_INTERVAL_MS = 10_000;
const MESSAGES_PAGE_LIMIT = 30;

/* -----------------------------------------------------------------------
   Helpers
   ----------------------------------------------------------------------- */

/** Truncate a string to `max` characters, appending ellipsis if needed. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\u2026';
}

/** Format an ISO date string into a short readable form. */
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Format a message timestamp for the detail view. */
function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* =======================================================================
   Conversation List View
   ======================================================================= */

function ConversationList() {
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getConversations();
      setConversations(res.conversations);
    } catch {
      setError('Failed to load conversations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Poll for conversation updates
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getConversations();
        setConversations(res.conversations);
      } catch {
        // Silently ignore poll errors
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading conversations..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchConversations} />;
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        message="Start a conversation with one of your friends!"
      />
    );
  }

  return (
    <ul className="messages-conversation-list">
      {conversations.map((conv) => (
        <li key={conv.partnerId} className="messages-conversation-item">
          <Link
            to={`/messages?userId=${conv.partnerId}`}
            className="messages-conversation-link"
          >
            <div className="messages-conversation-avatar">
              {conv.partnerUsername.charAt(0).toUpperCase()}
            </div>

            <div className="messages-conversation-info">
              <div className="messages-conversation-header">
                <span className="messages-conversation-username">
                  {conv.partnerUsername}
                </span>
                <span className="messages-conversation-time">
                  {formatTimestamp(conv.lastMessage.createdAt)}
                </span>
              </div>
              <div className="messages-conversation-preview-row">
                <span className="messages-conversation-preview">
                  {truncate(conv.lastMessage.content, 50)}
                </span>
                {conv.unreadCount > 0 && (
                  <span className="messages-unread-badge">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* =======================================================================
   Conversation Detail View
   ======================================================================= */

interface ConversationDetailProps {
  partnerId: string;
  currentUserId: string;
}

function ConversationDetail({ partnerId, currentUserId }: ConversationDetailProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [partnerUsername, setPartnerUsername] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch messages for the current conversation page. */
  const fetchMessages = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError('');
      try {
        const res = await getConversation(partnerId, targetPage, MESSAGES_PAGE_LIMIT);
        setMessages(res.messages);
        setPagination(res.pagination);

        // Derive partner username from first message from partner
        const partnerMsg = res.messages.find((m) => m.senderId === partnerId);
        if (partnerMsg) {
          setPartnerUsername(partnerMsg.senderUsername);
        }
      } catch {
        setError('Failed to load messages.');
      } finally {
        setLoading(false);
      }
    },
    [partnerId],
  );

  /** Fetch only the latest page for polling (no loading state). */
  const pollMessages = useCallback(async () => {
    try {
      const res = await getConversation(partnerId, 1, MESSAGES_PAGE_LIMIT);
      // Only update if we're still on page 1 (most recent)
      setMessages((prev) => {
        // If user navigated to an older page, skip the poll update
        if (page !== 1) return prev;
        return res.messages;
      });
      setPagination(res.pagination);
    } catch {
      // Silently ignore poll errors
    }
  }, [partnerId, page]);

  // Initial fetch
  useEffect(() => {
    fetchMessages(page);
  }, [page, fetchMessages]);

  // Mark unread messages as read when conversation opens
  useEffect(() => {
    if (messages.length > 0) {
      const unread = messages.filter(
        (m) => !m.read && m.senderId === partnerId,
      );
      for (const msg of unread) {
        markMessageRead(msg.id).catch(() => {
          // Ignore mark-read failures silently
        });
      }
    }
  }, [messages, partnerId]);

  // Set up polling
  useEffect(() => {
    pollRef.current = setInterval(pollMessages, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollMessages]);

  // Scroll to bottom when messages change (on page 1)
  useEffect(() => {
    if (page === 1 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, page]);

  /** Handle sending a new message. */
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || sending) return;

    setSending(true);
    setSendError('');
    try {
      await sendMessage(partnerId, content);
      setNewMessage('');
      // Jump to page 1 and refresh
      setPage(1);
      await fetchMessages(1);
    } catch {
      setSendError('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  // Render messages in chronological order (oldest first)
  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="messages-detail">
      {/* Header with back button */}
      <div className="messages-detail-header">
        <Link to="/messages" className="messages-back-btn">
          &larr; Back
        </Link>
        <h2 className="messages-detail-title">
          {partnerUsername || 'Conversation'}
        </h2>
      </div>

      {/* Load older messages */}
      {pagination && pagination.totalPages > 1 && page < pagination.totalPages && (
        <div className="messages-load-older">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setPage((p) => p + 1)}
          >
            Load older messages
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="messages-detail-body">
        {loading && <LoadingSpinner message="Loading messages..." />}

        {error && (
          <ErrorMessage message={error} onRetry={() => fetchMessages(page)} />
        )}

        {!loading && !error && sortedMessages.length === 0 && (
          <EmptyState
            title="No messages"
            message="Send a message to start the conversation!"
          />
        )}

        {!loading && !error && sortedMessages.length > 0 && (
          <ul className="messages-list">
            {sortedMessages.map((msg) => {
              const isSent = msg.senderId === currentUserId;
              return (
                <li
                  key={msg.id}
                  className={`messages-bubble ${isSent ? 'messages-bubble--sent' : 'messages-bubble--received'}`}
                >
                  <div className="messages-bubble-content">
                    {!isSent && (
                      <span className="messages-bubble-sender">
                        {msg.senderUsername}
                      </span>
                    )}
                    <p className="messages-bubble-text">{msg.content}</p>
                    <span className="messages-bubble-time">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Send message form */}
      <form className="messages-compose" onSubmit={handleSend}>
        {sendError && (
          <p className="messages-compose-error">{sendError}</p>
        )}
        <div className="messages-compose-row">
          <input
            type="text"
            className="messages-compose-input"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={sending}
            maxLength={2000}
          />
          <button
            type="submit"
            className="btn btn-primary messages-compose-send"
            disabled={sending || !newMessage.trim()}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* =======================================================================
   Main Page Component
   ======================================================================= */

export default function MessagesPage() {
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const partnerId = searchParams.get('userId');

  // Auth gate -- show login prompt when not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="messages-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to view your messages.
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Fmessages" className="btn btn-primary">
              Log In
            </Link>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <h1 className="messages-page-title">Messages</h1>

      {partnerId ? (
        <ConversationDetail
          partnerId={partnerId}
          currentUserId={user.id}
        />
      ) : (
        <ConversationList />
      )}
    </div>
  );
}
