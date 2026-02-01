/**
 * Type augmentation for Express Request.
 * Adds the `user` property that is attached by the auth middleware
 * after JWT verification.
 */

export interface AuthUser {
  userId: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth / optionalAuth middleware. */
      user?: AuthUser;
    }
  }
}
