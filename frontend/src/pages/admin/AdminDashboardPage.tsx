import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Target, Activity, Plus, ChevronRight } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { StatCard, LoadingState } from '../../components/ui';
import { adminApi } from '../../api/admin';
import type { AdminStats } from '../../api/types';

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stats().then(setStats).finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <TopBar title="Admin Dashboard" />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Platform Overview</h1>
            <p>System-wide statistics and quick actions</p>
          </div>
          <div className="page-header-actions">
            <Link to="/admin/challenges/new" className="btn btn-primary">
              <Plus size={14} /> New Challenge
            </Link>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 28 }}>
              <StatCard
                label="Active Sessions"
                value={stats?.active_sessions ?? 0}
                icon={<Activity size={18} />}
                meta="Running containers"
              />
              <StatCard
                label="Total Users"
                value={stats?.total_users ?? 0}
                icon={<Users size={18} />}
                meta="Registered accounts"
              />
              <StatCard
                label="Total Challenges"
                value={stats?.total_challenges ?? 0}
                icon={<Target size={18} />}
                meta="In library"
              />
            </div>

            {/* Quick navigation */}
            <div className="section-title">Quick Actions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { to: '/admin/challenges', label: 'Manage Challenges', desc: 'Create, edit, publish', icon: <Target size={18} /> },
                { to: '/admin/users', label: 'Manage Users', desc: 'View users, set roles', icon: <Users size={18} /> },
                { to: '/admin/categories', label: 'Categories', desc: 'Organize challenges', icon: <Activity size={18} /> },
              ].map((item) => (
                <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
                  <div className="card card-hover" style={{ cursor: 'pointer' }}>
                    <div className="flex justify-between items-center">
                      <div className="stat-icon" style={{ marginBottom: 0 }}>{item.icon}</div>
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div style={{ marginTop: 12, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                      {item.label}
                    </div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>{item.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
