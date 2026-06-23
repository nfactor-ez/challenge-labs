import { Search, Bell, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
  title: string;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
}

export function TopBar({ title, search }: TopBarProps) {
  const { theme, toggle } = useTheme();

  return (
    <header className="app-topbar">
      <span className="topbar-title">{title}</span>

      {search && (
        <div className="topbar-search">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder={search.placeholder ?? 'Search...'}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </div>
      )}

      <div className="topbar-actions">
        <button
          id="theme-toggle"
          className="btn btn-ghost btn-icon"
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ fontSize: 0 }}
        >
          {theme === 'dark'
            ? <Sun size={17} style={{ color: 'var(--warning-text)' }} />
            : <Moon size={17} style={{ color: 'var(--text-secondary)' }} />
          }
        </button>
        <button className="btn btn-ghost btn-icon" title="Notifications">
          <Bell size={17} />
        </button>
      </div>
    </header>
  );
}
