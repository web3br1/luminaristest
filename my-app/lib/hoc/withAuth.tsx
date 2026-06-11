import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../../types/Role';

interface WithAuthProps {
  // Props from the wrapped component can be defined here if needed by the HOC itself
}

export type AllowedRole = Role | 'PUBLIC' | 'AUTHENTICATED_USER';

export interface AuthOptions {
  allowedRoles?: AllowedRole[];
  redirectIfAuthenticated?: string; // e.g., for login/register pages
}

// Função auxiliar movida para fora do bloco
function isUserSpecificRole(r: AllowedRole): boolean {
  return r !== 'PUBLIC' && r !== 'AUTHENTICATED_USER';
}

export default function withAuth<P extends WithAuthProps>(
  WrappedComponent: React.ComponentType<P>,
  options: AuthOptions = {}
) {
  const { allowedRoles = ['AUTHENTICATED_USER'], redirectIfAuthenticated } = options;

  function ComponentWithAuth(props: P): React.ReactElement | null {
    const router = useRouter();
    const { user, isAuthenticated, isLoading } = useAuth();

    function authEffect() {
      if (isLoading) {
        return;
      }

      if (redirectIfAuthenticated && isAuthenticated) {
        router.push(redirectIfAuthenticated);
        return;
      }

      if (!redirectIfAuthenticated) {
        if (!isAuthenticated) {
          if (allowedRoles.includes('PUBLIC')) {
            return;
          } else {
            router.push('/users/login');
            return;
          }
        } else {
          if (allowedRoles.includes('AUTHENTICATED_USER')) {
            return;
          }
          
          const userSpecificRolesRequired = allowedRoles.filter(isUserSpecificRole) as Role[];

          if (userSpecificRolesRequired.length > 0) {
            const hasRequiredRole = user && userSpecificRolesRequired.includes(user.role);

            if (hasRequiredRole) {
              return;
            } else {
              router.push('/');
              return;
            }
          } else if (allowedRoles.includes('PUBLIC')) {
            return;
          } else {
            router.push('/');
            return;
          }
        }
      }
    }
    useEffect(authEffect, [isLoading, isAuthenticated, user, router, allowedRoles, redirectIfAuthenticated]);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl font-semibold text-gray-700 dark:text-gray-200">Authenticating...</div>
        </div>
      );
    }

    if (redirectIfAuthenticated && isAuthenticated) {
        return null;
    }

    if (!redirectIfAuthenticated && !isAuthenticated && !allowedRoles.includes('PUBLIC')) {
        return null;
    }

    if (!redirectIfAuthenticated && isAuthenticated && user) {
        if (allowedRoles.includes('AUTHENTICATED_USER')) {
          // Allowed for any authenticated user
        } else {
            const userSpecificRolesRequired = allowedRoles.filter(isUserSpecificRole) as Role[];
            
            if (userSpecificRolesRequired.length > 0 && !userSpecificRolesRequired.includes(user.role)) {
                return null; 
            }
            else if (userSpecificRolesRequired.length === 0 && !allowedRoles.includes('PUBLIC') && !allowedRoles.includes('AUTHENTICATED_USER')) {
                 return null; 
            }
        }
    }

    return <WrappedComponent {...props} />;
  }

  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  ComponentWithAuth.displayName = `withAuth(${displayName})`;

  return ComponentWithAuth;
} 