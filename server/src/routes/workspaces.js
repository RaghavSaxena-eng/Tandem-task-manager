const express = require('express');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Task = require('../models/Task');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { workspaceAccess } = require('../middleware/workspaceAccess');
const { HttpError, wrap } = require('../utils/httpError');
const { emitToWorkspace, evictFromWorkspace } = require('../utils/realtime');

const router = express.Router();
router.use(requireAuth);

const ownerCount = (ws) => ws.members.filter((m) => m.role === 'owner').length;

async function serializeWorkspace(ws, userId) {
  const populated = await ws.populate('members.user', 'name email');
  const obj = populated.toObject();
  obj.myRole = ws.getMember(userId)?.role;
  return obj;
}

// List workspaces I belong to
router.get(
  '/',
  wrap(async (req, res) => {
    const workspaces = await Workspace.find({ 'members.user': req.user.id }).sort({ updatedAt: -1 });
    res.json({
      workspaces: workspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        memberCount: ws.members.length,
        myRole: ws.getMember(req.user.id).role,
        createdAt: ws.createdAt,
      })),
    });
  })
);

// Create a workspace (creator becomes owner)
router.post(
  '/',
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Workspace name is required');
    const ws = await Workspace.create({
      name,
      description,
      createdBy: req.user.id,
      members: [{ user: req.user.id, role: 'owner' }],
    });
    res.status(201).json({ workspace: await serializeWorkspace(ws, req.user.id) });
  })
);

// Workspace detail (members only)
router.get(
  '/:workspaceId',
  workspaceAccess('workspace'),
  wrap(async (req, res) => {
    res.json({ workspace: await serializeWorkspace(req.workspace, req.user.id) });
  })
);

// Rename / edit (owner)
router.patch(
  '/:workspaceId',
  workspaceAccess('workspace', 'owner'),
  wrap(async (req, res) => {
    const { name, description } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) throw new HttpError(400, 'Workspace name cannot be empty');
      req.workspace.name = name;
    }
    if (description !== undefined) req.workspace.description = description;
    await req.workspace.save();
    const workspace = await serializeWorkspace(req.workspace, req.user.id);
    emitToWorkspace(req, req.workspace.id, 'workspace:updated', { id: req.workspace.id });
    res.json({ workspace });
  })
);

// Delete workspace with all boards and tasks (owner)
router.delete(
  '/:workspaceId',
  workspaceAccess('workspace', 'owner'),
  wrap(async (req, res) => {
    const id = req.workspace.id;
    await Task.deleteMany({ workspace: id });
    await Board.deleteMany({ workspace: id });
    await req.workspace.deleteOne();
    emitToWorkspace(req, id, 'workspace:deleted', { id });
    res.status(204).end();
  })
);

// ---- Members (owner only, except leaving) -----------------------------------

router.post(
  '/:workspaceId/members',
  workspaceAccess('workspace', 'owner'),
  wrap(async (req, res) => {
    const { email, role = 'member' } = req.body || {};
    if (!email) throw new HttpError(400, 'Email is required');
    if (!['owner', 'member'].includes(role)) throw new HttpError(400, 'Role must be owner or member');

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) throw new HttpError(404, 'No registered user with that email');
    if (req.workspace.getMember(user.id)) throw new HttpError(409, 'User is already a member');

    req.workspace.members.push({ user: user.id, role });
    await req.workspace.save();
    emitToWorkspace(req, req.workspace.id, 'member:changed', { workspaceId: req.workspace.id });
    res.status(201).json({ workspace: await serializeWorkspace(req.workspace, req.user.id) });
  })
);

router.patch(
  '/:workspaceId/members/:userId',
  workspaceAccess('workspace', 'owner'),
  wrap(async (req, res) => {
    const { role } = req.body || {};
    if (!['owner', 'member'].includes(role)) throw new HttpError(400, 'Role must be owner or member');

    const target = req.workspace.getMember(req.params.userId);
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === 'owner' && role === 'member' && ownerCount(req.workspace) === 1) {
      throw new HttpError(400, 'A workspace must keep at least one owner');
    }

    target.role = role;
    await req.workspace.save();
    emitToWorkspace(req, req.workspace.id, 'member:changed', { workspaceId: req.workspace.id });
    res.json({ workspace: await serializeWorkspace(req.workspace, req.user.id) });
  })
);

// Owners can remove anyone; any member can remove themselves (leave).
router.delete(
  '/:workspaceId/members/:userId',
  workspaceAccess('workspace'),
  wrap(async (req, res) => {
    const isSelf = req.params.userId === req.user.id;
    if (!isSelf && req.membership.role !== 'owner') {
      throw new HttpError(403, 'Only owners can remove other members');
    }

    const target = req.workspace.getMember(req.params.userId);
    if (!target) throw new HttpError(404, 'Member not found');
    if (target.role === 'owner' && ownerCount(req.workspace) === 1) {
      throw new HttpError(400, 'The last owner cannot leave; delete the workspace or promote another owner first');
    }

    req.workspace.members = req.workspace.members.filter((m) => String(m.user) !== req.params.userId);
    await req.workspace.save();
    await Task.updateMany(
      { workspace: req.workspace.id, assignee: req.params.userId },
      { $set: { assignee: null } }
    );

    emitToWorkspace(req, req.workspace.id, 'member:changed', { workspaceId: req.workspace.id });
    evictFromWorkspace(req, req.workspace.id, req.params.userId);
    res.status(204).end();
  })
);

// ---- Boards in a workspace ---------------------------------------------------

router.get(
  '/:workspaceId/boards',
  workspaceAccess('workspace'),
  wrap(async (req, res) => {
    const boards = await Board.find({ workspace: req.workspace.id }).sort({ createdAt: 1 });
    res.json({ boards });
  })
);

router.post(
  '/:workspaceId/boards',
  workspaceAccess('workspace', 'owner'),
  wrap(async (req, res) => {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) throw new HttpError(400, 'Board name is required');
    const board = await Board.create({ workspace: req.workspace.id, name, createdBy: req.user.id });
    emitToWorkspace(req, req.workspace.id, 'board:created', { board });
    res.status(201).json({ board });
  })
);

module.exports = router;
