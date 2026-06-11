import { apiClient } from '../api/api-client';
import { IUser, UpdateUserDto } from '../../types/User';

/**
 * User Management Service (Client-side).
 */
export const UserService = {
  /**
   * Fetches a paginated list of users.
   */
  async getUsers(page: number, limit: number): Promise<{ data: IUser[], pagination: any }> {
    return apiClient.get<{ data: IUser[], pagination: any }>(`/users?page=${page}&limit=${limit}`);
  },

  /**
   * Creates a new user.
   */
  async createUser(payload: Partial<UpdateUserDto>): Promise<IUser> {
    return apiClient.post<IUser>('/users', payload);
  },

  /**
   * Updates a user profile.
   */
  async updateProfile(userId: string, data: Partial<UpdateUserDto>): Promise<IUser> {
    const response = await apiClient.put<{ success: boolean; data?: IUser; id?: string }>(`/users/${userId}`, data);
    return (response as any).data || response;
  },

  /**
   * Fetches a single user by ID.
   */
  async getUserById(userId: string): Promise<IUser> {
    const response = await apiClient.get<{ data: IUser } | IUser>(`/users/${userId}`);
    return (response as any).data || response;
  },

  /**
   * Deletes a user by ID.
   */
  async deleteUser(userId: string): Promise<void> {
    return apiClient.delete(`/users/${userId}`);
  },

  /**
   * Specialized method to change user role (ADMIN test feature).
   */
  async changeRole(userId: string, role: string): Promise<IUser> {
    return this.updateProfile(userId, { role } as any);
  },

  /**
   * Updates the authenticated user's locale/currency preferences.
   */
  async updatePreferences(data: { locale?: string; currency?: string }): Promise<{ success: boolean; data: IUser }> {
    return apiClient.patch('/users/me/preferences', data);
  },
};
