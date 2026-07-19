import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle, Sun, Moon } from 'lucide-react';
import { authApi } from '../../api/auth';
import { ApiError } from '../../api/types';
import { Spinner } from '../../components/ui';
import { useTheme } from '../../context/ThemeContext';

type Step = 'request' | 'verify';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPasswordRequest({ email });
      setSuccess(res.message);
      setStep('verify');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP + set new password
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.forgotPasswordVerify({ email, otp, new_password: newPassword });
      setSuccess(res.message);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Theme toggle */}
      <button
        id="forgot-theme-toggle"
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
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Shield size={24} color="#fff" />
          </div>
          <div className="auth-logo-text">
            <h2>ChallengeLabs</h2>
            <p>Challenge Platform</p>
          </div>
        </div>

        {step === 'request' ? (
          <form className="auth-form" onSubmit={handleRequestOTP}>
            <h3 style={{ marginBottom: 4 }}>Reset your password</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              Enter your email and we'll send you a verification code.
            </p>

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="forgot-email">Email address</label>
              <input
                id="forgot-email"
                type="email"
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <button
              id="forgot-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerify}>
            <h3 style={{ marginBottom: 4 }}>Enter verification code</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
              We sent a code to <strong>{email}</strong>. Enter it below with your new password.
            </p>

            {success && !newPassword && (
              <div className="flag-result flag-result-correct" style={{ marginBottom: 8 }}>
                <CheckCircle size={14} />
                {success}
              </div>
            )}

            {success && newPassword && (
              <div className="flag-result flag-result-correct" style={{ marginBottom: 8 }}>
                <CheckCircle size={14} />
                Password reset successful! Redirecting…
              </div>
            )}

            {error && (
              <div className="flag-result flag-result-wrong">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {/* OTP */}
            <div className="form-group">
              <label htmlFor="forgot-otp">Verification Code</label>
              <input
                id="forgot-otp"
                type="text"
                className="input font-mono"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                autoComplete="one-time-code"
                style={{ letterSpacing: 8, fontSize: '1.1rem', textAlign: 'center' }}
                disabled={!!success && !!newPassword}
              />
              <span className="form-hint">Code expires in 10 minutes</span>
            </div>

            {/* New password */}
            <div className="form-group">
              <label htmlFor="forgot-new-password">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="forgot-new-password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ paddingRight: 40 }}
                  disabled={!!success && !!newPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', display: 'flex',
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="form-group">
              <label htmlFor="forgot-confirm-password">Confirm new password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="forgot-confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  className="input"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{ paddingRight: 40 }}
                  disabled={!!success && !!newPassword}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', display: 'flex',
                  }}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              id="forgot-verify-submit"
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || otp.length !== 6 || (!!success && !!newPassword)}
            >
              {loading ? <Spinner size="sm" /> : 'Reset Password'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 4, fontSize: 13 }}
              onClick={() => { setStep('request'); setOtp(''); setError(''); setSuccess(''); }}
            >
              ← Use a different email
            </button>
          </form>
        )}

        <div className="auth-footer">
          Remembered it?{' '}
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
