import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Avatar from '../components/Avatar.jsx';
import Layout from '../components/Layout.jsx';
import { useToast } from '../components/Toast.jsx';
import { useWorkspaceRealtime } from '../hooks/useWorkspaceRealtime.js';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { user } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(null);
  const [boards, setBoards] = useState([]);
  const [missing, setMissing] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'member' });

  const isOwner = workspace?.myRole === 'owner';

  const loadWorkspace = useCallback(
    () =>
      api(`/api/workspaces/${workspaceId}`)
        .then((d) => setWorkspace(d.workspace))
        .catch((e) => (e.status === 404 ? setMissing(true) : notify(e.message))),
    [workspaceId, notify]
  );
  const loadBoards = useCallback(
    () => api(`/api/workspaces/${workspaceId}/boards`).then((d) => setBoards(d.boards)).catch(() => {}),
    [workspaceId]
  );

  useEffect(() => {
    loadWorkspace();
    loadBoards();
  }, [loadWorkspace, loadBoards]);

  const live = useWorkspaceRealtime(workspaceId, {
    'board:created': ({ board }) => setBoards((b) => (b.some((x) => x._id === board._id) ? b : [...b, board])),
    'board:updated': ({ board }) => setBoards((b) => b.map((x) => (x._id === board._id ? board : x))),
    'board:deleted': ({ boardId }) => setBoards((b) => b.filter((x) => x._id !== boardId)),
    'member:changed': () => loadWorkspace().then(() => {}),
    'workspace:updated': loadWorkspace,
    'workspace:deleted': () => navigate('/'),
    onReconnect: () => {
      loadWorkspace();
      loadBoards();
    },
  });

  // If we were removed from the workspace, the reload 404s and we show the notice below.
  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      notify(e.message);
    }
  };

  const addBoard = run(async (e) => {
    e.preventDefault();
    await api(`/api/workspaces/${workspaceId}/boards`, { method: 'POST', body: { name: boardName } });
    setBoardName('');
  });

  const removeBoard = run(async (board) => {
    if (!window.confirm(`Delete "${board.name}" and all of its tasks?`)) return;
    await api(`/api/boards/${board._id}`, { method: 'DELETE' });
  });

  const addMember = run(async (e) => {
    e.preventDefault();
    const d = await api(`/api/workspaces/${workspaceId}/members`, { method: 'POST', body: invite });
    setWorkspace(d.workspace);
    setInvite({ email: '', role: 'member' });
    notify('Member added', 'ok');
  });

  const changeRole = run(async (member, role) => {
    const d = await api(`/api/workspaces/${workspaceId}/members/${member.user._id}`, {
      method: 'PATCH',
      body: { role },
    });
    setWorkspace(d.workspace);
  });

  const removeMember = run(async (member) => {
    const self = member.user._id === user.id || member.user._id === user._id;
    const msg = self ? 'Leave this workspace?' : `Remove ${member.user.name} from this workspace?`;
    if (!window.confirm(msg)) return;
    await api(`/api/workspaces/${workspaceId}/members/${member.user._id}`, { method: 'DELETE' });
    if (self) navigate('/');
  });

  const deleteWorkspace = run(async () => {
    if (!window.confirm(`Delete "${workspace.name}" with all its boards and tasks? This cannot be undone.`)) return;
    await api(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
    navigate('/');
  });

  if (missing) {
    return (
      <Layout>
        <p className="empty">
          This workspace does not exist or you no longer have access. <Link to="/">Back to your workspaces</Link>
        </p>
      </Layout>
    );
  }
  if (!workspace) {
    return (
      <Layout>
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout trail={[{ label: workspace.name }]} live={live}>
      <div className="ws-head">
        <div>
          <h1 className="page-title">{workspace.name}</h1>
          {workspace.description && <p className="muted">{workspace.description}</p>}
        </div>
        <span className={`pill pill-${workspace.myRole}`}>You are {workspace.myRole === 'owner' ? 'an owner' : 'a member'}</span>
      </div>

      <div className="dash">
        <section>
          <h2 className="section-title">Boards</h2>
          {boards.length === 0 && (
            <p className="empty">
              {isOwner ? 'No boards yet. Add one to start tracking tasks.' : 'No boards yet. An owner needs to add one.'}
            </p>
          )}
          <ul className="rows">
            {boards.map((b) => (
              <li key={b._id} className="row-wrap">
                <Link to={`/boards/${b._id}`} className="row">
                  <span className="row-main">
                    <strong>{b.name}</strong>
                  </span>
                  <span className="muted">Open board</span>
                </Link>
                {isOwner && (
                  <button className="btn btn-quiet btn-danger" onClick={() => removeBoard(b)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>

          {isOwner && (
            <form className="inline-form" onSubmit={addBoard}>
              <input
                aria-label="Board name"
                placeholder="Board name, e.g. Sprint 12"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                required
                maxLength={80}
              />
              <button className="btn btn-primary">Add board</button>
            </form>
          )}
        </section>

        <aside className="panel">
          <h2>Members</h2>
          <ul className="members">
            {workspace.members.map((m) => {
              const self = m.user._id === user._id || m.user._id === user.id;
              return (
                <li key={m.user._id}>
                  <Avatar name={m.user.name} size={30} />
                  <span className="member-info">
                    <strong>
                      {m.user.name}
                      {self ? ' (you)' : ''}
                    </strong>
                    <span className="muted">{m.user.email}</span>
                  </span>
                  {isOwner ? (
                    <select
                      aria-label={`Role for ${m.user.name}`}
                      value={m.role}
                      onChange={(e) => changeRole(m, e.target.value)}
                    >
                      <option value="owner">Owner</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className={`pill pill-${m.role}`}>{m.role}</span>
                  )}
                  {(isOwner || self) && (
                    <button
                      className="btn btn-quiet btn-danger"
                      onClick={() => removeMember(m)}
                      aria-label={self ? 'Leave workspace' : `Remove ${m.user.name}`}
                    >
                      {self ? 'Leave' : 'Remove'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {isOwner && (
            <form className="invite" onSubmit={addMember}>
              <h3>Add a teammate</h3>
              <input
                type="email"
                aria-label="Teammate email"
                placeholder="Email of a registered user"
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                required
              />
              <div className="inline-form">
                <select
                  aria-label="Role"
                  value={invite.role}
                  onChange={(e) => setInvite((i) => ({ ...i, role: e.target.value }))}
                >
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
                <button className="btn btn-primary">Add member</button>
              </div>
            </form>
          )}

          {isOwner && (
            <button className="btn btn-quiet btn-danger delete-ws" onClick={deleteWorkspace}>
              Delete workspace
            </button>
          )}
        </aside>
      </div>
    </Layout>
  );
}
