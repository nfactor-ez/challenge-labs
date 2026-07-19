import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { settingsApi, type PublicSettings } from '../api/settings';

interface SettingsContextValue {
  settings: PublicSettings;
  reload: () => void;
}

const DEFAULT: PublicSettings = {
  leaderboard_enabled: true,
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT,
  reload: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULT);

  const load = () => {
    settingsApi.public()
      .then(setSettings)
      .catch(() => setSettings(DEFAULT)); // fallback: show everything
  };

  useEffect(() => { load(); }, []);

  return (
    <SettingsContext.Provider value={{ settings, reload: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
