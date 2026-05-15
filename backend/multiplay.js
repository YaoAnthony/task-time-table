/**
 * Socket.io multiplayer relay server.
 * Host's userId is the roomId. Rooms are capped at two players.
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

/** rooms: Map<roomId, Map<socketId, { userId, displayName }>> */
const rooms = new Map();

/** Exposed so route modules can broadcast without circular require. */
let _io = null;
function getIo() { return _io; }

function initMultiplay(httpServer, allowedOrigins) {
  const allowAnyOrigin = process.env.SOCKET_ALLOW_ANY_ORIGIN === 'true';
  const accessSecret = process.env.ACCESS_SECRET || process.env.JWT_SECRET;

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (origin.startsWith('vscode-webview://')) return cb(null, true);
        if (allowedOrigins.some(o => o && origin === o)) return cb(null, true);
        if (allowAnyOrigin) return cb(null, true);
        return cb(new Error(`Socket CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!accessSecret) return next(new Error('Socket authentication is not configured'));
    if (!token) return next(new Error('Socket authentication token is required'));

    try {
      const decoded = jwt.verify(token, accessSecret);
      socket.data.userId = decoded.id;
      socket.data.displayName = decoded.username || decoded.email?.split('@')[0] || 'Player';
      return next();
    } catch (_) {
      return next(new Error('Socket authentication token is invalid'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, displayName } = socket.data;
    console.log(`[Multiplay] connected: ${userId} socket=${socket.id}`);

    socket.on('join_room', ({ roomId }) => {
      if (typeof roomId !== 'string' || roomId.trim().length === 0 || roomId.length > 128) {
        socket.emit('room_error', { message: 'Invalid room id' });
        return;
      }

      const isHost = !rooms.has(roomId);
      if (!isHost && rooms.get(roomId).size >= 2) {
        socket.emit('room_error', { message: 'Room is full' });
        return;
      }
      if (isHost) rooms.set(roomId, new Map());

      const room = rooms.get(roomId);
      room.set(socket.id, { userId, displayName });
      socket.join(roomId);
      socket.data.roomId = roomId;

      const players = [...room.values()].map(p => ({ userId: p.userId, displayName: p.displayName }));
      socket.emit('room_joined', { roomId, isHost, hostId: roomId, players });
      socket.to(roomId).emit('peer_joined', { userId, displayName });
      console.log(`[Multiplay] ${userId} joined room ${roomId} (isHost=${isHost}, size=${room.size})`);
    });

    socket.on('game_event', (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.to(roomId).emit('game_event', { ...payload, fromUserId: userId });
    });

    socket.on('request_snapshot', () => {
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit('snapshot_requested', { fromUserId: userId });
    });

    socket.on('world_snapshot', (snapshot) => {
      const roomId = socket.data.roomId;
      if (roomId) socket.to(roomId).emit('world_snapshot', { ...snapshot, fromUserId: userId });
    });

    socket.on('leave_room', () => cleanup(socket, io));
    socket.on('disconnect', () => cleanup(socket, io));
  });

  _io = io;
  console.log('[Multiplay] Socket.io server ready');
  return io;
}

function cleanup(socket, io) {
  const { roomId, userId } = socket.data;
  if (!roomId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  room.delete(socket.id);
  socket.leave(roomId);
  if (room.size === 0) {
    rooms.delete(roomId);
    console.log(`[Multiplay] room ${roomId} deleted`);
  } else {
    io.to(roomId).emit('peer_left', { userId });
    console.log(`[Multiplay] ${userId} left room ${roomId}`);
  }
  socket.data.roomId = null;
}

module.exports = { initMultiplay, getIo };
