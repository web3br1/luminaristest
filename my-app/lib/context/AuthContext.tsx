import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef } from 'react';
import { deleteCookie, getCookie } from 'cookies-next';
import { useRouter } from 'next/router';
import type { Role } from '../../types/Role';

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
  const isCheckingRef = useRef(false);

  // Check initial auth state (e.g., by calling a /api/me endpoint)
  // This ensures the state is correct even after a page refresh.
  const checkAuthState = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsLoading(true);
    try {
      const token = getCookie('auth_token');

      // Sanitize token
      let sanitizedToken = typeof token === 'string' ? token.trim() : '';
      if (sanitizedToken.startsWith('"') && sanitizedToken.endsWith('"')) {
        sanitizedToken = sanitizedToken.substring(1, sanitizedToken.length - 1);
      }

      if (!sanitizedToken) {
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/me`, {
        headers: {
          'authorization': `Bearer ${sanitizedToken}`
        }
      });
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
      isCheckingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Verificar o estado de autenticação ao montar o componente
  useEffect(() => {
    checkAuthState();
  }, [checkAuthState]);

  // Sync Next.js locale with the user's saved preference
  useEffect(() => {
    if (user?.locale && user.locale !== router.locale) {
      router.replace(router.asPath, router.asPath, { locale: user.locale });
    }
  }, [user?.locale, router]);

  // Verificar o estado de autenticação quando a rota mudar
  useEffect(() => {
    const handleRouteChange = () => {
      checkAuthState();
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
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/logout`, { method: 'POST' });
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