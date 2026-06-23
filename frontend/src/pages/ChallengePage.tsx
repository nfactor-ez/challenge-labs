import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, Filter } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { LoadingState, EmptyState, DifficultyBadge } from '../components/ui';
import { challengesApi } from '../api/challenges';
import { categoriesApi } from '../api/categories';
import type { Challenge, Category } from '../api/types';

const DIFFICULTIES = ['all', 'easy', 'medium', 'hard'];

export function ChallengePage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('all');
  const [catFilter, setCatFilter] = useState(0);

  useEffect(() => {
    Promise.all([challengesApi.list(), categoriesApi.list()])
      .then(([cRes, catRes]) => {
        setChallenges(cRes.challenges);
        setCategories(catRes.categories);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return challenges.filter((c) => {
      const matchSearch = !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.tags?.toLowerCase().includes(search.toLowerCase()) ?? false);
      const matchDiff = diffFilter === 'all' || c.difficulty === diffFilter;
      const matchCat = catFilter === 0 || c.category_id === catFilter;
      return matchSearch && matchDiff && matchCat;
    });
  }, [challenges, search, diffFilter, catFilter]);

  return (
    <AppShell>
      <TopBar
        title="Challenges"
        search={{ value: search, onChange: setSearch, placeholder: 'Search challenges...' }}
      />

      <div style={{ paddingTop: 8 }}>
        <div className="page-header">
          <div className="page-header-text">
            <h1>Challenge Library</h1>
            <p>
              {loading ? '...' : `${filtered.length} of ${challenges.length}`} challenges available
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />

          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              className={`filter-pill ${diffFilter === d ? 'active' : ''}`}
              onClick={() => setDiffFilter(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}

          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--border)',
              margin: '0 4px',
            }}
          />

          <button
            className={`filter-pill ${catFilter === 0 ? 'active' : ''}`}
            onClick={() => setCatFilter(0)}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`filter-pill ${catFilter === cat.id ? 'active' : ''}`}
              onClick={() => setCatFilter(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Target size={24} />}
            title="No challenges found"
            description="Try adjusting your filters or search term."
          />
        ) : (
          <div className="challenge-grid">
            {filtered.map((c) => (
              <Link key={c.id} to={`/challenges/${c.id}`} className="challenge-card">
                <div className="challenge-card-header">
                  <span className="challenge-card-title">{c.title}</span>
                  <span className="challenge-card-points">{c.points}pts</span>
                </div>
                <p className="challenge-card-desc">{c.description}</p>
                <div className="challenge-card-meta">
                  <DifficultyBadge difficulty={c.difficulty} />
                  {c.category && (
                    <span className="challenge-card-category">{c.category.name}</span>
                  )}
                  {c.tags && (
                    <div className="challenge-tags">
                      {c.tags.split(',').slice(0, 3).map((t) => (
                        <span key={t} className="tag">{t.trim()}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
