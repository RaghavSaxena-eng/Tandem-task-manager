import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Dashboard() {
  const notify = useToast();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api('/api/workspaces')
      .then((d) => setWorkspaces(d.workspaces))
      .catch((e) => {
        notify(e.message);
        setWorkspaces([]);
      });
  }, [notify]);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const { workspace } = await api('/api/workspaces', { method: 'POST', body: form });
      navigate(`/workspaces/${workspace._id}`);
    } catch (err) {
      notify(err.message);
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="dash">
        <section>
          <h1 className="page-title">Your workspaces</h1>

          {workspaces === null && <p className="muted">Loading…</p>}

          {workspaces?.length === 0 && (
            <p className="empty">You are not in any workspace yet. Create one to start planning with your team.</p>
          )}

          {workspaces?.length > 0 && (
            <ul className="rows">
              {workspaces.map((w) => (
                <li key={w.id}>
                  <Link to={`/workspaces/${w.id}`} className="row">
                    <span className="row-main">
                      <strong>{w.name}</strong>
                      {w.description && <span className="muted">{w.description}</span>}
                    </span>
                    <span className="row-meta">
                      <span className={`pill pill-${w.myRole}`}>{w.myRole}</span>
                      <span className="muted">
                        {w.memberCount} {w.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="panel">
          <h2>New workspace</h2>
          <form onSubmit={create}>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                maxLength={80}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                maxLength={300}
              />
            </label>
            <button className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create workspace'}
            </button>
          </form>
        </aside>
      </div>
    </Layout>
  );
}
