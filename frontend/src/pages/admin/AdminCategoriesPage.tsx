import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { AppShell } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { LoadingState, EmptyState, Modal, ConfirmModal, Spinner } from '../../components/ui';
import { categoriesApi } from '../../api/categories';
import { useToast } from '../../context/ToastContext';
import type { Category } from '../../api/types';
import { ApiError } from '../../api/types';

interface CatForm { name: string; slug: string; description: string; }
const EMPTY: CatForm = { name: '', slug: '', description: '' };

export function AdminCategoriesPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [form, setForm] = useState<CatForm>(EMPTY);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = () => {
    setLoading(true);
    categoriesApi.list().then(({ categories }) => setCategories(categories)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setForm(EMPTY); setEditTarget(null); setFormOpen(true); };
  const openEdit = (c: Category) => {
    setForm({ name: c.name, slug: c.slug, description: c.description });
    setEditTarget(c);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      if (editTarget) {
        await categoriesApi.update(editTarget.id, form);
        toast.success('Category updated');
      } else {
        await categoriesApi.create(form);
        toast.success('Category created');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await categoriesApi.delete(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed to delete category');
    } finally {
      setDeleteLoading(false);
    }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  return (
    <AppShell>
      <TopBar title="Categories" />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Category Management</h1>
            <p>{categories.length} categories</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={14} /> New Category
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories" description="Create your first category to organize challenges." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="font-mono text-xs text-muted">{c.slug}</td>
                    <td className="text-secondary text-sm" style={{ maxWidth: 300 }}>
                      {c.description || <span style={{ color: 'var(--text-muted)' }}>–</span>}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(c)}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleteTarget(c)}>
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

      {/* Form Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? 'Edit Category' : 'New Category'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setFormOpen(false)} disabled={formLoading}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmit as any} disabled={formLoading} form="cat-form">
              {formLoading ? <Spinner size="sm" /> : editTarget ? 'Save Changes' : 'Create'}
            </button>
          </>
        }
      >
        <form id="cat-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({
                ...f,
                name: e.target.value,
                slug: editTarget ? f.slug : autoSlug(e.target.value),
              }))}
              required
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label>Slug</label>
            <input
              type="text"
              className="input font-mono"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              required
              maxLength={100}
              placeholder="auto-generated"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Category"
        message={`Delete "${deleteTarget?.name}"? This will affect all challenges in this category.`}
        confirmLabel="Delete"
        loading={deleteLoading}
      />
    </AppShell>
  );
}
