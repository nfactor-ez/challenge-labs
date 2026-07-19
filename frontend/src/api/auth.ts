import { client, setToken } from './client';
import type { User } from './types';

interface AuthResponse {
  token: string;
  user: User;
}

interface MFALoginResponse {
  mfa_required: true;
  temp_token: string;
}

export const authApi = {
  // ── Registration (2-step) ─────────────────────────────────────────────────
  registerRequest: (data: { username: string; email: string; password: string }) =>
    client.post<{ message: string }>('/auth/register/request', data, false),

  registerVerify: (data: { username: string; email: string; password: string; otp: string }) =>
    client.post<AuthResponse>('/auth/register/verify', data, false).then((r) => {
      setToken(r.token);
      return r;
    }),

  // ── Login ─────────────────────────────────────────────────────────────────
  login: (data: { email: string; password: string }) =>
    client.post<AuthResponse | MFALoginResponse>('/auth/login', data, false).then((r) => {
      if ('token' in r) setToken(r.token);
      return r;
    }),

  // ── MFA Login Step ────────────────────────────────────────────────────────
  mfaLoginVerify: (data: { temp_token: string; code: string }) =>
    client.post<AuthResponse>('/auth/mfa/login-verify', data, false).then((r) => {
      setToken(r.token);
      return r;
    }),

  // ── Profile ───────────────────────────────────────────────────────────────
  me: () => client.get<{ user: User }>('/auth/me'),

  updateProfile: (data: { username?: string; avatar_url?: string }) =>
    client.patch<{ user: User }>('/auth/me', data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    client.put<{ message: string }>('/auth/password', data),

  // ── Forgot Password (2-step) ──────────────────────────────────────────────
  forgotPasswordRequest: (data: { email: string }) =>
    client.post<{ message: string }>('/auth/forgot-password/request', data, false),

  forgotPasswordVerify: (data: { email: string; otp: string; new_password: string }) =>
    client.post<{ message: string }>('/auth/forgot-password/verify', data, false),

  // ── MFA Management ────────────────────────────────────────────────────────
  mfaSetup: () =>
    client.post<{ secret: string; otpauth_url: string; mfa_enabled: boolean }>('/auth/mfa/setup', {}),

  mfaEnable: (data: { code: string }) =>
    client.post<{ message: string; mfa_enabled: boolean }>('/auth/mfa/enable', data),

  mfaDisable: (data: { code: string }) =>
    client.post<{ message: string; mfa_enabled: boolean }>('/auth/mfa/disable', data),
};
