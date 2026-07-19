import { client } from './client';
import type { AdminStats, Challenge, User } from './types';

interface ChallengeFormData {
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  points: number;
  docker_image: string;
  flag: string;
  tags: string;
  category_id: number;
  is_published: boolean;
  is_premium: boolean;
  tasks?: Array<{
    order: number;
    title: string;
    description: string;
    is_required: boolean;
  }>;
}

export const adminApi = {
  stats: () => client.get<AdminStats>('/admin/stats'),

  listUsers: (page = 1, pageSize = 20) =>
    client.get<{ users: User[]; total: number; page: number; page_size: number }>(
      `/admin/users?page=${page}&page_size=${pageSize}`
    ),

  getUser: (id: number) => client.get<{ user: User }>(`/admin/users/${id}`),

  setRole: (id: number, role: 'user' | 'admin') =>
    client.patch<{ user: User }>(`/admin/users/${id}/role`, { role }),

  setUserPassword: (id: number, newPassword: string) =>
    client.patch<{ message: string }>(`/admin/users/${id}/password`, { new_password: newPassword }),

  setUserPremium: (id: number, isPremium: boolean, expiresAt?: string) =>
    client.patch<{ message: string; is_premium: boolean }>(`/admin/users/${id}/premium`, {
      is_premium: isPremium,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    }),

  createChallenge: (data: ChallengeFormData) =>
    client.post<{ challenge: Challenge }>('/admin/challenges', data),

  updateChallenge: (id: number, data: ChallengeFormData) =>
    client.put<{ challenge: Challenge }>(`/admin/challenges/${id}`, data),

  deleteChallenge: (id: number) =>
    client.delete<{ message: string }>(`/admin/challenges/${id}`),
};
