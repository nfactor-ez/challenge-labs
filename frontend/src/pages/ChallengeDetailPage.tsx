import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Flag, CheckCircle2, XCircle, Tag, Terminal as TerminalIcon
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { LoadingState, DifficultyBadge, Spinner, Badge } from '../components/ui';
import { TerminalPane } from '../components/terminal/TerminalPane';
import { challengesApi } from '../api/challenges';
import { sessionsApi } from '../api/sessions';
import { useToast } from '../context/ToastContext';
import type { Challenge, UserProgress, Session } from '../api/types';
import { ApiError } from '../api/types';

export function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [startLoading, setStartLoading] = useState(false);
  const [flag, setFlag] = useState('');
  const [flagResult, setFlagResult] = useState<{ correct: boolean; message: string } | null>(null);
  const [flagLoading, setFlagLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    challengesApi.get(id).then(({ challenge, progress }) => {
      setChallenge(challenge);
      setProgress(progress);
    }).catch(() => {
      toast.error('Failed to load challenge');
    }).finally(() => setLoading(false));
  }, [id]);

  // Check for existing session
  useEffect(() => {
    if (!challenge) return;
    sessionsApi.reconnect(challenge.id).then((sess) => {
      setSession(sess);
    }).catch(() => {/* no active session */});
  }, [challenge]);

  const handleStartSession = async () => {
    if (!challenge) return;
    setStartLoading(true);
    try {
      const sess = await sessionsApi.start(challenge.id);
      setSession(sess);
      toast.success('Container started!');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to start container';
      toast.error(msg);
    } finally {
      setStartLoading(false);
    }
  };

  const handleTerminate = async () => {
    if (!session) return;
    try {
      await sessionsApi.terminate(session.session_key);
      setSession(null);
      toast.info('Session terminated');
    } catch {
      toast.error('Failed to terminate session');
    }
  };

  const handleSubmitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || !flag.trim()) return;
    setFlagLoading(true);
    setFlagResult(null);
    try {
      const result = await challengesApi.submitFlag(challenge.id, flag.trim());
      setFlagResult(result);
      if (result.correct) {
        toast.success(`Flag accepted! +${result.points ?? challenge.points} points`);
        setProgress((p) => p
          ? { ...p, completed: true, flag_submitted: true, points_awarded: challenge.points }
          : null
        );
      } else {
        toast.error('Incorrect flag — keep trying!');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Submission failed';
      setFlagResult({ correct: false, message: msg });
    } finally {
      setFlagLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <TopBar title="Challenge" />
        <LoadingState message="Loading challenge..." />
      </AppShell>
    );
  }

  if (!challenge) {
    return (
      <AppShell>
        <TopBar title="Challenge" />
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Challenge not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar title={challenge.title} />

      <div style={{ paddingTop: 8 }}>
        {/* Header */}
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => navigate('/challenges')}
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 style={{ fontSize: '2.2rem' }}>{challenge.title}</h1>
              <div className="flex gap-2 items-center mt-2">
                <DifficultyBadge difficulty={challenge.difficulty} />
                <Badge variant={challenge.is_published ? 'published' : 'draft'}>
                  {challenge.is_published ? 'Published' : 'Draft'}
                </Badge>
                <span className="challenge-card-points">{challenge.points}pts</span>
                {challenge.category && (
                  <span className="text-xs text-muted font-mono" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {challenge.category.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          {progress?.completed && (
            <div className="flag-result flag-result-correct" style={{ padding: '8px 14px' }}>
              <CheckCircle2 size={14} />
              Completed · +{progress.points_awarded}pts
            </div>
          )}
        </div>

        <div className="challenge-detail-layout">
          {/* Left: description + tasks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Description */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Description</span>
              </div>
              <div className="challenge-markdown">
                {challenge.description.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>

            {/* Tags */}
            {challenge.tags && (
              <div className="card card-sm">
                <div className="flex gap-2 items-center">
                  <Tag size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div className="challenge-tags">
                    {challenge.tags.split(',').map((t) => (
                      <span key={t} className="tag">{t.trim()}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tasks */}
            {challenge.tasks && challenge.tasks.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Tasks</span>
                  <span className="text-xs text-muted font-mono">
                    {challenge.tasks.length} steps
                  </span>
                </div>
                <div className="task-list">
                  {challenge.tasks.map((task) => (
                    <div key={task.id} className="task-item">
                      <div className="task-num">{task.order}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {task.title}
                          {task.is_required && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: '0.6rem',
                                color: 'var(--accent)',
                                fontFamily: 'var(--font-mono)',
                                letterSpacing: '0.1em',
                              }}
                            >
                              REQUIRED
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <div className="text-xs text-muted" style={{ marginTop: 3 }}>
                            {task.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: actions + terminal */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Container Session */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Container</div>

              {session ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="flex gap-2 items-center">
                    <div
                      style={{
                        width: 7, height: 7,
                        background: session.status === 'active' ? 'var(--accent)' : 'var(--warning-text)',
                        boxShadow: session.status === 'active' ? '0 0 6px var(--accent)' : 'none',
                      }}
                    />
                    <span className="text-sm font-mono" style={{ color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {session.status}
                    </span>
                  </div>
                  {session.container_ip && (
                    <div className="text-xs text-muted font-mono" style={{ letterSpacing: '0.04em' }}>
                      IP: {session.container_ip}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p className="text-sm text-muted">
                    Launch an isolated Docker container to work on this challenge.
                  </p>
                  <button
                    id="start-session"
                    className="btn btn-primary btn-full"
                    onClick={handleStartSession}
                    disabled={startLoading}
                  >
                    {startLoading ? (
                      <>
                        <Spinner size="sm" /> Booting...
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Start Session
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Flag submission */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>
                <Flag size={14} style={{ display: 'inline', marginRight: 8, color: 'var(--accent)' }} />
                Submit Flag
              </div>

              {progress?.completed ? (
                <div className="flag-result flag-result-correct">
                  <CheckCircle2 size={14} />
                  Challenge completed!
                </div>
              ) : (
                <form onSubmit={handleSubmitFlag} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label htmlFor="flag-input">Flag</label>
                    <input
                      id="flag-input"
                      type="text"
                      className="input font-mono"
                      placeholder="CTF{...}"
                      value={flag}
                      onChange={(e) => setFlag(e.target.value)}
                    />
                  </div>

                  {flagResult && (
                    <div className={`flag-result ${flagResult.correct ? 'flag-result-correct' : 'flag-result-wrong'}`}>
                      {flagResult.correct
                        ? <CheckCircle2 size={14} />
                        : <XCircle size={14} />
                      }
                      {flagResult.message}
                    </div>
                  )}

                  <button
                    id="submit-flag"
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={flagLoading || !flag.trim()}
                  >
                    {flagLoading ? <Spinner size="sm" /> : 'Submit Flag'}
                  </button>
                </form>
              )}
            </div>

            {/* Meta info */}
            <div className="card card-sm">
              <div className="section-title" style={{ marginBottom: 10 }}>Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Docker Image</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {challenge.docker_image}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Points</span>
                  <span className="font-mono text-accent" style={{ fontWeight: 700 }}>{challenge.points}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Difficulty</span>
                  <DifficultyBadge difficulty={challenge.difficulty} />
                </div>
              </div>
            </div>


          </div>
        </div>

        {/* Terminal — FULL WIDTH below the layout */}
        {session && (
          <div style={{ marginTop: 24 }}>
            <div className="section-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
              <TerminalIcon size={13} />
              Live Terminal
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                — drag top edge to resize
              </span>
            </div>
            <TerminalPane session={session} onTerminate={handleTerminate} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
