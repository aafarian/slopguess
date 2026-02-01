/**
 * Input sanitization middleware.
 *
 * - Trims whitespace from all string fields in `req.body`.
 * - Strips HTML tags from all string fields.
 * - Enforces maximum field lengths for known fields:
 *     username  -> 30 chars
 *     email     -> 255 chars
 *     password  -> 128 chars
 *     guess     -> 200 chars
 *
 * Apply after body parsing and before route handlers.
 */

import { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Known field length limits
// ---------------------------------------------------------------------------

const FIELD_MAX_LENGTHS: Record<string, number> = {
  username: 30,
  email: 255,
  password: 128,
  guess: 200,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip all HTML/XML tags from a string using a simple regex. */
function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/**
 * Recursively sanitize all string values in a plain object.
 * - Trims whitespace
 * - Strips HTML tags
 * - Truncates known fields to their max length
 */
function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof value === "string") {
    let sanitized = value.trim();
    sanitized = stripHtmlTags(sanitized);

    // Enforce max length for known fields
    const maxLen = FIELD_MAX_LENGTHS[key];
    if (maxLen && sanitized.length > maxLen) {
      sanitized = sanitized.slice(0, maxLen);
    }

    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(String(index), item));
  }

  if (value !== null && typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return value;
}

function sanitizeObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = sanitizeValue(key, val);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that sanitizes `req.body` in place.
 * Should be mounted after `express.json()` / `express.urlencoded()`.
 */
export function sanitizeBody(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body as Record<string, unknown>);
  }
  next();
}
