export type Role = 'USER' | 'ADMIN';

export const Roles = {
  USER: 'USER' as Role,
  ADMIN: 'ADMIN' as Role,
} as const;


