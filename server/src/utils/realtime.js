// Small helper so route handlers can broadcast to everyone viewing a workspace.
// `io` is attached to the express app in server.js; in tests it may be absent.
function emitToWorkspace(req, workspaceId, event, payload) {
  const io = req.app.get('io');
  if (!io) return;
  io.to(`workspace:${workspaceId}`).emit(event, payload);
}

// Remove a user's live sockets from a workspace room (after they are removed from it).
function evictFromWorkspace(req, workspaceId, userId) {
  const io = req.app.get('io');
  if (!io) return;
  io.in(`user:${userId}`).socketsLeave(`workspace:${workspaceId}`);
}

module.exports = { emitToWorkspace, evictFromWorkspace };
