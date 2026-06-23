import { client } from './client';
import type { Challenge, LeaderboardEntry, UserProgress } from './types';

export const challengesApi = {
  list: () => client.get<{ challenges: Challenge[]; total: number }>('/challenges'),

  get: (id: number | string) =>
    client.get<{ challenge: Challenge; progress: UserProgress | null }>(`/challenges/${id}`),

  submitFlag: (id: number | string, flag: string) =>
    client.post<{ correct: boolean; message: string; points?: number }>(
      `/challenges/${id}/submit`,
      { flag }
    ),

  leaderboard: (limit = 50) =>
    client.get<{ leaderboard: LeaderboardEntry[]; total: number }>(
      `/leaderboard?limit=${limit}`
    ),
};
