import { apiClient } from '../api/api-client';
import { IUser } from '../../types/User';

interface LoginFormData {
  email: string;
  password: string;
}

interface SignupFormData {
  email: string;
  password: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Authentication Service (Client-side).
 * Handles login, signup, and potentially logout/refresh logic.
 */
export const AuthService = {
  /**
   * Performs user login.
   * Returns the user object and the JWT token.
   */
  async login(formData: LoginFormData): Promise<{ data: { user: IUser; token: string } }> {
    return apiClient.post<{ data: { user: IUser; token: string } }>('/auth/login', formData);
  },

  /**
   * Performs user registration (signup).
   */
  async signup(formData: SignupFormData): Promise<{ data: { user: IUser; token: string } }> {
    return apiClient.post<{ data: { user: IUser; token: string } }>('/users', formData);
  },
};
