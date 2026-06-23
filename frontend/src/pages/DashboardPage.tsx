import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Activity, CheckCircle, ChevronRight } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { StatCard, LoadingState, EmptyState, DifficultyBadge } from '../components/ui';
import { challengesApi } from '../api/challenges';
import { sessionsApi } from '../api/sessions';
import { useAuth } from '../context/AuthContext';
import type { Challenge, Session } from '../api/types';

export function DashboardPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      challengesApi.list(),
      sessionsApi.listActive(),
    ]).then(([cRes, sRes]) => {
      setChallenges(cRes.challenges);
      setSessions(sRes.sessions);
    }).finally(() => setLoading(false));
  }, []);

  const recentChallenges = challenges.slice(0, 6);

  return (
    <AppShell>
      <TopBar title="Dashboard" />

      <div style={{ paddingTop: 8 }}>
        {/* Welcome */}
        <div style={{ marginBottom: 28 }}>
          <h1>
            Welcome back, <span style={{ color: 'var(--accent-text)' }}>{user?.username}</span>
          </h1>
          <p className="text-muted" style={{ marginTop: 6, fontSize: '0.95rem' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats */}
        <div className="stat-grid" style={{ marginBottom: 28 }}>
          <StatCard
            label="Total Challenges"
            value={loading ? '–' : challenges.length}
            icon={<Target size={18} />}
            meta="Available to solve"
          />
          <StatCard
            label="Active Sessions"
            value={loading ? '–' : sessions.length}
            icon={<Activity size={18} />}
            meta="Running containers"
          />
          <StatCard
            label="Challenges Solved"
            value="–"
            icon={<CheckCircle size={18} />}
            meta="Check leaderboard"
          />
        </div>

        {/* Active Sessions */}
        {sessions.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div className="section-title">Active Sessions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map((sess) => (
                <div key={sess.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: sess.status === 'active' ? 'var(--success-text)' : 'var(--warning-text)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="text-sm" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {sess.challenge?.title ?? `Challenge #${sess.challenge_id}`}
                    </div>
                    <div className="text-xs text-muted font-mono">
                      {sess.session_key.slice(0, 12)}... · {sess.status}
                    </div>
                  </div>
                  <Link
                    to={`/challenges/${sess.challenge_id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Reconnect
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Challenges */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="section-title" style={{ margin: 0 }}>Recent Challenges</div>
            <Link to="/challenges" className="btn btn-ghost btn-sm gap-1">
              View all <ChevronRight size={13} />
            </Link>
          </div>

          {loading ? (
            <LoadingState />
          ) : recentChallenges.length === 0 ? (
            <EmptyState
              icon={<Target size={24} />}
              title="No challenges available"
              description="Check back later — new challenges are added regularly."
            />
          ) : (
            <div className="challenge-grid">
              {recentChallenges.map((c) => (
                <Link key={c.id} to={`/challenges/${c.id}`} className="challenge-card">
                  <div className="challenge-card-header">
                    <span className="challenge-card-title">{c.title}</span>
                    <span className="challenge-card-points">{c.points}pts</span>
                  </div>
                  <p className="challenge-card-desc">{c.description}</p>
                  <div className="challenge-card-meta">
                    <DifficultyBadge difficulty={c.difficulty} />
                    {c.category && (
                      <span className="challenge-card-category">
                        {c.category.name}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
