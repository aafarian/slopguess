/**
 * Auth service — typed wrappers around the /api/auth endpoints.
 */

import { request, setToken, clearToken, ApiRequestError } from './api';
import type { AuthResponse, MeResponse, User } from '../types/auth';

/**
 * Register a new account.
 * Stores the JWT on success and returns the user.
 */
export async function register(
  username: string,
  email: string,
  password: string,
): Promise<User> {
  const data = await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
    skipAuth: true,
  });
  setToken(data.token);
  return data.user;
}

/**
 * Log in with existing credentials (email or username).
 * Stores the JWT on success and returns the user.
 */
export async function login(login: string, password: string): Promise<User> {
  const data = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
    skipAuth: true,
  });
  setToken(data.token);
  return data.user;
}

/**
 * Fetch the currently authenticated user using a stored token.
 * Returns null if the token is invalid (401). Re-throws network/server
 * errors so callers can distinguish "logged out" from "server unreachable".
 */
export async function getMe(): Promise<User | null> {
  try {
    const data = await request<MeResponse>('/api/auth/me');
    return data.user;
  } catch (err) {
    // 401 already handled by api.ts onUnauthorized callback
    if (err instanceof ApiRequestError && err.status === 401) {
      return null;
    }
    // Network/server errors should not silently log the user out
    throw err;
  }
}

/**
 * Log out — clears stored token.
 */
export function logout(): void {
  clearToken();
}
