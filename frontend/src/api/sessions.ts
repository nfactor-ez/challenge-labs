import { client } from './client';
import type { Session, ContainerStats } from './types';

export const sessionsApi = {
  start: (challengeId: number) =>
    client.post<Session>(`/sessions/challenges/${challengeId}/start`, {}),

  terminate: (sessionKey: string) =>
    client.delete<{ message: string }>(`/sessions/${sessionKey}`),

  status: (sessionKey: string) =>
    client.get<Session & { running: boolean }>(`/sessions/${sessionKey}/status`),

  stats: (sessionKey: string) =>
    client.get<ContainerStats>(`/sessions/${sessionKey}/stats`),

  listActive: () =>
    client.get<{ sessions: Session[]; total: number }>('/sessions'),

  reconnect: (challengeId: number) =>
    client.get<Session>(`/sessions/challenges/${challengeId}/reconnect`),
};
