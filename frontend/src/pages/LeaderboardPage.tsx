import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { LoadingState, EmptyState } from '../components/ui';
import { challengesApi } from '../api/challenges';
import type { LeaderboardEntry } from '../api/types';
import { useAuth } from '../context/AuthContext';

export function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    challengesApi.leaderboard(100).then(({ leaderboard }) => {
      setEntries(leaderboard);
    }).finally(() => setLoading(false));
  }, []);

  const getRankClass = (rank: number) => {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return 'rank-n';
  };

  return (
    <AppShell>
      <TopBar title="Leaderboard" />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Global Leaderboard</h1>
            <p>Top performers ranked by total points earned</p>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Trophy size={24} />}
            title="No entries yet"
            description="Complete challenges to appear on the leaderboard."
          />
        ) : (
          <>
            {/* Top 3 podium */}
            {entries.length >= 3 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {[entries[1], entries[0], entries[2]].map((entry, i) => {
                  if (!entry) return null;
                  const podiumColors = [
                    'rgba(160,160,170,0.1)',
                    'rgba(212,175,55,0.1)',
                    'rgba(180,100,60,0.1)',
                  ];
                  return (
                    <div
                      key={entry.user_id}
                      className="card"
                      style={{
                        textAlign: 'center',
                        background: podiumColors[i],
                        borderColor: i === 1 ? 'rgba(212,175,55,0.3)' : 'var(--border)',
                        paddingBottom: 16,
                        order: i === 0 ? 2 : i === 1 ? 1 : 3,
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: 'var(--bg-overlay)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 8px',
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: 'var(--accent-text)',
                        }}
                      >
                        {entry.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div
                        className="leaderboard-rank"
                        style={{ margin: '0 auto 8px', display: 'flex', justifyContent: 'center' }}
                      >
                        <span className={`leaderboard-rank ${getRankClass(entry.rank)}`}>
                          #{entry.rank}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        {entry.username}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: i === 1 ? '#d4af37' : i === 0 ? '#a0a0b0' : '#b4643c',
                          marginTop: 4,
                        }}
                      >
                        {entry.total_points.toLocaleString()}pts
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                        {entry.challenges_solved} solved
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full table */}
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Operator</th>
                    <th>Points</th>
                    <th>Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.user_id}
                      style={
                        entry.user_id === user?.id
                          ? { background: 'var(--accent-glow)' }
                          : {}
                      }
                    >
                      <td>
                        <span className={`leaderboard-rank ${getRankClass(entry.rank)}`}>
                          #{entry.rank}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2 items-center">
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'var(--bg-overlay)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              color: 'var(--accent-text)',
                              flexShrink: 0,
                              overflow: 'hidden',
                            }}
                          >
                            {entry.avatar_url
                              ? <img src={entry.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : entry.username.slice(0, 2).toUpperCase()
                            }
                          </div>
                          <span style={{ fontWeight: entry.user_id === user?.id ? 600 : 400 }}>
                            {entry.username}
                            {entry.user_id === user?.id && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: '0.65rem',
                                  color: 'var(--accent-text)',
                                  fontFamily: 'var(--font-mono)',
                                  opacity: 0.8,
                                }}
                              >
                                YOU
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-accent" style={{ fontWeight: 600 }}>
                          {entry.total_points.toLocaleString()}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{entry.challenges_solved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
