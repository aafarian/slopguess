/**
 * AdBanner -- renders a Google AdSense ad unit.
 *
 * Only renders when monetization is enabled and the user is not Pro.
 * Lazily loads the AdSense script the first time an ad is needed,
 * using the VITE_ADSENSE_CLIENT_ID env var as the client ID.
 */

import { useEffect, useRef } from 'react';
import { useSubscription } from '../hooks/useSubscription';

interface AdBannerProps {
  /** AdSense ad slot ID. */
  slot: string;
  /** AdSense ad format (default: "auto"). */
  format?: string;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID as string | undefined;

/** Track which ad slots have already called adsbygoogle.push() across mounts. */
const pushedSlots = new Set<string>();

/** Whether the AdSense script tag has been injected into the document. */
let scriptLoaded = false;

/**
 * Inject the AdSense script tag once. No-ops on subsequent calls.
 * Only injects when a valid client ID is configured.
 */
function ensureAdSenseScript(): void {
  if (scriptLoaded || !ADSENSE_CLIENT_ID) return;
  scriptLoaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

export default function AdBanner({ slot, format = 'auto' }: AdBannerProps) {
  const { monetizationEnabled, isPro } = useSubscription();
  const adRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!monetizationEnabled || isPro || !ADSENSE_CLIENT_ID) return;
    if (pushedSlots.has(slot)) return;

    ensureAdSenseScript();

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedSlots.add(slot);
    } catch {
      // AdSense script may not be loaded yet or ad blockers active
    }
  }, [monetizationEnabled, isPro, slot]);

  // Don't render ads for Pro users, when monetization is disabled, or when no client ID
  if (!monetizationEnabled || isPro || !ADSENSE_CLIENT_ID) {
    return null;
  }

  return (
    <div className="ad-banner">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-format={format}
        data-ad-slot={slot}
        data-full-width-responsive="true"
      />
    </div>
  );
}
