const { Server } = require('socket.io');
const config = require('./config');
const { verifyToken } = require('./middleware/auth');
const Workspace = require('./models/Workspace');

/**
 * Real-time layer. Clients authenticate with their JWT in the handshake, then
 * ask to join a workspace room; membership is re-checked against the database
 * so a user can never subscribe to a workspace they do not belong to.
 */
function setupSocket(httpServer, app) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrls, methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    socket.on('workspace:join', async (workspaceId, ack) => {
      try {
        const ws = await Workspace.findById(workspaceId);
        if (!ws || !ws.getMember(socket.userId)) throw new Error('Not a member of this workspace');
        socket.join(`workspace:${workspaceId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('workspace:leave', (workspaceId) => {
      socket.leave(`workspace:${workspaceId}`);
    });
  });

  app.set('io', io);
  return io;
}

module.exports = { setupSocket };
