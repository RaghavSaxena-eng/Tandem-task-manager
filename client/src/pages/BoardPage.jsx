import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Avatar from '../components/Avatar.jsx';
import Layout from '../components/Layout.jsx';
import TaskModal from '../components/TaskModal.jsx';
import { useToast } from '../components/Toast.jsx';
import { useWorkspaceRealtime } from '../hooks/useWorkspaceRealtime.js';

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const upsert = (list, task) =>
  list.some((t) => t._id === task._id) ? list.map((t) => (t._id === task._id ? task : t)) : [...list, task];

function formatDue(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function BoardPage() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const myId = user._id;
  const notify = useToast();
  const navigate = useNavigate();

  const [board, setBoard] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | task
  const [dragOver, setDragOver] = useState(null);

  const isOwner = workspace?.myRole === 'owner';
  const canEditTask = (t) => isOwner || t.createdBy?._id === myId || t.assignee?._id === myId;
  const canDeleteTask = (t) => isOwner || t.createdBy?._id === myId;

  const loadTasks = useCallback(
    () => api(`/api/boards/${boardId}/tasks`).then((d) => setTasks(d.tasks)).catch(() => {}),
    [boardId]
  );
  const loadWorkspace = useCallback(
    (workspaceId) => api(`/api/workspaces/${workspaceId}`).then((d) => setWorkspace(d.workspace)).catch(() => {}),
    []
  );

  useEffect(() => {
    let cancelled = false;
    api(`/api/boards/${boardId}`)
      .then(async (d) => {
        if (cancelled) return;
        setBoard(d.board);
        await Promise.all([loadWorkspace(d.board.workspace), loadTasks()]);
      })
      .catch((e) => (e.status === 404 ? setMissing(true) : notify(e.message)));
    return () => {
      cancelled = true;
    };
  }, [boardId, loadTasks, loadWorkspace, notify]);

  const wsId = board?.workspace;
  const live = useWorkspaceRealtime(wsId, {
    'task:created': ({ task }) => task.board === boardId && setTasks((t) => upsert(t, task)),
    'task:updated': ({ task }) => task.board === boardId && setTasks((t) => upsert(t, task)),
    'task:deleted': ({ taskId }) => setTasks((t) => t.filter((x) => x._id !== taskId)),
    'board:updated': ({ board: b }) => b._id === boardId && setBoard(b),
    'board:deleted': ({ boardId: id }) => id === boardId && navigate(`/workspaces/${wsId}`),
    'member:changed': () => {
      loadWorkspace(wsId);
      loadTasks();
    },
    'workspace:deleted': () => navigate('/'),
    onReconnect: () => {
      loadWorkspace(wsId);
      loadTasks();
    },
  });

  async function moveTask(taskId, status) {
    const task = tasks.find((t) => t._id === taskId);
    if (!task || task.status === status || !canEditTask(task)) return;
    const before = tasks;
    setTasks((list) => list.map((t) => (t._id === taskId ? { ...t, status } : t))); // optimistic
    try {
      const d = await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status } });
      setTasks((list) => upsert(list, d.task));
    } catch (e) {
      setTasks(before);
      notify(e.message);
    }
  }

  async function saveTask(data) {
    try {
      if (editing === 'new') {
        const d = await api(`/api/boards/${boardId}/tasks`, { method: 'POST', body: data });
        setTasks((list) => upsert(list, d.task));
      } else {
        const d = await api(`/api/tasks/${editing._id}`, { method: 'PATCH', body: data });
        setTasks((list) => upsert(list, d.task));
      }
      setEditing(null);
    } catch (e) {
      notify(e.message);
    }
  }

  async function deleteTask() {
    if (!window.confirm(`Delete "${editing.title}"?`)) return;
    try {
      await api(`/api/tasks/${editing._id}`, { method: 'DELETE' });
      setTasks((list) => list.filter((t) => t._id !== editing._id));
      setEditing(null);
    } catch (e) {
      notify(e.message);
    }
  }

  if (missing) {
    return (
      <Layout>
        <p className="empty">
          This board does not exist or you no longer have access. <Link to="/">Back to your workspaces</Link>
        </p>
      </Layout>
    );
  }
  if (!board || !workspace) {
    return (
      <Layout>
        <p className="muted">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout trail={[{ label: workspace.name, to: `/workspaces/${workspace._id}` }, { label: board.name }]} live={live}>
      <div className="ws-head">
        <h1 className="page-title">{board.name}</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          New task
        </button>
      </div>

      <div className="columns">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <section
              key={col.key}
              className={`column column-${col.key} ${dragOver === col.key ? 'column-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                moveTask(e.dataTransfer.getData('text/plain'), col.key);
              }}
              aria-label={col.label}
            >
              <header className="column-head">
                <h2>{col.label}</h2>
                <span className="count">{items.length}</span>
              </header>

              <div className="column-body">
                {items.length === 0 && <p className="column-empty">Drop a task here</p>}
                {items.map((t) => {
                  const overdue = t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date();
                  return (
                    <article
                      key={t._id}
                      className={`task task-${t.priority} ${canEditTask(t) ? 'task-movable' : ''}`}
                      draggable={canEditTask(t)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', t._id)}
                    >
                      <button className="task-open" onClick={() => setEditing(t)}>
                        {t.title}
                      </button>
                      <div className="task-meta">
                        <span className="task-prio">{t.priority} priority</span>
                        {t.dueDate && <span className={overdue ? 'due due-late' : 'due'}>Due {formatDue(t.dueDate)}</span>}
                        <span className="spacer" />
                        {t.assignee && <Avatar name={t.assignee.name} size={22} />}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <TaskModal
          task={editing === 'new' ? null : editing}
          members={workspace.members}
          canEdit={editing === 'new' || canEditTask(editing)}
          canDelete={editing !== 'new' && canDeleteTask(editing)}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setEditing(null)}
        />
      )}
    </Layout>
  );
}
