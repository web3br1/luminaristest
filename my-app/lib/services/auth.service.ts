import { apiClient } from '../api/api-client';
import { IUser } from '../../types/User';

/**
 * Authentication Service (Client-side).
 * Handles login, signup, and potentially logout/refresh logic.
 */
export const AuthService = {
  /**
   * Performs user login.
   * Returns the user object and the JWT token.
   */
  async login(formData: any): Promise<{ data: { user: IUser; token: string } }> {
    return apiClient.post<{ data: { user: IUser; token: string } }>('/auth/login', formData);
  },

  /**
   * Performs user registration (signup).
   */
  async signup(formData: any): Promise<{ data: { user: IUser; token: string } }> {
    return apiClient.post<{ data: { user: IUser; token: string } }>('/users', formData);
  },
};
