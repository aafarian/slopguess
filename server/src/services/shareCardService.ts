/**
 * Share Card Service
 *
 * Generates shareable score cards as HTML pages with Open Graph meta tags
 * for rich link previews on social media platforms (Twitter, Discord, Facebook, etc.).
 *
 * Social media crawlers (Twitterbot, Discordbot, facebookexternalhit, etc.) do NOT
 * execute JavaScript, so the OG tags must be in the initial server-rendered HTML.
 */

/** Common social media bot User-Agent substrings. */
const BOT_USER_AGENTS = [
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "discordbot",
  "slackbot",
  "telegrambot",
  "whatsapp",
  "googlebot",
  "bingbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "embedly",
  "quora link preview",
  "showyoubot",
  "outbrain",
  "pinterest",
  "applebot",
  "vkshare",
  "w3c_validator",
  "redditbot",
];

export interface ShareCardData {
  username: string;
  score: number | null;
  rank: number;
  totalGuesses: number;
  roundImageUrl: string | null;
  roundId: string;
  prompt?: string | null;
}

/**
 * Check if a User-Agent string belongs to a known social media crawler / bot.
 */
export function isBotUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

/**
 * Build the canonical share URL for a user's round result.
 */
export function buildShareUrl(
  baseUrl: string,
  roundId: string,
  userId: string
): string {
  return `${baseUrl}/share/${roundId}/${userId}`;
}

/**
 * Build OG title for a share card.
 */
function buildTitle(username: string, score: number | null): string {
  if (score === null) {
    return `SlopGuesser - ${username} played!`;
  }
  return `SlopGuesser - ${username} scored ${score}!`;
}

/**
 * Build OG description for a share card.
 */
function buildDescription(
  rank: number,
  totalGuesses: number,
  score: number | null
): string {
  if (score === null) {
    return "Can you guess the AI prompt? Play SlopGuesser now!";
  }
  return `Ranked #${rank} of ${totalGuesses} player${totalGuesses === 1 ? "" : "s"}. Can you beat them?`;
}

/**
 * Escape a string for safe inclusion in HTML attribute values.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate a full HTML page with Open Graph meta tags for social sharing.
 *
 * When a social media crawler fetches this page, it will see the OG tags
 * and generate a rich link preview with the title, description, and image.
 *
 * When a human visits, the page includes a redirect to the main app
 * (or shows a simple landing card if the redirect fails).
 */
export function generateShareCardHtml(
  data: ShareCardData,
  options: {
    /** Base URL of the application (e.g. https://slopguesser.com) */
    appBaseUrl: string;
    /** User ID for the share URL */
    userId: string;
  }
): string {
  const title = buildTitle(data.username, data.score);
  const description = buildDescription(data.rank, data.totalGuesses, data.score);
  const shareUrl = buildShareUrl(options.appBaseUrl, data.roundId, options.userId);

  // Use the round image as the OG image for rich previews
  const imageUrl = data.roundImageUrl
    ? data.roundImageUrl.startsWith("http")
      ? data.roundImageUrl
      : `${options.appBaseUrl}${data.roundImageUrl}`
    : null;

  // App deep link — redirect humans to the round page in the SPA
  const appLink = `${options.appBaseUrl}/?round=${data.roundId}`;

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeShareUrl = escapeHtml(shareUrl);
  const safeAppLink = escapeHtml(appLink);
  const safeUsername = escapeHtml(data.username);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>

  <!-- Open Graph Meta Tags -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeShareUrl}">${imageUrl ? `\n  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1024">
  <meta property="og:image:height" content="1024">` : ""}
  <meta property="og:site_name" content="SlopGuesser">

  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">${imageUrl ? `\n  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ""}

  <!-- Redirect humans to the app after a brief delay -->
  <meta http-equiv="refresh" content="2;url=${safeAppLink}">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f23;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #1a1a2e;
      border-radius: 16px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid #2a2a4a;
    }
    .card img {
      width: 100%;
      border-radius: 12px;
      margin-bottom: 1.5rem;
    }
    .logo { font-size: 1.5rem; font-weight: 700; color: #7c3aed; margin-bottom: 0.5rem; }
    .username { font-size: 1.1rem; color: #a78bfa; margin-bottom: 0.25rem; }
    .score { font-size: 2.5rem; font-weight: 800; color: #fbbf24; margin: 0.5rem 0; }
    .rank { font-size: 1rem; color: #9ca3af; margin-bottom: 1.5rem; }
    .cta {
      display: inline-block;
      background: #7c3aed;
      color: white;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      transition: background 0.2s;
    }
    .cta:hover { background: #6d28d9; }
    .redirect-note { font-size: 0.8rem; color: #6b7280; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="AI-generated round image">` : ""}
    <div class="logo">SlopGuesser</div>
    <div class="username">${safeUsername}</div>
    ${data.score !== null ? `<div class="score">${data.score}</div>` : ""}
    <div class="rank">${safeDescription}</div>
    <a href="${safeAppLink}" class="cta">Play Now</a>
    <p class="redirect-note">Redirecting to SlopGuesser...</p>
  </div>
</body>
</html>`;
}
