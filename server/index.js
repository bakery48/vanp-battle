'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GameRoom, generateRoomCode } = require('./GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// Rooms map: roomCode -> GameRoom
const rooms = {};
// socketId -> roomCode
const playerRoom = {};

// Broadcast battle state every 100ms
setInterval(() => {
  Object.values(rooms).forEach(room => {
    room.broadcastBattleState();
  });
}, 100);

io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // Create a new room
  socket.on('create_room', ({ name, rounds }) => {
    let code;
    do { code = generateRoomCode(); } while (rooms[code]);

    const room = new GameRoom(io, code);
    if (rounds) room.totalRounds = Math.max(1, Math.min(5, rounds));
    rooms[code] = room;

    const player = room.addPlayer(socket.id, name);
    playerRoom[socket.id] = code;
    socket.join(code);

    socket.emit('room_created', {
      roomCode: code,
      player,
      players: room.getPlayersPublic(),
      hostId: room.hostId,
      totalRounds: room.totalRounds,
    });

    console.log(`Room created: ${code} by ${socket.id}`);
  });

  // Join existing room
  socket.on('join_room', ({ roomCode, name }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit('join_error', { message: 'Room not found' });
      return;
    }
    if (room.phase !== 'lobby') {
      socket.emit('join_error', { message: 'Game already in progress' });
      return;
    }
    if (room.getPlayerCount() >= 8) {
      socket.emit('join_error', { message: 'Room is full' });
      return;
    }

    const player = room.addPlayer(socket.id, name);
    playerRoom[socket.id] = code;
    socket.join(code);

    socket.emit('room_joined', {
      roomCode: code,
      player,
      players: room.getPlayersPublic(),
      hostId: room.hostId,
      totalRounds: room.totalRounds,
    });

    // Notify others
    socket.to(code).emit('player_join', {
      player: room.getPlayersPublic().find(p => p.id === socket.id),
      players: room.getPlayersPublic(),
      hostId: room.hostId,
    });

    console.log(`Player ${socket.id} joined room ${code}`);
  });

  // Host sets round count
  socket.on('set_rounds', ({ rounds }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    if (room.setRounds(rounds, socket.id)) {
      io.to(code).emit('rounds_updated', { totalRounds: room.totalRounds });
    }
  });

  // Host sets CPU count (solo play only)
  socket.on('set_cpu_count', ({ count }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    if (room.setCpuCount(count, socket.id)) {
      socket.emit('cpu_count_updated', { cpuCount: room.cpuCount });
    }
  });

  // Bot defeated (reported by host client)
  socket.on('bot_defeated', ({ botId }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.botDefeated(botId);
  });

  // Host starts game
  socket.on('start_game', () => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.startGame(socket.id);
  });

  // Solo phase ended - send stats to server
  socket.on('solo_end', (stats) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.playerSoloEnd(socket.id, stats);
  });

  // Shop: buy item
  socket.on('shop_buy', ({ itemId }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    const result = room.playerShopBuy(socket.id, itemId);
    socket.emit('shop_buy_result', result);
  });

  // Shop: player ready
  socket.on('shop_ready', () => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.playerShopReady(socket.id);

    // Notify all about readiness
    io.to(code).emit('shop_player_ready', {
      id: socket.id,
      readyCount: room.shopReadySet.size,
      totalCount: room.getPlayerCount(),
    });
  });

  // Battle: position update
  socket.on('battle_position', ({ x, y }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.updateBattlePosition(socket.id, x, y);
  });

  // Battle: player died
  socket.on('player_died', ({ killedBy }) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    room.playerDefeated(socket.id, killedBy);
  });

  // Return to lobby
  socket.on('return_to_lobby', () => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    room.returnToLobby();
  });

  // Relay battle attack event to others in room
  socket.on('battle_attack', (data) => {
    const code = playerRoom[socket.id];
    if (!code) return;
    socket.to(code).emit('battle_attack', { ...data, fromId: socket.id });
  });

  // Relay battle hit event
  socket.on('battle_hit', (data) => {
    const code = playerRoom[socket.id];
    const room = rooms[code];
    if (!room) return;

    const target = room.players[data.targetId];
    if (!target || !target.alive) return;

    // Apply damage on server
    let dmg = data.damage;
    if (target.shield) {
      target.shield = false;
      dmg = 0;
      io.to(code).emit('shield_blocked', { targetId: data.targetId });
    } else {
      target.hp = Math.max(0, target.hp - dmg);
    }

    io.to(code).emit('battle_hit_confirmed', {
      targetId: data.targetId,
      damage: dmg,
      hp: target.hp,
      maxHp: target.maxHp,
    });

    if (target.hp <= 0) {
      room.playerDefeated(data.targetId, socket.id);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] Socket disconnected: ${socket.id}`);
    const code = playerRoom[socket.id];
    if (code && rooms[code]) {
      const room = rooms[code];
      const wasHost = room.hostId === socket.id;
      room.removePlayer(socket.id);
      delete playerRoom[socket.id];

      if (room.getPlayerCount() === 0) {
        room.destroy();
        delete rooms[code];
        console.log(`Room ${code} destroyed (empty)`);
      } else {
        io.to(code).emit('player_leave', {
          id: socket.id,
          players: room.getPlayersPublic(),
          hostId: room.hostId,
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`vanp-battle server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nError: Port ${PORT} is already in use.`);
    console.error(`Please stop the existing process or use a different port:`);
    console.error(`  PORT=3001 npm start\n`);
    process.exit(1);
  } else {
    throw err;
  }
});
