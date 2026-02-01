/**
 * Shared auth-related types used across the frontend.
 */

/** Public user object returned by the API (mirrors server PublicUser). */
export interface User {
  id: string;
  username: string;
  email: string;
  created_at: string;
  updated_at: string;
}

/** Shape of a successful auth response (login or register). */
export interface AuthResponse {
  user: User;
  token: string;
}

/** Shape of the /api/auth/me response. */
export interface MeResponse {
  user: User;
}

/** Shape of an API error response from the backend. */
export interface ApiError {
  error: {
    message: string;
    code: string;
    details?: Array<{ field: string; message: string }>;
  };
}
