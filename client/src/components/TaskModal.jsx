import { useEffect, useRef, useState } from 'react';

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/**
 * Create / edit dialog. When `canEdit` is false every field is read-only, so
 * members can still open someone else's task to read it.
 */
export default function TaskModal({ task, members, canEdit, canDelete, onSave, onDelete, onClose }) {
  const isNew = !task;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    assignee: task?.assignee?._id || '',
    dueDate: toDateInput(task?.dueDate),
  });
  const [busy, setBusy] = useState(false);
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        ...form,
        assignee: form.assignee || null,
        dueDate: form.dueDate || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title" onSubmit={submit}>
        <h2 id="task-modal-title">{isNew ? 'New task' : canEdit ? 'Edit task' : 'Task details'}</h2>

        <label className="field">
          <span>Title</span>
          <input ref={firstField} value={form.title} onChange={set('title')} required maxLength={140} disabled={!canEdit} />
        </label>

        <label className="field">
          <span>Description</span>
          <textarea rows={4} value={form.description} onChange={set('description')} maxLength={2000} disabled={!canEdit} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={set('status')} disabled={!canEdit}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={set('priority')} disabled={!canEdit}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Assignee</span>
            <select value={form.assignee} onChange={set('assignee')} disabled={!canEdit}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user._id} value={m.user._id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input type="date" value={form.dueDate} onChange={set('dueDate')} disabled={!canEdit} />
          </label>
        </div>

        {!canEdit && <p className="muted">You can edit tasks you created or are assigned to. Owners can edit any task.</p>}

        <div className="modal-actions">
          {!isNew && canDelete && (
            <button type="button" className="btn btn-quiet btn-danger" onClick={onDelete}>
              Delete task
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button className="btn btn-primary" disabled={busy}>
              {isNew ? 'Create task' : 'Save changes'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
