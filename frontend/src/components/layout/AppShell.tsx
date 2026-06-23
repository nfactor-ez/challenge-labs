import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <div className="page-content">
          {children}
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
