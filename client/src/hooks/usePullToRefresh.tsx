/**
 * Pull-to-refresh hook and provider.
 *
 * The provider renders the pull indicator and handles touch events on
 * the scrollable `.main-content` container. When the user pulls past
 * the threshold, it calls the registered refresh handler — or falls
 * back to a full page reload if no handler is registered.
 *
 * Pages can optionally call `usePullToRefresh(refreshFn)` to register
 * a custom handler (e.g. re-fetch data without a full reload).
 *
 * Mobile only — disabled on devices that don't support touch.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type RefreshFn = () => Promise<void>;

interface PullToRefreshContextValue {
  /** Called by pages to register their refresh handler. */
  setRefreshHandler: (fn: RefreshFn | null) => void;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue>({
  setRefreshHandler: () => {},
});

// ---------------------------------------------------------------------------
// Hook — pages call this
// ---------------------------------------------------------------------------

/**
 * Register a pull-to-refresh handler for the current page.
 * The handler is automatically removed on unmount.
 */
export function usePullToRefresh(onRefresh: RefreshFn) {
  const { setRefreshHandler } = useContext(PullToRefreshContext);

  useEffect(() => {
    setRefreshHandler(onRefresh);
    return () => setRefreshHandler(null);
  }, [onRefresh, setRefreshHandler]);
}

// ---------------------------------------------------------------------------
// Provider — wraps <main> content in Layout
// ---------------------------------------------------------------------------

const PULL_THRESHOLD = 80; // px the user must pull before triggering refresh
const MAX_PULL = 130; // cap the visual pull distance

export function PullToRefreshProvider({
  scrollRef,
  children,
}: {
  /** Ref to the scrollable container (.main-content). */
  scrollRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const refreshFnRef = useRef<RefreshFn | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Touch tracking refs (avoid state for perf during touchmove)
  const startYRef = useRef(0);
  const pullingRef = useRef(false);

  const setRefreshHandler = useCallback((fn: RefreshFn | null) => {
    refreshFnRef.current = fn;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Only enable on touch devices
    if (!("ontouchstart" in window)) return;

    function onTouchStart(e: TouchEvent) {
      // Only start tracking if scrolled to top and not already refreshing
      if (el!.scrollTop > 0 || refreshing) return;
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pullingRef.current) return;

      const dy = e.touches[0].clientY - startYRef.current;

      // If pulling up or scrolled past top, stop tracking
      if (dy <= 0) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }

      // Dampen the pull (feels more natural)
      const dampened = Math.min(dy * 0.5, MAX_PULL);
      setPullDistance(dampened);

      // Prevent native scroll/bounce while pulling
      if (el!.scrollTop === 0 && dy > 10) {
        e.preventDefault();
      }
    }

    function onTouchEnd() {
      if (!pullingRef.current) return;
      pullingRef.current = false;

      if (pullDistance >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPullDistance(PULL_THRESHOLD); // hold at threshold during refresh

        const handler = refreshFnRef.current ?? (() => {
          // Default: full page reload
          window.location.reload();
          return new Promise<void>(() => {}); // never resolves (page reloads)
        });

        handler().finally(() => {
          setRefreshing(false);
          setPullDistance(0);
        });
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [scrollRef, refreshing, pullDistance]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const showIndicator = pullDistance > 0 || refreshing;

  return (
    <PullToRefreshContext.Provider value={{ setRefreshHandler }}>
      {showIndicator && (
        <div
          className="ptr-indicator"
          style={{ transform: `translateY(${pullDistance - 40}px)` }}
        >
          <div
            className={`ptr-spinner ${refreshing ? "ptr-spinner--active" : ""}`}
            style={
              refreshing ? undefined : { transform: `rotate(${progress * 360}deg)`, opacity: progress }
            }
          />
        </div>
      )}
      <div
        className="ptr-content"
        style={
          showIndicator
            ? { transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? "transform 0.3s ease" : "none" }
            : undefined
        }
      >
        {children}
      </div>
    </PullToRefreshContext.Provider>
  );
}
