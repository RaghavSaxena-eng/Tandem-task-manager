const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Task = require('../models/Task');
const { HttpError, wrap } = require('../utils/httpError');

const ROLE_RANK = { member: 1, owner: 2 };

function assertId(id, label) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, `${label} not found`);
}

/**
 * Permission gate used by every workspace-scoped route.
 *
 * source: where the workspace id comes from
 *   'workspace' -> req.params.workspaceId
 *   'board'     -> the board in req.params.boardId (its workspace)
 *   'task'      -> the task in req.params.taskId (its workspace)
 * minRole: 'member' (any member) or 'owner'
 *
 * Non-members get 404 so workspace ids can't be probed; members with too low a
 * role get 403. On success it sets req.workspace, req.membership, req.board, req.task.
 */
function workspaceAccess(source, minRole = 'member') {
  return wrap(async (req, _res, next) => {
    let workspaceId;

    if (source === 'workspace') {
      workspaceId = req.params.workspaceId;
      assertId(workspaceId, 'Workspace');
    } else if (source === 'board') {
      assertId(req.params.boardId, 'Board');
      req.board = await Board.findById(req.params.boardId);
      if (!req.board) throw new HttpError(404, 'Board not found');
      workspaceId = req.board.workspace;
    } else if (source === 'task') {
      assertId(req.params.taskId, 'Task');
      req.task = await Task.findById(req.params.taskId);
      if (!req.task) throw new HttpError(404, 'Task not found');
      workspaceId = req.task.workspace;
    }

    const workspace = await Workspace.findById(workspaceId);
    const membership = workspace && workspace.getMember(req.user.id);
    if (!membership) throw new HttpError(404, 'Not found');

    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new HttpError(403, `This action requires the ${minRole} role`);
    }

    req.workspace = workspace;
    req.membership = membership;
    next();
  });
}

module.exports = { workspaceAccess, assertId };
