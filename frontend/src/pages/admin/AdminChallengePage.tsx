import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { LoadingState, EmptyState, DifficultyBadge, Badge, ConfirmModal } from '../../components/ui';
import { challengesApi } from '../../api/challenges';
import { adminApi } from '../../api/admin';
import { useToast } from '../../context/ToastContext';
import type { Challenge } from '../../api/types';

export function AdminChallengePage() {
  const { toast } = useToast();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Challenge | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = () => {
    setLoading(true);
    challengesApi.list()
      .then(({ challenges }) => setChallenges(challenges))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await adminApi.deleteChallenge(deleteTarget.id);
      toast.success(`"${deleteTarget.title}" deleted`);
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed to delete challenge');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = challenges.filter((c) =>
    !search || c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <TopBar
        title="Challenges"
        search={{ value: search, onChange: setSearch, placeholder: 'Search challenges...' }}
      />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Challenge Management</h1>
            <p>{challenges.length} total challenges</p>
          </div>
          <div className="page-header-actions">
            <Link to="/admin/challenges/new" className="btn btn-primary">
              <Plus size={14} /> New Challenge
            </Link>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState title="No challenges" description="Create your first challenge." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Difficulty</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</div>
                      <div className="text-xs text-muted font-mono">{c.slug}</div>
                    </td>
                    <td className="text-secondary text-sm">{c.category?.name ?? '–'}</td>
                    <td><DifficultyBadge difficulty={c.difficulty} /></td>
                    <td className="font-mono text-accent">{c.points}</td>
                    <td>
                      <Badge variant={c.is_published ? 'published' : 'draft'}>
                        {c.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Link
                          to={`/admin/challenges/${c.id}/edit`}
                          className="btn btn-secondary btn-sm btn-icon"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </Link>
                        <button
                          className="btn btn-danger btn-sm btn-icon"
                          title="Delete"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Challenge"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteLoading}
      />
    </AppShell>
  );
}
