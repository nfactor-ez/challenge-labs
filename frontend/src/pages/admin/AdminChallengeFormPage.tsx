import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { Spinner } from '../../components/ui';
import { adminApi } from '../../api/admin';
import { challengesApi } from '../../api/challenges';
import { categoriesApi } from '../../api/categories';
import { useToast } from '../../context/ToastContext';
import { ApiError } from '../../api/types';
import type { Category } from '../../api/types';

interface TaskField {
  order: number;
  title: string;
  description: string;
  is_required: boolean;
}

const EMPTY_FORM = {
  title: '',
  slug: '',
  description: '',
  difficulty: 'easy',
  points: 100,
  docker_image: '',
  flag: '',
  tags: '',
  category_id: 0,
  is_published: false,
};

export function AdminChallengeFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tasks, setTasks] = useState<TaskField[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEdit);
  const [error, setError] = useState('');

  useEffect(() => {
    categoriesApi.list().then(({ categories }) => setCategories(categories));
    if (isEdit) {
      challengesApi.get(id!).then(({ challenge }) => {
        setForm({
          title: challenge.title,
          slug: challenge.slug,
          description: challenge.description,
          difficulty: challenge.difficulty,
          points: challenge.points,
          docker_image: challenge.docker_image,
          flag: '',
          tags: challenge.tags ?? '',
          category_id: challenge.category_id,
          is_published: challenge.is_published,
        });
        setTasks(
          (challenge.tasks ?? []).map((t) => ({
            order: t.order,
            title: t.title,
            description: t.description,
            is_required: t.is_required,
          }))
        );
      }).finally(() => setPageLoading(false));
    }
  }, [id, isEdit]);

  const setField = <K extends keyof typeof EMPTY_FORM>(k: K, v: typeof EMPTY_FORM[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const addTask = () => setTasks((t) => [
    ...t,
    { order: t.length + 1, title: '', description: '', is_required: true },
  ]);

  const removeTask = (i: number) => setTasks((t) => t.filter((_, idx) => idx !== i));

  const updateTask = (i: number, key: keyof TaskField, val: string | boolean | number) =>
    setTasks((t) => t.map((task, idx) => idx === i ? { ...task, [key]: val } : task));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category_id) { setError('Please select a category.'); return; }
    if (!isEdit && !form.flag) { setError('Flag is required.'); return; }
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        category_id: Number(form.category_id),
        points: Number(form.points),
        tasks: tasks.map((t, i) => ({ ...t, order: i + 1 })),
      };
      if (isEdit) {
        await adminApi.updateChallenge(Number(id), payload);
        toast.success('Challenge updated');
      } else {
        await adminApi.createChallenge(payload);
        toast.success('Challenge created');
      }
      navigate('/admin/challenges');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <AppShell>
        <TopBar title={isEdit ? 'Edit Challenge' : 'New Challenge'} />
        <Spinner />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <TopBar title={isEdit ? 'Edit Challenge' : 'New Challenge'} />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="flex gap-3 items-center">
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('/admin/challenges')}>
              <ArrowLeft size={16} />
            </button>
            <div className="page-header-text">
              <h1>{isEdit ? 'Edit Challenge' : 'Create Challenge'}</h1>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && (
            <div className="flag-result flag-result-wrong" style={{ padding: 12 }}>{error}</div>
          )}

          {/* Core info */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Challenge Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Title</label>
                <input
                  type="text"
                  className="input"
                  value={form.title}
                  onChange={(e) => setField('title', e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>Slug</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={form.slug}
                  onChange={(e) => setField('slug', e.target.value)}
                  required
                  placeholder="my-challenge-slug"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  className="input"
                  value={form.category_id}
                  onChange={(e) => setField('category_id', Number(e.target.value))}
                >
                  <option value={0}>Select category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Difficulty</label>
                <select
                  className="input"
                  value={form.difficulty}
                  onChange={(e) => setField('difficulty', e.target.value)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="form-group">
                <label>Points</label>
                <input
                  type="number"
                  className="input"
                  value={form.points}
                  onChange={(e) => setField('points', Number(e.target.value))}
                  min={10}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Description (Markdown supported)</label>
                <textarea
                  className="input"
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={6}
                  required
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Docker Image</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={form.docker_image}
                  onChange={(e) => setField('docker_image', e.target.value)}
                  required
                  placeholder="registry.example.com/challenge:latest"
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Flag {isEdit && <span className="form-hint" style={{ display: 'inline' }}>(leave empty to keep existing)</span>}</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={form.flag}
                  onChange={(e) => setField('flag', e.target.value)}
                  required={!isEdit}
                  placeholder="CTF{...}"
                />
              </div>
              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  className="input"
                  value={form.tags}
                  onChange={(e) => setField('tags', e.target.value)}
                  placeholder="web, linux, forensics"
                />
              </div>
              <div className="form-group" style={{ justifyContent: 'flex-end', paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setField('is_published', e.target.checked)}
                    style={{ width: 14, height: 14 }}
                  />
                  Publish immediately
                </label>
              </div>
            </div>
          </div>

          {/* Tasks */}
          <div className="card">
            <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
              <span className="card-title">Tasks</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addTask}>
                <Plus size={13} /> Add Task
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="text-sm text-muted">No tasks added. Tasks are optional step-by-step guidance.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tasks.map((task, i) => (
                  <div key={i} className="card card-sm" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                    <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                      <span className="text-xs font-mono text-muted">Task {i + 1}</span>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => removeTask(i)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          type="text"
                          className="input"
                          value={task.title}
                          onChange={(e) => updateTask(i, 'title', e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 20 }}>
                          <input
                            type="checkbox"
                            checked={task.is_required}
                            onChange={(e) => updateTask(i, 'is_required', e.target.checked)}
                            style={{ width: 12 }}
                          />
                          Required
                        </label>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Description</label>
                      <textarea
                        className="input"
                        value={task.description}
                        onChange={(e) => updateTask(i, 'description', e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-between">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/challenges')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Spinner size="sm" /> : isEdit ? 'Save Changes' : 'Create Challenge'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
