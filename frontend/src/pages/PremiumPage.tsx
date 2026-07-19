import { useState, useEffect } from 'react';
import { Crown, Zap, Lock, CheckCircle, Star, Shield, Cpu } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { Spinner } from '../components/ui';
import { premiumApi, type PremiumStatus } from '../api/premium';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const FEATURES_FREE = [
  'Access to all free challenges',
  'Community leaderboard',
  'Personal progress tracking',
  'MFA security',
];

const FEATURES_PREMIUM = [
  'Everything in Free',
  'Exclusive premium challenges',
  'Advanced difficulty challenges',
  'Early access to new content',
  'Premium badge on profile',
  'Priority support',
];

export function PremiumPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    premiumApi.status()
      .then(setStatus)
      .catch(() => setStatus({ is_premium: false }));
  }, []);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      const res = await premiumApi.request();
      toast.info(res.message);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const isPremium = status?.is_premium ?? user?.is_premium ?? false;

  return (
    <AppShell>
      <TopBar title="Premium" />

      <div style={{ paddingTop: 8, maxWidth: 900, margin: '0 auto' }}>
        {/* Hero */}
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            marginBottom: 32,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.12) 100%)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background glow */}
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
          }}>
            <Crown size={30} color="white" />
          </div>

          {isPremium ? (
            <>
              <h1 style={{ fontSize: '1.8rem', marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                You're Premium! 🎉
              </h1>
              <p className="text-muted" style={{ fontSize: '1rem', maxWidth: 480, margin: '0 auto 20px' }}>
                You have full access to all premium challenges and exclusive features.
              </p>
              {status?.premium_expires_at && (
                <div className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', fontSize: 13, padding: '6px 16px' }}>
                  Expires: {new Date(status.premium_expires_at).toLocaleDateString()}
                </div>
              )}
              {!status?.premium_expires_at && (
                <div className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', fontSize: 13, padding: '6px 16px' }}>
                  ✓ Lifetime access
                </div>
              )}
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>
                Unlock <span style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Premium</span>
              </h1>
              <p className="text-muted" style={{ fontSize: '1rem', maxWidth: 480, margin: '0 auto' }}>
                Get access to exclusive premium challenges, advanced content, and more.
              </p>
            </>
          )}
        </div>

        {/* Plans */}
        {!isPremium && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            {/* Free Plan */}
            <div className="card" style={{ opacity: 0.8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)' }}>Free</div>
                  <div className="text-muted text-xs">Current plan</div>
                </div>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4, fontFamily: 'var(--font-heading)' }}>
                $0 <span className="text-muted" style={{ fontSize: 14, fontWeight: 400 }}>/mo</span>
              </div>
              <div className="divider" style={{ margin: '16px 0' }} />
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FEATURES_FREE.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <CheckCircle size={14} style={{ color: 'var(--success-text)', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Premium Plan */}
            <div
              className="card"
              style={{
                border: '1.5px solid rgba(99,102,241,0.5)',
                background: 'linear-gradient(145deg, var(--bg-card) 0%, rgba(99,102,241,0.05) 100%)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Popular badge */}
              <div style={{
                position: 'absolute', top: 14, right: 14,
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: 'white', borderRadius: 20, fontSize: 11,
                fontWeight: 700, padding: '3px 10px', letterSpacing: 0.5,
              }}>
                UPGRADE
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
                  <Crown size={18} color="white" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Premium
                  </div>
                  <div className="text-muted text-xs">Full access</div>
                </div>
              </div>

              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                  Pricing
                </span>
                <span className="text-muted" style={{ fontSize: 13, marginLeft: 8 }}>coming soon</span>
              </div>

              <div className="divider" style={{ margin: '16px 0' }} />
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {FEATURES_PREMIUM.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <Star size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                id="upgrade-request-btn"
                className="btn btn-primary btn-full"
                onClick={handleRequest}
                disabled={requesting}
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                  border: 'none',
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                {requesting ? <Spinner size="sm" /> : <><Crown size={14} /> Request Premium Access</>}
              </button>
              <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 10 }}>
                Payment gateway coming soon — contact an admin for manual access.
              </p>
            </div>
          </div>
        )}

        {/* Feature highlights */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { icon: <Lock size={20} />, title: 'Exclusive Challenges', desc: 'Access premium-only CTF challenges not available to free users.' },
            { icon: <Cpu size={20} />, title: 'Advanced Difficulty', desc: 'Push your skills with hard-mode challenges reserved for premium.' },
            { icon: <Shield size={20} />, title: 'Premium Badge', desc: 'Stand out on the leaderboard with your premium membership badge.' },
          ].map((f) => (
            <div key={f.title} className="card" style={{ textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
                color: '#a78bfa',
              }}>
                {f.icon}
              </div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: 6, fontSize: '0.9rem' }}>{f.title}</div>
              <p className="text-muted text-sm" style={{ margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* If premium — show what's included */}
        {isPremium && (
          <div className="card" style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'linear-gradient(145deg, var(--bg-card), rgba(99,102,241,0.05))' }}>
            <div className="card-header">
              <span className="card-title"><Crown size={14} style={{ display: 'inline', marginRight: 6, color: '#a78bfa' }} /> Your Premium Benefits</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {FEATURES_PREMIUM.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <CheckCircle size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
