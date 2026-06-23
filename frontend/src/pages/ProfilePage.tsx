import { useState } from 'react';
import { User, Lock, Save, AlertCircle } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { Spinner } from '../components/ui';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../api/types';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState(user?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      await authApi.updateProfile({ username: username || undefined, avatar_url: avatarUrl || undefined });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwError('');
    setPwLoading(true);
    try {
      await authApi.changePassword({ current_password: currentPw, new_password: newPw });
      toast.success('Password changed');
      setCurrentPw('');
      setNewPw('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <AppShell>
      <TopBar title="Profile" />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Account Settings</h1>
            <p>Manage your profile and security settings</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left: user card */}
          <div className="card" style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--bg-overlay)',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--accent-text)',
                overflow: 'hidden',
                fontFamily: 'var(--font-heading)',
              }}
            >
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : user?.username?.slice(0, 2).toUpperCase()
              }
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {user?.username}
            </div>
            <div className="text-xs text-muted font-mono" style={{ marginTop: 4 }}>
              {user?.email}
            </div>
            <div
              style={{ marginTop: 12 }}
              className={`badge badge-${user?.role}`}
            >
              {user?.role}
            </div>
            <div className="divider" />
            <div className="text-xs text-muted">
              Member since {new Date(user?.created_at ?? '').toLocaleDateString()}
            </div>
          </div>

          {/* Right: forms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Update Profile */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <User size={14} style={{ display: 'inline', marginRight: 6 }} />
                  Profile Information
                </span>
              </div>
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label htmlFor="profile-username">Username</label>
                  <input
                    id="profile-username"
                    type="text"
                    className="input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    minLength={3}
                    maxLength={50}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-avatar">Avatar URL</label>
                  <input
                    id="profile-avatar"
                    type="url"
                    className="input"
                    placeholder="https://..."
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    className="input"
                    value={user?.email ?? ''}
                    disabled
                  />
                  <span className="form-hint">Email cannot be changed</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button id="save-profile" type="submit" className="btn btn-primary" disabled={profileLoading}>
                    {profileLoading ? <Spinner size="sm" /> : <><Save size={14} /> Save Changes</>}
                  </button>
                </div>
              </form>
            </div>

            {/* Change Password */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Lock size={14} style={{ display: 'inline', marginRight: 6 }} />
                  Change Password
                </span>
              </div>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {pwError && (
                  <div className="flag-result flag-result-wrong">
                    <AlertCircle size={14} />
                    {pwError}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="current-pw">Current Password</label>
                  <input
                    id="current-pw"
                    type="password"
                    className="input"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-pw">New Password</label>
                  <input
                    id="new-pw"
                    type="password"
                    className="input"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <span className="form-hint">Minimum 8 characters</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button id="change-password" type="submit" className="btn btn-secondary" disabled={pwLoading}>
                    {pwLoading ? <Spinner size="sm" /> : <><Lock size={14} /> Update Password</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
