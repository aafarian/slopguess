/**
 * JWT authentication middleware.
 *
 * - `requireAuth`  — rejects unauthenticated requests with 401.
 * - `optionalAuth` — attaches user if a valid token is present but
 *                    does NOT reject the request when no token is provided.
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types/express";

/**
 * Extract Bearer token from the Authorization header.
 * Returns null when the header is missing or malformed.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7); // strip "Bearer "
}

/**
 * Verify a JWT string and return the decoded payload.
 * Returns null when the token is invalid or expired.
 */
function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      username: string;
    };
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}

/**
 * Middleware that **requires** a valid JWT.
 * Attaches `req.user` on success; responds with 401 on failure.
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      error: { message: "Unauthorized", code: "AUTH_REQUIRED" },
    });
    return;
  }

  const user = verifyToken(token);

  if (!user) {
    res.status(401).json({
      error: { message: "Unauthorized", code: "INVALID_TOKEN" },
    });
    return;
  }

  req.user = user;
  next();
}

/**
 * Middleware that **optionally** attaches user info from a valid JWT.
 * Never rejects the request — simply sets `req.user` to `undefined`
 * when no token is present or the token is invalid.
 */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
    }
  }

  next();
}

export { requireAuth, optionalAuth };
