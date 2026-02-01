/**
 * Auth service — typed wrappers around the /api/auth endpoints.
 */

import { request, setToken, clearToken } from './api';
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
 * Log in with existing credentials.
 * Stores the JWT on success and returns the user.
 */
export async function login(email: string, password: string): Promise<User> {
  const data = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
  setToken(data.token);
  return data.user;
}

/**
 * Fetch the currently authenticated user using a stored token.
 * Returns null if the token is missing or invalid.
 */
export async function getMe(): Promise<User | null> {
  try {
    const data = await request<MeResponse>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Log out — clears stored token.
 */
export function logout(): void {
  clearToken();
}
