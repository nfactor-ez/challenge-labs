import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Shield, User } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { LoadingState, EmptyState, Badge } from '../../components/ui';
import { adminApi } from '../../api/admin';
import { useToast } from '../../context/ToastContext';
import type { User as UserType } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleLoading, setRoleLoading] = useState<number | null>(null);
  const PAGE_SIZE = 20;

  const load = (p: number) => {
    setLoading(true);
    adminApi.listUsers(p, PAGE_SIZE)
      .then(({ users, total }) => { setUsers(users); setTotal(total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const handleRoleToggle = async (u: UserType) => {
    if (u.id === me?.id) { toast.error("You can't change your own role"); return; }
    const newRole = u.role === 'admin' ? 'user' : 'admin';
    setRoleLoading(u.id);
    try {
      await adminApi.setRole(u.id, newRole);
      toast.success(`${u.username} is now ${newRole}`);
      load(page);
    } catch {
      toast.error('Failed to update role');
    } finally {
      setRoleLoading(null);
    }
  };

  const filtered = users.filter(
    (u) => !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppShell>
      <TopBar
        title="Users"
        search={{ value: search, onChange: setSearch, placeholder: 'Search users...' }}
      />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>User Management</h1>
            <p>{total} registered accounts</p>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<User size={24} />} title="No users found" />
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Operator</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id}>
                      <td className="font-mono text-xs text-muted">#{u.id}</td>
                      <td>
                        <div className="flex gap-2 items-center">
                          <div
                            style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--bg-overlay)',
                              border: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-text)',
                              flexShrink: 0, overflow: 'hidden',
                            }}
                          >
                            {u.avatar_url
                              ? <img src={u.avatar_url} alt="" style={{ width: '100%', objectFit: 'cover' }} />
                              : u.username.slice(0, 2).toUpperCase()
                            }
                          </div>
                          <span style={{ fontWeight: 600 }}>{u.username}</span>
                          {u.id === me?.id && (
                            <span className="text-xs font-mono text-muted">(you)</span>
                          )}
                        </div>
                      </td>
                      <td className="text-secondary text-sm">{u.email}</td>
                      <td>
                        <Badge variant={u.role}>{u.role}</Badge>
                      </td>
                      <td className="text-muted text-xs">
                        {new Date(u.created_at ?? '').toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm ${u.role === 'admin' ? 'btn-secondary' : 'btn-ghost'}`}
                          onClick={() => handleRoleToggle(u)}
                          disabled={roleLoading === u.id || u.id === me?.id}
                          title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                        >
                          {u.role === 'admin' ? (
                            <><User size={12} /> Demote</>
                          ) : (
                            <><Shield size={12} /> Promote</>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center" style={{ marginTop: 16 }}>
                <span className="text-xs text-muted">
                  Page {page} of {totalPages} · {total} users
                </span>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
