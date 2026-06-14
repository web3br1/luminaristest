import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef } from 'react';
import { deleteCookie, getCookie } from 'cookies-next';
import { useRouter } from 'next/router';
import type { Role } from '../../types/Role';

// API base URL — mirrors apiClient's fallback so auth works even when the
// NEXT_PUBLIC_API_BASE_URL env var is unset (prevents a stuck "Authenticating…").
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

// Type for the user object stored in context
interface AuthUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  currency: string;
}

// Type for the context value
interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean; // To handle initial auth state check
  login: (userData: AuthUser) => void;
  logout: () => void;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading
  const router = useRouter();
  const isMountedRef = useRef(true);
  const localeSyncedRef = useRef(false);

  // Check initial auth state (e.g., by calling a /api/me endpoint)
  // This ensures the state is correct even after a page refresh.
  const checkAuthState = useCallback(async (options?: { silent?: boolean }) => {
    // `silent` re-validations (on route change) must NOT toggle the global
    // loading gate — otherwise every navigation flashes "Authenticating…" and,
    // combined with the locale-sync redirect, can keep the spinner up forever.
    const silent = options?.silent ?? false;
    if (!silent) setIsLoading(true);
    // Backstop: a hung/blocked request must never leave the UI stuck on
    // "Authenticating…". Abort after 8s so `finally` always resolves isLoading.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const token = getCookie('auth_token');

      // Sanitize token
      let sanitizedToken = typeof token === 'string' ? token.trim() : '';
      if (sanitizedToken.startsWith('"') && sanitizedToken.endsWith('"')) {
        sanitizedToken = sanitizedToken.substring(1, sanitizedToken.length - 1);
      }

      if (!sanitizedToken) {
        if (isMountedRef.current) setUser(null);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          'authorization': `Bearer ${sanitizedToken}`
        },
        signal: controller.signal,
      });
      if (!isMountedRef.current) return;
      if (response.ok) {
        const { data: userData } = await response.json();
        setUser({
          id: userData.id,
          username: userData.username,
          email: userData.email,
          name: userData.name || '',
          role: userData.role,
          locale: userData.locale || 'en',
          currency: userData.currency || 'BRL',
        });
      } else {
        setUser(null);
        if (response.status === 401) {
          deleteCookie('auth_token', { path: '/' });
        }
      }
    } catch (error) {
      console.error("Failed to fetch auth state:", error);
      setUser(null);
    } finally {
      clearTimeout(timeout);
      // Unconditional: the initial check MUST resolve or the UI sticks on
      // "Authenticating…". Silent re-checks never touched isLoading, so leave it.
      if (!silent) setIsLoading(false);
    }
  }, []);

  // Verificar o estado de autenticação ao montar o componente
  useEffect(() => {
    isMountedRef.current = true;
    checkAuthState();
    return () => {
      isMountedRef.current = false;
    };
  }, [checkAuthState]);

  // Sync Next.js locale with the user's saved preference.
  // Guarded so it attempts the replace ONCE per mismatch — `router.replace` with a
  // locale that doesn't actually switch (no-op) would otherwise loop forever
  // (replace → routeChangeComplete → re-render → replace → …), keeping the UI busy.
  useEffect(() => {
    if (!user?.locale || user.locale === router.locale) {
      localeSyncedRef.current = false;
      return;
    }
    if (localeSyncedRef.current) return;
    localeSyncedRef.current = true;
    router.replace(router.asPath, router.asPath, { locale: user.locale });
  }, [user?.locale, router]);

  // Verificar o estado de autenticação quando a rota mudar
  useEffect(() => {
    const handleRouteChange = () => {
      // Re-validate silently — never re-trigger the global "Authenticating…" gate
      // on navigation (that, plus locale-sync, was the perpetual-spinner bug).
      checkAuthState({ silent: true });
    };

    router.events.on('routeChangeComplete', handleRouteChange);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router.events, checkAuthState]);

  const login = (userData: AuthUser) => {
    setUser(userData);
    // Redirect is handled by the login page itself after calling this
  };

  const logout = async () => {
    setUser(null);
    try {
      // Call API to clear cookie server-side
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' });
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    // Ensure cookie is cleared client-side as fallback
    deleteCookie('auth_token', { path: '/' });
    // Redirect to login after state is updated
    router.push('/users/login');
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 