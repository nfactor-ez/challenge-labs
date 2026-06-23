import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/types';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Please try again.');
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
            <Shield size={24} color="#fff" />
          </div>
          <div className="auth-logo-text">
            <h2>ChallengeLabs</h2>
            <p>Challenge Platform</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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
            <label htmlFor="login-password">Password</label>
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

        <div className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register">Create account</Link>
        </div>
      </div>
    </div>
  );
}
