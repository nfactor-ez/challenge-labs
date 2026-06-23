import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { sessionsApi } from '../../api/sessions';
import type { ContainerStats, Session } from '../../api/types';
import { Spinner } from '../ui';
import { Clock, Cpu, MemoryStick, X, Maximize2, Minimize2 } from 'lucide-react';

interface TerminalPaneProps {
  session: Session;
  onTerminate: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'EXPIRED';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TerminalPane({ session, onTerminate }: TerminalPaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const initDoneRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [remaining, setRemaining] = useState(session.remaining);
  const [expanded, setExpanded] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Stats polling
  useEffect(() => {
    if (!connected) return;
    const poll = async () => {
      try {
        const s = await sessionsApi.stats(session.session_key);
        setStats(s);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [connected, session.session_key]);

  // Re-fit when expanded state changes
  useEffect(() => {
    setTimeout(() => {
      try { fitRef.current?.fit(); } catch { /* ignore */ }
    }, 100);
  }, [expanded]);

  // Initialize terminal + WebSocket — useLayoutEffect ensures DOM is ready
  useLayoutEffect(() => {
    if (!terminalRef.current || initDoneRef.current) return;
    initDoneRef.current = true;

    const term = new Terminal({
      theme: {
        background: '#080810',
        foreground: '#e8e8f0',
        cursor: '#b9f228',
        cursorAccent: '#080810',
        selectionBackground: 'rgba(185,242,40,0.2)',
        black: '#1a1a2a',
        brightBlack: '#3a3a4a',
        red: '#e05555',
        brightRed: '#ff8080',
        green: '#b9f228',
        brightGreen: '#ccff44',
        yellow: '#e0a020',
        brightYellow: '#ffcb44',
        blue: '#4488ee',
        brightBlue: '#88bbff',
        magenta: '#9966dd',
        brightMagenta: '#cc99ff',
        cyan: '#33bbaa',
        brightCyan: '#66ddcc',
        white: '#c0c0d0',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      scrollback: 2000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);

    setTimeout(() => {
      try { fit.fit(); } catch { /* ignore */ }
    }, 50);

    xtermRef.current = term;
    fitRef.current = fit;

    // Connect WebSocket
    const token = localStorage.getItem('cl_token') ?? '';
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProto}://${window.location.host}/ws/terminal/${session.session_key}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      term.writeln('\x1b[2;32m[ChallengeLabs] Terminal session established\x1b[0m');
      term.writeln('\x1b[2;90m─────────────────────────────────────\x1b[0m');
      // send initial resize
      setTimeout(() => {
        try { fit.fit(); } catch { /* ignore */ }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }, 100);
    };

    ws.onmessage = (e) => {
      // ── Parse the JSON envelope the server sends ──────────────────────────
      try {
        const msg = JSON.parse(e.data as string);
        switch (msg.type) {
          case 'output':
            // msg.data is the raw terminal output (may contain ANSI codes)
            term.write(msg.data);
            break;
          case 'expiry':
            setRemaining(msg.remaining ?? 0);
            break;
          case 'error':
            term.writeln(`\x1b[1;31m[Error] ${msg.message ?? 'unknown error'}\x1b[0m`);
            break;
          // ignore unknown types silently
        }
      } catch {
        // Fallback: server sent raw text (not JSON) — write it directly
        term.write(e.data as string);
      }
    };

    ws.onerror = () => {
      term.writeln('\x1b[1;31m[Error] WebSocket connection failed\x1b[0m');
    };

    ws.onclose = () => {
      term.writeln('\x1b[2;33m[ChallengeLabs] Session closed\x1b[0m');
      setConnected(false);
    };

    // Send keystrokes wrapped in the JSON protocol
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Send resize events
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    // Resize observer — refit whenever the container changes size
    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    ro.observe(terminalRef.current!);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
      initDoneRef.current = false;
    };
  }, [session.session_key]);

  const countdownClass =
    remaining < 300 ? 'critical' : remaining < 600 ? 'warning' : '';

  const terminalHeight = expanded ? 'calc(100vh - 200px)' : '420px';

  return (
    <div
      className="terminal-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: terminalHeight,
        transition: 'height 250ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Title bar */}
      <div className="terminal-titlebar">
        <div className="terminal-dots">
          <div className="terminal-dot terminal-dot-red" />
          <div className="terminal-dot terminal-dot-yellow" />
          <div className="terminal-dot terminal-dot-green" />
        </div>
        <span className="terminal-title">
          bash — {session.container_ip || 'booting...'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {!connected && <Spinner size="sm" />}
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Collapse terminal' : 'Expand terminal'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', display: 'flex',
              padding: '2px',
              transition: 'color 150ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* xterm.js container — takes all remaining height */}
      <div
        className="terminal-body"
        ref={terminalRef}
        style={{ flex: 1, minHeight: 0, padding: '6px 8px' }}
      />

      {/* Status bar */}
      <div className="terminal-status-bar">
        <div className="terminal-stats">
          {stats && (
            <>
              <div className="terminal-stat">
                <Cpu size={10} />
                <span>CPU</span>
                <span className="terminal-stat-value">{stats.cpu_percent.toFixed(1)}%</span>
              </div>
              <div className="terminal-stat">
                <MemoryStick size={10} />
                <span>MEM</span>
                <span className="terminal-stat-value">
                  {formatBytes(stats.memory_usage)} / {formatBytes(stats.memory_limit)}
                </span>
              </div>
            </>
          )}
        </div>
        <div className={`session-countdown ${countdownClass}`}>
          <Clock size={10} />
          <span>TTL {formatCountdown(remaining)}</span>
        </div>
        <button className="btn btn-danger btn-sm" onClick={onTerminate} style={{ gap: 4 }}>
          <X size={12} /> Kill
        </button>
      </div>
    </div>
  );
}
