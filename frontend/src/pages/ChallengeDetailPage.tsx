import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Flag, CheckCircle2, XCircle, Tag,
  Terminal as TerminalIcon, ChevronDown, ChevronUp, Sun, Moon, PanelRightClose, PanelRightOpen
} from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { LoadingState, DifficultyBadge, Spinner } from '../components/ui';
import { TerminalPane } from '../components/terminal/TerminalPane';
import { challengesApi } from '../api/challenges';
import { sessionsApi } from '../api/sessions';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import type { Challenge, UserProgress, Session } from '../api/types';
import { ApiError } from '../api/types';

// ─── Draggable Divider ────────────────────────────────────────────────────────

function useSplitPane(defaultLeftPct = 42) {
  const [leftPct, setLeftPct] = useState(defaultLeftPct);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(70, Math.max(25, pct)));
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return { leftPct, containerRef, onMouseDown };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [tasksOpen, setTasksOpen] = useState(true);
  const [terminalVisible, setTerminalVisible] = useState(true);
  const { theme, toggle: toggleTheme } = useTheme();

  const { leftPct, containerRef, onMouseDown } = useSplitPane(42);

  useEffect(() => {
    if (!id) return;
    challengesApi.get(id).then(({ challenge, progress }) => {
      setChallenge(challenge);
      setProgress(progress);
    }).catch(() => {
      toast.error('Failed to load challenge');
    }).finally(() => setLoading(false));
  }, [id]);

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
    <AppShell splitMode>
      {/* ── Thin top bar ── */}
      <div className="challenge-split-topbar">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate('/challenges')}>
          <ArrowLeft size={15} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {challenge.title}
          </h1>
          <DifficultyBadge difficulty={challenge.difficulty} />
          <span className="challenge-card-points" style={{ fontSize: '0.7rem' }}>{challenge.points}pts</span>
          {challenge.category && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {challenge.category.name}
            </span>
          )}
          {progress?.completed && (
            <span className="flag-result flag-result-correct" style={{ padding: '3px 10px', fontSize: '0.7rem' }}>
              <CheckCircle2 size={11} /> Completed · +{progress.points_awarded}pts
            </span>
          )}
        </div>
        {/* Top-right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => setTerminalVisible(v => !v)}
            title={terminalVisible ? 'Hide terminal' : 'Show terminal'}
          >
            {terminalVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        </div>
      </div>

      {/* ── Split pane ── */}
      <div className="challenge-split-body" ref={containerRef}>

        {/* LEFT — scrollable info panel */}
        <div className="challenge-split-left" style={{ width: `${leftPct}%` }}>

          {/* Description */}
          <div className="split-section">
            <div className="split-section-title">Description</div>
            <div className="challenge-markdown">
              {challenge.description.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>

          {/* Tags */}
          {challenge.tags && (
            <div className="split-section">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tag size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {challenge.tags.split(',').map((t) => (
                  <span key={t} className="tag">{t.trim()}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tasks — collapsible */}
          {challenge.tasks && challenge.tasks.length > 0 && (
            <div className="split-section">
              <button
                className="split-section-title split-collapsible"
                onClick={() => setTasksOpen(o => !o)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
              >
                <span>Tasks</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {challenge.tasks.length} steps
                  {tasksOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
              {tasksOpen && (
                <div className="task-list" style={{ marginTop: 12 }}>
                  {challenge.tasks.map((task) => (
                    <div key={task.id} className="task-item">
                      <div className="task-num">{task.order}</div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {task.title}
                          {task.is_required && (
                            <span style={{ marginLeft: 8, fontSize: '0.6rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                              REQUIRED
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <div className="text-xs text-muted" style={{ marginTop: 3 }}>{task.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Container card */}
          <div className="split-section">
            <div className="split-section-title">Container</div>
            {session ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex gap-2 items-center">
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: session.status === 'active' ? 'var(--accent)' : 'var(--warning-text)',
                    boxShadow: session.status === 'active' ? '0 0 6px var(--accent)' : 'none',
                  }} />
                  <span className="text-sm font-mono" style={{ color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {session.status}
                  </span>
                </div>
                {session.container_ip && (
                  <div className="text-xs text-muted font-mono">IP: {session.container_ip}</div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p className="text-sm text-muted">Launch an isolated Docker container to work on this challenge.</p>
                <button
                  id="start-session"
                  className="btn btn-primary btn-full"
                  onClick={handleStartSession}
                  disabled={startLoading}
                >
                  {startLoading ? <><Spinner size="sm" /> Booting...</> : <><Play size={14} /> Start Session</>}
                </button>
              </div>
            )}
          </div>

          {/* Flag submit */}
          <div className="split-section">
            <div className="split-section-title">
              <Flag size={13} style={{ color: 'var(--accent)' }} /> Submit Flag
            </div>
            {progress?.completed ? (
              <div className="flag-result flag-result-correct">
                <CheckCircle2 size={14} /> Challenge completed!
              </div>
            ) : (
              <form onSubmit={handleSubmitFlag} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  id="flag-input"
                  type="text"
                  className="input font-mono"
                  placeholder="CTF{...}"
                  value={flag}
                  onChange={(e) => setFlag(e.target.value)}
                />
                {flagResult && (
                  <div className={`flag-result ${flagResult.correct ? 'flag-result-correct' : 'flag-result-wrong'}`}>
                    {flagResult.correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
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

          {/* Meta */}
          <div className="split-section" style={{ marginBottom: 32 }}>
            <div className="split-section-title">Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Docker Image', value: challenge.docker_image },
                { label: 'Points', value: `${challenge.points}` },
                { label: 'Difficulty', value: challenge.difficulty },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DIVIDER — hide when terminal is hidden */}
        {terminalVisible && (
          <div className="challenge-split-divider" onMouseDown={onMouseDown}>
            <div className="split-divider-handle" />
          </div>
        )}

        {/* RIGHT — terminal panel */}
        {terminalVisible && (
          <div className="challenge-split-right" style={{ width: `${100 - leftPct}%` }}>
            {session ? (
              <TerminalPane session={session} onTerminate={handleTerminate} fillHeight />
            ) : (
              <div className="split-terminal-placeholder">
                <div className="split-placeholder-inner">
                  <TerminalIcon size={36} style={{ color: 'rgba(185,242,40,0.15)', marginBottom: 16 }} />
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    Terminal will appear here
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.1)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', marginTop: 8 }}>
                    Start a container session on the left →
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
