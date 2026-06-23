import { client, setToken } from './client';
import type { User } from './types';

interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    client.post<AuthResponse>('/auth/register', data, false).then((r) => {
      setToken(r.token);
      return r;
    }),

  login: (data: { email: string; password: string }) =>
    client.post<AuthResponse>('/auth/login', data, false).then((r) => {
      setToken(r.token);
      return r;
    }),

  me: () => client.get<{ user: User }>('/auth/me'),

  updateProfile: (data: { username?: string; avatar_url?: string }) =>
    client.patch<{ user: User }>('/auth/me', data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    client.put<{ message: string }>('/auth/password', data),
};
