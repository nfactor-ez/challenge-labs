import { useEffect, useState } from 'react';
import { ToggleLeft, ToggleRight, Settings } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { LoadingState } from '../../components/ui';
import { settingsApi } from '../../api/settings';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';

interface SettingRow {
  key: string;
  label: string;
  description: string;
  value: boolean;
}

const SETTING_META: Record<string, { label: string; description: string }> = {
  leaderboard_enabled: {
    label: 'Leaderboard',
    description: 'Show or hide the Leaderboard section from the sidebar and navigation for all users.',
  },
};

export function AdminSettingsPage() {
  const { toast } = useToast();
  const { reload } = useSettings();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    settingsApi.list()
      .then(({ settings }) => {
        // Build rows from known keys; use stored value or default true
        const stored = Object.fromEntries(settings.map((s) => [s.key, s.value]));
        const keys = Object.keys(SETTING_META);
        setRows(
          keys.map((key) => ({
            key,
            label: SETTING_META[key].label,
            description: SETTING_META[key].description,
            value: (stored[key] ?? 'true') === 'true',
          }))
        );
      })
      .catch(() => {
        // No settings yet — show defaults
        setRows(
          Object.entries(SETTING_META).map(([key, meta]) => ({
            key,
            label: meta.label,
            description: meta.description,
            value: true,
          }))
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (row: SettingRow) => {
    setSaving(row.key);
    const newVal = !row.value;
    try {
      await settingsApi.update(row.key, String(newVal));
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, value: newVal } : r));
      toast.success(`${row.label} ${newVal ? 'enabled' : 'disabled'}`);
      reload(); // Update sidebar immediately
    } catch {
      toast.error('Failed to save setting');
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell>
      <TopBar title="Site Settings" />

      <div style={{ paddingTop: 8, maxWidth: 700 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Site Settings</h1>
            <p>Configure global feature flags and visibility options.</p>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((row, i) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 24px',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  gap: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: row.value ? 'rgba(34,197,94,0.12)' : 'var(--bg-overlay)',
                    border: `1px solid ${row.value ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.2s',
                  }}>
                    <Settings size={18} style={{ color: row.value ? 'var(--success-text)' : 'var(--text-secondary)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 2 }}>
                      {row.label}
                    </div>
                    <div className="text-sm text-muted">{row.description}</div>
                  </div>
                </div>

                <button
                  id={`toggle-${row.key}`}
                  onClick={() => toggle(row)}
                  disabled={saving === row.key}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: saving === row.key ? 'wait' : 'pointer',
                    padding: 0,
                    flexShrink: 0,
                    opacity: saving === row.key ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                  title={row.value ? `Disable ${row.label}` : `Enable ${row.label}`}
                >
                  {row.value ? (
                    <ToggleRight size={40} style={{ color: 'var(--success-text)' }} />
                  ) : (
                    <ToggleLeft size={40} style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
