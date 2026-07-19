import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, CheckCircle, Sun, Moon, Mail } from 'lucide-react';
import { authApi } from '../../api/auth';
import { ApiError } from '../../api/types';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';

type Step = 'details' | 'verify';

export function RegisterPage() {
  const [step, setStep] = useState<Step>('details');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  // Step 1 — send OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.registerRequest({ username, email, password });
      setInfo(res.message);
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify OTP & create account
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.registerVerify({ username, email, password, otp });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <button
        id="auth-theme-toggle-reg"
        onClick={toggle}
        style={{
          position: 'fixed', top: 20, right: 20,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10, padding: '9px',
          cursor: 'pointer', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 150ms', zIndex: 10,
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

        {step === 'details' ? (
          <form className="auth-form" onSubmit={handleRequestOTP}>
            <h3 style={{ marginBottom: 4 }}>Create your account</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Join and start solving challenges
            </p>

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="reg-username">Username</label>
              <input
                id="reg-username"
                type="text"
                className="input"
                placeholder="player_42"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={50}
                autoComplete="username"
              />
              <span className="form-hint">3–50 characters</span>
            </div>

            <div className="form-group">
              <label htmlFor="reg-email">Email address</label>
              <input
                id="reg-email"
                type="email"
                className="input"
                placeholder="analyst@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                className="input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <span className="form-hint">Minimum 8 characters</span>
            </div>

            <button
              id="register-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerify}>
            <h3 style={{ marginBottom: 4 }}>Verify your email</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            {info && (
              <div className="flag-result flag-result-correct" style={{ marginBottom: 8 }}>
                <CheckCircle size={14} />
                {info}
              </div>
            )}

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="reg-otp">Verification Code</label>
              <input
                id="reg-otp"
                type="text"
                className="input font-mono"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                autoComplete="one-time-code"
                style={{ letterSpacing: 8, fontSize: '1.2rem', textAlign: 'center' }}
              />
              <span className="form-hint">Code expires in 10 minutes</span>
            </div>

            <button
              id="register-verify-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || otp.length !== 6}
            >
              {loading ? <Spinner size="sm" /> : 'Create Account'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 4, fontSize: 13 }}
              onClick={() => { setStep('details'); setOtp(''); setError(''); }}
            >
              <Mail size={13} /> Resend code
            </button>
          </form>
        )}

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
