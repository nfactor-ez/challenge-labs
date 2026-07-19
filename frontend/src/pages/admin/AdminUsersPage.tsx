import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Shield, User, Key, X, Eye, EyeOff, Crown } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { LoadingState, EmptyState, Badge, Modal, Spinner } from '../../components/ui';
import { adminApi } from '../../api/admin';
import { useToast } from '../../context/ToastContext';
import type { User as UserType } from '../../api/types';
import { ApiError } from '../../api/types';
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
  const [premiumLoading, setPremiumLoading] = useState<number | null>(null);
  const PAGE_SIZE = 20;

  // Password reset modal state
  const [pwTarget, setPwTarget] = useState<UserType | null>(null);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

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

  const handlePremiumToggle = async (u: UserType) => {
    setPremiumLoading(u.id);
    const newValue = !u.is_premium;
    try {
      await adminApi.setUserPremium(u.id, newValue);
      toast.success(`Premium ${newValue ? 'granted to' : 'revoked from'} ${u.username}`);
      load(page);
    } catch {
      toast.error('Failed to update premium status');
    } finally {
      setPremiumLoading(null);
    }
  };

  const openPwReset = (u: UserType) => {
    setPwTarget(u);
    setNewPw('');
    setConfirmPw('');
    setPwError('');
    setShowPw(false);
  };

  const handlePwReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    if (!pwTarget) return;
    setPwLoading(true);
    setPwError('');
    try {
      await adminApi.setUserPassword(pwTarget.id, newPw);
      toast.success(`Password reset for ${pwTarget.username}`);
      setPwTarget(null);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setPwLoading(false);
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
                    <th>MFA</th>
                    <th>Plan</th>
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
                      <td>
                        {u.mfa_enabled ? (
                          <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', fontSize: 11 }}>
                            ON
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td>
                        {u.is_premium ? (
                          <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, width: 'fit-content' }}>
                            <Crown size={10} /> Premium
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Free</span>
                        )}
                      </td>
                      <td className="text-muted text-xs">
                        {new Date(u.created_at ?? '').toLocaleDateString()}
                      </td>
                      <td>
                        <div className="flex gap-2">
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
                          <button
                            className={`btn btn-sm ${u.is_premium ? 'btn-secondary' : 'btn-ghost'}`}
                            onClick={() => handlePremiumToggle(u)}
                            disabled={premiumLoading === u.id}
                            title={u.is_premium ? 'Revoke Premium' : 'Grant Premium'}
                            style={!u.is_premium ? { color: '#a78bfa', borderColor: 'rgba(99,102,241,0.3)' } : {}}
                          >
                            {premiumLoading === u.id ? <Spinner size="sm" /> : (
                              u.is_premium
                                ? <><Crown size={12} /> Revoke</>
                                : <><Crown size={12} /> Grant</>
                            )}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openPwReset(u)}
                            title="Reset password"
                          >
                            <Key size={12} /> Reset PW
                          </button>
                        </div>
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

      {/* Reset Password Modal */}
      <Modal
        open={!!pwTarget}
        onClose={() => setPwTarget(null)}
        title={`Reset Password — ${pwTarget?.username}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPwTarget(null)} disabled={pwLoading}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              form="pw-reset-form"
              type="submit"
              disabled={pwLoading}
            >
              {pwLoading ? <Spinner size="sm" /> : <><Key size={13} /> Reset Password</>}
            </button>
          </>
        }
      >
        <form id="pw-reset-form" onSubmit={handlePwReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="text-sm text-muted">
            Set a new password for <strong>{pwTarget?.username}</strong>. They will be able to log in immediately with this password.
          </p>
          {pwError && (
            <div className="flag-result flag-result-wrong">
              <X size={13} />
              {pwError}
            </div>
          )}
          <div className="form-group">
            <label htmlFor="admin-new-pw">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-new-pw"
                type={showPw ? 'text' : 'password'}
                className="input"
                placeholder="Min 8 characters"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex',
                }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="admin-confirm-pw">Confirm Password</label>
            <input
              id="admin-confirm-pw"
              type="password"
              className="input"
              placeholder="Repeat new password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
