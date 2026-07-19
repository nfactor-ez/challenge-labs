import { useState } from 'react';
import { User, Lock, Save, AlertCircle, Smartphone, QrCode, ShieldCheck, ShieldOff } from 'lucide-react';
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

  // ── Profile form ──────────────────────────────────────────────────────────
  const [username, setUsername] = useState(user?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Change password form ──────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // ── MFA setup state ───────────────────────────────────────────────────────
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaOtpAuthURL, setMfaOtpAuthURL] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaCodeLoading, setMfaCodeLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [showMfaSetup, setShowMfaSetup] = useState(false);

  // ── MFA disable state ─────────────────────────────────────────────────────
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaDisableLoading, setMfaDisableLoading] = useState(false);
  const [mfaDisableError, setMfaDisableError] = useState('');
  const [showMfaDisable, setShowMfaDisable] = useState(false);

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

  // MFA setup — generate secret
  const handleMFASetup = async () => {
    setMfaSetupLoading(true);
    setMfaError('');
    try {
      const res = await authApi.mfaSetup();
      setMfaSecret(res.secret);
      setMfaOtpAuthURL(res.otpauth_url);
      setShowMfaSetup(true);
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Failed to start MFA setup');
    } finally {
      setMfaSetupLoading(false);
    }
  };

  // MFA enable — confirm with TOTP code
  const handleMFAEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaCodeLoading(true);
    setMfaError('');
    try {
      await authApi.mfaEnable({ code: mfaCode });
      await refreshUser();
      toast.success('Two-factor authentication enabled');
      setShowMfaSetup(false);
      setMfaCode('');
      setMfaSecret('');
      setMfaOtpAuthURL('');
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Failed to enable MFA');
    } finally {
      setMfaCodeLoading(false);
    }
  };

  // MFA disable
  const handleMFADisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaDisableLoading(true);
    setMfaDisableError('');
    try {
      await authApi.mfaDisable({ code: mfaDisableCode });
      await refreshUser();
      toast.success('Two-factor authentication disabled');
      setShowMfaDisable(false);
      setMfaDisableCode('');
    } catch (err) {
      setMfaDisableError(err instanceof ApiError ? err.message : 'Failed to disable MFA');
    } finally {
      setMfaDisableLoading(false);
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
            {user?.mfa_enabled && (
              <div
                className="badge"
                style={{ marginTop: 8, background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
              >
                <ShieldCheck size={11} /> MFA enabled
              </div>
            )}
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

            {/* Two-Factor Authentication */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Smartphone size={14} style={{ display: 'inline', marginRight: 6 }} />
                  Two-Factor Authentication
                </span>
                <div>
                  {user?.mfa_enabled ? (
                    <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', fontSize: 11 }}>
                      Enabled
                    </span>
                  ) : (
                    <span className="badge badge-muted" style={{ fontSize: 11 }}>Disabled</span>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                Use an authenticator app (Google Authenticator, Authy, etc.) for extra security when signing in.
              </p>

              {/* MFA Setup flow */}
              {!user?.mfa_enabled && !showMfaSetup && (
                <>
                  {mfaError && (
                    <div className="flag-result flag-result-wrong" style={{ marginBottom: 12 }}>
                      <AlertCircle size={14} />
                      {mfaError}
                    </div>
                  )}
                  <button
                    id="enable-mfa"
                    className="btn btn-primary"
                    onClick={handleMFASetup}
                    disabled={mfaSetupLoading}
                  >
                    {mfaSetupLoading ? <Spinner size="sm" /> : <><QrCode size={14} /> Set up Authenticator</>}
                  </button>
                </>
              )}

              {!user?.mfa_enabled && showMfaSetup && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <p className="text-sm" style={{ marginBottom: 10, fontWeight: 600 }}>
                      1. Scan this QR code with your authenticator app:
                    </p>
                    {/* QR code rendered via Google Charts API */}
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mfaOtpAuthURL)}`}
                        alt="QR code for authenticator"
                        style={{ borderRadius: 8, border: '4px solid white' }}
                      />
                    </div>
                    <p className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      Or enter this secret manually:
                    </p>
                    <code
                      style={{
                        display: 'block',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        fontSize: '0.8rem',
                        letterSpacing: 3,
                        wordBreak: 'break-all',
                        color: 'var(--accent)',
                      }}
                    >
                      {mfaSecret}
                    </code>
                  </div>

                  <form onSubmit={handleMFAEnable} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p className="text-sm" style={{ fontWeight: 600 }}>
                      2. Enter the 6-digit code from your app to confirm:
                    </p>
                    {mfaError && (
                      <div className="flag-result flag-result-wrong">
                        <AlertCircle size={14} />
                        {mfaError}
                      </div>
                    )}
                    <div className="form-group">
                      <input
                        id="mfa-enable-code"
                        type="text"
                        className="input font-mono"
                        placeholder="000000"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        required
                        maxLength={6}
                        autoComplete="one-time-code"
                        style={{ letterSpacing: 8, fontSize: '1.2rem', textAlign: 'center' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => { setShowMfaSetup(false); setMfaCode(''); setMfaError(''); }}
                      >
                        Cancel
                      </button>
                      <button
                        id="confirm-mfa-enable"
                        type="submit"
                        className="btn btn-primary"
                        disabled={mfaCodeLoading || mfaCode.length !== 6}
                      >
                        {mfaCodeLoading ? <Spinner size="sm" /> : <><ShieldCheck size={14} /> Enable MFA</>}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* MFA Disable flow */}
              {user?.mfa_enabled && !showMfaDisable && (
                <button
                  id="disable-mfa"
                  className="btn btn-danger"
                  onClick={() => setShowMfaDisable(true)}
                >
                  <ShieldOff size={14} /> Disable MFA
                </button>
              )}

              {user?.mfa_enabled && showMfaDisable && (
                <form onSubmit={handleMFADisable} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p className="text-sm text-muted">
                    Enter a code from your authenticator app to confirm disabling MFA.
                  </p>
                  {mfaDisableError && (
                    <div className="flag-result flag-result-wrong">
                      <AlertCircle size={14} />
                      {mfaDisableError}
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="mfa-disable-code">Authenticator Code</label>
                    <input
                      id="mfa-disable-code"
                      type="text"
                      className="input font-mono"
                      placeholder="000000"
                      value={mfaDisableCode}
                      onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      maxLength={6}
                      autoComplete="one-time-code"
                      style={{ letterSpacing: 8, fontSize: '1.1rem', textAlign: 'center' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setShowMfaDisable(false); setMfaDisableCode(''); setMfaDisableError(''); }}
                    >
                      Cancel
                    </button>
                    <button
                      id="confirm-mfa-disable"
                      type="submit"
                      className="btn btn-danger"
                      disabled={mfaDisableLoading || mfaDisableCode.length !== 6}
                    >
                      {mfaDisableLoading ? <Spinner size="sm" /> : <><ShieldOff size={14} /> Disable MFA</>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
