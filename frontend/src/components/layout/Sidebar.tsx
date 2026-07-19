import { NavLink, useNavigate } from 'react-router-dom';
import {
  Shield, LayoutDashboard, Target, Trophy, User,
  Settings, LogOut, Users, BookOpen, BarChart3, Crown, ToggleRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <aside className="app-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Shield size={18} color="#fff" />
        </div>
        <div>
          <div className="sidebar-brand-name">ChallengeLabs</div>
          <div className="sidebar-brand-sub">v1.0</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Main</div>

        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={16} />
          Dashboard
        </NavLink>

        <NavLink to="/challenges" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <Target size={16} />
          Challenges
        </NavLink>

        {settings.leaderboard_enabled && (
          <NavLink to="/leaderboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Trophy size={16} />
            Leaderboard
          </NavLink>
        )}

        <NavLink to="/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
          <User size={16} />
          Profile
        </NavLink>

        {/* Premium link — styled differently for non-premium users */}
        <NavLink
          to="/premium"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          style={({ isActive }) =>
            !user?.is_premium && !isActive
              ? { color: '#a78bfa', fontWeight: 600 }
              : {}
          }
        >
          <Crown size={16} style={{ color: user?.is_premium ? '#a78bfa' : undefined }} />
          {user?.is_premium ? 'Premium ✓' : 'Upgrade to Premium'}
        </NavLink>

        {isAdmin && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 8 }}>Admin</div>

            <NavLink to="/admin" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <BarChart3 size={16} />
              Admin Dashboard
            </NavLink>

            <NavLink to="/admin/challenges" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <BookOpen size={16} />
              Challenges
            </NavLink>

            <NavLink to="/admin/users" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Users size={16} />
              Users
            </NavLink>

            <NavLink to="/admin/categories" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <Settings size={16} />
              Categories
            </NavLink>

            <NavLink to="/admin/settings" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <ToggleRight size={16} />
              Site Settings
            </NavLink>
          </>
        )}
      </nav>

      {/* User */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {user?.avatar_url
              ? <img src={user.avatar_url} alt={user.username} />
              : initials
            }
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-username">{user?.username}</div>
            <div className="sidebar-role" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {user?.is_premium && <Crown size={10} style={{ color: '#a78bfa' }} />}
              {user?.is_premium ? 'premium' : user?.role}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleLogout}
            title="Logout"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
