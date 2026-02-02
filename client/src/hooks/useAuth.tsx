/**
 * Auth context and hook.
 *
 * Wrap the app in <AuthProvider> and call useAuth() in any component to
 * access the current user, loading state, and login/register/logout actions.
 *
 * On mount the provider checks localStorage for an existing token and
 * validates it against GET /api/auth/me.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '../types/auth';
import * as authService from '../services/auth';
import { getToken, onUnauthorized } from '../services/api';

/**
 * Synchronously decode the JWT payload (middle segment) without signature
 * verification. Returns { userId, username } or null on any failure.
 */
function decodeTokenPayload(token: string): { userId: string; username: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.userId === 'string' && typeof payload.username === 'string') {
      return { userId: payload.userId, username: payload.username };
    }
    return null;
  } catch {
    return null;
  }
}

/** Build an optimistic User object from JWT-decoded fields. */
function optimisticUser(decoded: { userId: string; username: string }): User {
  return {
    id: decoded.userId,
    username: decoded.username,
    email: '',
    created_at: '',
    updated_at: '',
  };
}

interface AuthContextValue {
  /** The currently authenticated user, or null. */
  user: User | null;
  /** True while the initial token validation is in flight. */
  isLoading: boolean;
  /** Convenience boolean derived from user !== null. */
  isAuthenticated: boolean;
  /** Register a new account. Throws on failure. */
  register: (username: string, email: string, password: string) => Promise<void>;
  /** Log in with email or username. Throws on failure. */
  login: (login: string, password: string) => Promise<void>;
  /** Log out (synchronous). */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Synchronously decode any stored JWT so the first render already reflects
  // the correct auth state (no skeleton flash).
  const [initialToken] = useState(() => getToken());
  const [initialDecoded] = useState(() =>
    initialToken ? decodeTokenPayload(initialToken) : null,
  );

  const [user, setUser] = useState<User | null>(
    initialDecoded ? optimisticUser(initialDecoded) : null,
  );
  // If there's no token we're done immediately; otherwise still validate async.
  const [isLoading, setIsLoading] = useState(initialToken !== null);

  // Register the 401 callback so the API layer can clear React state in sync
  useEffect(() => {
    onUnauthorized(() => {
      authService.logout(); // clears localStorage
      setUser(null);        // clears React state
    });
  }, []);

  // On mount, validate any stored token
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const currentUser = await authService.getMe();
        if (!cancelled) {
          setUser(currentUser);
          setIsLoading(false);
        }
      } catch {
        // Network/server error — token may still be valid, just finish loading.
        // The token stays in localStorage so subsequent requests can use it.
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const newUser = await authService.register(username, email, password);
      setUser(newUser);
    },
    [],
  );

  const login = useCallback(async (loginId: string, password: string) => {
    const loggedInUser = await authService.login(loginId, password);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    register,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth state and actions.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
