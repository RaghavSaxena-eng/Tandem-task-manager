const express = require('express');
const Task = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { workspaceAccess } = require('../middleware/workspaceAccess');
const { HttpError, wrap } = require('../utils/httpError');
const { emitToWorkspace } = require('../utils/realtime');
const { populateTask, parseTaskInput } = require('../utils/tasks');

const router = express.Router();
router.use(requireAuth);

const isOwner = (req) => req.membership.role === 'owner';
const isCreator = (req) => String(req.task.createdBy) === req.user.id;
const isAssignee = (req) => req.task.assignee && String(req.task.assignee) === req.user.id;

// Permission-scoped edit: owners can edit any task; members only tasks they
// created or are assigned to. Only owners may reassign a task to someone else.
router.patch(
  '/:taskId',
  workspaceAccess('task'),
  wrap(async (req, res) => {
    if (!(isOwner(req) || isCreator(req) || isAssignee(req))) {
      throw new HttpError(403, 'You can only edit tasks you created or are assigned to');
    }

    const data = parseTaskInput(req.body, req.workspace);
    if (data.assignee !== undefined && !isOwner(req)) {
      const sameAssignee = String(req.task.assignee || '') === String(data.assignee || '');
      if (!sameAssignee && !isCreator(req)) {
        throw new HttpError(403, 'Only owners or the task creator can reassign a task');
      }
    }

    req.task.set(data);
    await req.task.save();
    const task = await populateTask(Task.findById(req.task.id));
    emitToWorkspace(req, req.workspace.id, 'task:updated', { task });
    res.json({ task });
  })
);

// Owners can delete any task; members only the ones they created.
router.delete(
  '/:taskId',
  workspaceAccess('task'),
  wrap(async (req, res) => {
    if (!(isOwner(req) || isCreator(req))) {
      throw new HttpError(403, 'You can only delete tasks you created');
    }
    await req.task.deleteOne();
    emitToWorkspace(req, req.workspace.id, 'task:deleted', {
      taskId: req.task.id,
      boardId: String(req.task.board),
    });
    res.status(204).end();
  })
);

module.exports = router;
