import { client } from './client';

export interface PremiumStatus {
  is_premium: boolean;
  premium_granted_at?: string;
  premium_expires_at?: string;
}

export const premiumApi = {
  status: () =>
    client.get<PremiumStatus>('/premium/status'),

  request: () =>
    client.post<{ status: string; message: string }>('/premium/request', {}),

  // Admin
  adminSet: (userId: number, isPremium: boolean, expiresAt?: string) =>
    client.patch<{ message: string; is_premium: boolean }>(`/admin/users/${userId}/premium`, {
      is_premium: isPremium,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    }),
};
