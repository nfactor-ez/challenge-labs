import { client } from './client';

export interface PublicSettings {
  leaderboard_enabled: boolean;
}

export interface SiteSetting {
  key: string;
  value: string;
}

export const settingsApi = {
  // Public — no auth needed
  public: () => client.get<PublicSettings>('/settings'),

  // Admin only
  list: () => client.get<{ settings: SiteSetting[] }>('/admin/settings'),
  update: (key: string, value: string) =>
    client.patch<{ key: string; value: string }>(`/admin/settings/${key}`, { value }),
};
