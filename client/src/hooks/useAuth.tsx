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
import { getToken } from '../services/api';

interface AuthContextValue {
  /** The currently authenticated user, or null. */
  user: User | null;
  /** True while the initial token validation is in flight. */
  isLoading: boolean;
  /** Convenience boolean derived from user !== null. */
  isAuthenticated: boolean;
  /** Register a new account. Throws on failure. */
  register: (username: string, email: string, password: string) => Promise<void>;
  /** Log in. Throws on failure. */
  login: (email: string, password: string) => Promise<void>;
  /** Log out (synchronous). */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, validate any stored token
  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      const currentUser = await authService.getMe();
      if (!cancelled) {
        setUser(currentUser);
        setIsLoading(false);
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

  const login = useCallback(async (email: string, password: string) => {
    const loggedInUser = await authService.login(email, password);
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
