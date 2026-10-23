const express = require('express');
const Task = require('../models/Task');
const { requireAuth } = require('../middleware/auth');
const { workspaceAccess } = require('../middleware/workspaceAccess');
const { HttpError, wrap } = require('../utils/httpError');
const { emitToWorkspace } = require('../utils/realtime');
const { populateTask, parseTaskInput } = require('../utils/tasks');

const router = express.Router();
router.use(requireAuth);

// Board detail
router.get(
  '/:boardId',
  workspaceAccess('board'),
  wrap(async (req, res) => {
    res.json({ board: req.board, myRole: req.membership.role });
  })
);

// Rename board (owner)
router.patch(
  '/:boardId',
  workspaceAccess('board', 'owner'),
  wrap(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Board name is required');
    req.board.name = name;
    await req.board.save();
    emitToWorkspace(req, req.workspace.id, 'board:updated', { board: req.board });
    res.json({ board: req.board });
  })
);

// Delete board and its tasks (owner)
router.delete(
  '/:boardId',
  workspaceAccess('board', 'owner'),
  wrap(async (req, res) => {
    await Task.deleteMany({ board: req.board.id });
    await req.board.deleteOne();
    emitToWorkspace(req, req.workspace.id, 'board:deleted', { boardId: req.board.id });
    res.status(204).end();
  })
);

// Tasks on a board (any member)
router.get(
  '/:boardId/tasks',
  workspaceAccess('board'),
  wrap(async (req, res) => {
    const tasks = await populateTask(Task.find({ board: req.board.id }).sort({ createdAt: 1 }));
    res.json({ tasks });
  })
);

router.post(
  '/:boardId/tasks',
  workspaceAccess('board'),
  wrap(async (req, res) => {
    const data = parseTaskInput(req.body, req.workspace, { requireTitle: true });
    const created = await Task.create({
      ...data,
      board: req.board.id,
      workspace: req.workspace.id,
      createdBy: req.user.id,
    });
    const task = await populateTask(Task.findById(created.id));
    emitToWorkspace(req, req.workspace.id, 'task:created', { task });
    res.status(201).json({ task });
  })
);

module.exports = router;
