import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Sun, Moon, Smartphone } from 'lucide-react';
import { authApi } from '../../api/auth';
import { ApiError } from '../../api/types';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

type Step = 'credentials' | 'mfa';

export function LoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { login } = useAuth();

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Use context login() so the user state is set immediately after token save
      const res = await login(email, password);
      if (res.mfa_required) {
        setTempToken(res.temp_token ?? '');
        setStep('mfa');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.mfaLoginVerify({ temp_token: tempToken, code: mfaCode });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <button
        id="auth-theme-toggle"
        onClick={toggle}
        style={{
          position: 'fixed', top: 20, right: 20,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: '9px',
          cursor: 'pointer', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 150ms',
          zIndex: 10,
        }}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark'
          ? <Sun size={17} style={{ color: 'var(--warning-text)' }} />
          : <Moon size={17} />}
      </button>
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            {step === 'mfa'
              ? <Smartphone size={24} color="#fff" />
              : <Shield size={24} color="#fff" />
            }
          </div>
          <div className="auth-logo-text">
            <h2>ChallengeLabs</h2>
            <p>Challenge Platform</p>
          </div>
        </div>

        {step === 'credentials' ? (
          <form className="auth-form" onSubmit={handleCredentials}>
            <h3 style={{ marginBottom: 4 }}>Sign in to your account</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Sign in to access your account
            </p>

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label htmlFor="login-password" style={{ marginBottom: 0 }}>Password</label>
                <Link
                  to="/forgot-password"
                  style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'flex',
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : 'Sign In'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleMFAVerify}>
            <h3 style={{ marginBottom: 4 }}>Two-factor authentication</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Enter the 6-digit code from your authenticator app.
            </p>

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="mfa-code">Authenticator Code</label>
              <input
                id="mfa-code"
                type="text"
                className="input font-mono"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                style={{ letterSpacing: 8, fontSize: '1.2rem', textAlign: 'center' }}
              />
            </div>

            <button
              id="mfa-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || mfaCode.length !== 6}
            >
              {loading ? <Spinner size="sm" /> : 'Verify'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 4, fontSize: 13 }}
              onClick={() => { setStep('credentials'); setMfaCode(''); setError(''); }}
            >
              ← Back to sign in
            </button>
          </form>
        )}

        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create account</Link>
        </div>
      </div>
    </div>
  );
}
