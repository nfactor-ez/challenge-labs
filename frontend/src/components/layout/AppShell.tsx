import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui';

interface AppShellProps {
  children: React.ReactNode;
  splitMode?: boolean;
}

export function AppShell({ children, splitMode }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className={`app-main${splitMode ? ' app-main--split' : ''}`}>
        {splitMode ? children : (
          <div className="page-content">
            {children}
          </div>
        )}
      </main>
      <ToastContainer />
    </div>
  );
}
