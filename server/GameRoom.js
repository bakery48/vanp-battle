'use strict';

const PHASES = {
  LOBBY: 'lobby',
  SOLO: 'solo',
  SHOP: 'shop',
  BATTLE: 'battle',
  RESULT: 'result',
};

const SOLO_DURATION = 120000; // 2 minutes
const SHOP_DURATION = 30000;  // 30 seconds

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

class GameRoom {
  constructor(io, roomCode) {
    this.io = io;
    this.roomCode = roomCode;
    this.phase = PHASES.LOBBY;
    this.players = {}; // socketId -> player data
    this.hostId = null;
    this.totalRounds = 3;
    this.currentRound = 0;
    this.phaseTimer = null;
    this.shopReadySet = new Set();
    this.battlePositions = {}; // socketId -> {x, y}
  }

  addPlayer(socketId, name) {
    const colors = [0xff4444, 0x4488ff, 0x44cc44, 0xffdd00, 0xaa44ff, 0xff8800, 0x44dddd, 0xff88cc];
    const usedIndices = Object.values(this.players).map(p => p.colorIndex);
    let colorIndex = 0;
    for (let i = 0; i < colors.length; i++) {
      if (!usedIndices.includes(i)) { colorIndex = i; break; }
    }

    this.players[socketId] = {
      id: socketId,
      name: name || `Player${Object.keys(this.players).length + 1}`,
      colorIndex,
      color: colors[colorIndex],
      ready: false,
      // stats
      hp: 100,
      maxHp: 100,
      speed: 160,
      power: 10,
      fireRate: 500,
      bulletCount: 1,
      bulletSpeed: 400,
      collectRange: 80,
      pierce: false,
      shield: false,
      gold: 0,
      exp: 0,
      level: 1,
      score: 0,
      alive: true,
      abilities: [],
      // battle state
      x: 0,
      y: 0,
    };

    if (!this.hostId) {
      this.hostId = socketId;
    }

    return this.players[socketId];
  }

  removePlayer(socketId) {
    delete this.players[socketId];
    this.shopReadySet.delete(socketId);

    if (this.hostId === socketId) {
      const remaining = Object.keys(this.players);
      this.hostId = remaining.length > 0 ? remaining[0] : null;
    }

    // If battle phase, check if game should end
    if (this.phase === PHASES.BATTLE) {
      this._checkBattleEnd();
    }
  }

  getPlayerCount() {
    return Object.keys(this.players).length;
  }

  getPlayersPublic() {
    return Object.values(this.players).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      colorIndex: p.colorIndex,
      ready: p.ready,
      alive: p.alive,
    }));
  }

  setRounds(count, socketId) {
    if (socketId !== this.hostId) return false;
    this.totalRounds = Math.max(1, Math.min(5, count));
    return true;
  }

  startGame(socketId) {
    if (socketId !== this.hostId) return false;
    if (this.phase !== PHASES.LOBBY) return false;
    if (this.getPlayerCount() < 1) return false;

    this.currentRound = 0;
    this._startSoloPhase();
    return true;
  }

  _startSoloPhase() {
    this.currentRound++;
    this.phase = PHASES.SOLO;
    this.shopReadySet.clear();

    // Reset alive status for solo
    Object.values(this.players).forEach(p => {
      p.alive = true;
    });

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.SOLO,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      duration: SOLO_DURATION,
    });

    this.phaseTimer = setTimeout(() => {
      this._startShopPhase();
    }, SOLO_DURATION);
  }

  _startShopPhase() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = PHASES.SHOP;
    this.shopReadySet.clear();

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.SHOP,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      duration: SHOP_DURATION,
    });

    this.phaseTimer = setTimeout(() => {
      this._advanceFromShop();
    }, SHOP_DURATION);
  }

  playerSoloEnd(socketId, stats) {
    const p = this.players[socketId];
    if (!p) return;
    // Update stats from solo phase result
    p.hp = stats.hp;
    p.maxHp = stats.maxHp;
    p.speed = stats.speed;
    p.power = stats.power;
    p.fireRate = stats.fireRate;
    p.bulletCount = stats.bulletCount;
    p.bulletSpeed = stats.bulletSpeed;
    p.collectRange = stats.collectRange;
    p.pierce = stats.pierce;
    p.shield = stats.shield !== undefined ? stats.shield : p.shield;
    p.gold = stats.gold;
    p.exp = stats.exp;
    p.level = stats.level;
    p.score = stats.score;
    p.abilities = stats.abilities || [];
  }

  playerShopBuy(socketId, itemId) {
    const p = this.players[socketId];
    if (!p || this.phase !== PHASES.SHOP) return { success: false, reason: 'Invalid state' };

    const items = {
      atk_up:     { cost: 50, apply: p => { p.power *= 1.25; } },
      fire_up:    { cost: 40, apply: p => { p.fireRate = Math.max(50, p.fireRate * 0.8); } },
      speed_up:   { cost: 30, apply: p => { p.speed *= 1.15; } },
      hp_potion:  { cost: 20, apply: p => { p.hp = Math.min(p.maxHp, p.hp + 50); } },
      maxhp_up:   { cost: 60, apply: p => { p.maxHp += 100; p.hp += 100; } },
      shield:     { cost: 80, apply: p => { p.shield = true; } },
    };

    const item = items[itemId];
    if (!item) return { success: false, reason: 'Unknown item' };
    if (p.gold < item.cost) return { success: false, reason: 'Not enough gold' };

    p.gold -= item.cost;
    item.apply(p);

    return {
      success: true,
      stats: this._getPlayerStats(p),
    };
  }

  playerShopReady(socketId) {
    if (this.phase !== PHASES.SHOP) return;
    this.shopReadySet.add(socketId);
    const allReady = Object.keys(this.players).every(id => this.shopReadySet.has(id));
    if (allReady) {
      if (this.phaseTimer) clearTimeout(this.phaseTimer);
      this._advanceFromShop();
    }
  }

  _advanceFromShop() {
    if (this.currentRound < this.totalRounds) {
      this._startSoloPhase();
    } else {
      this._startBattlePhase();
    }
  }

  _startBattlePhase() {
    this.phase = PHASES.BATTLE;

    // Set spawn positions for all players
    const playerIds = Object.keys(this.players);
    const mapSize = 1500;
    const centerX = mapSize / 2;
    const centerY = mapSize / 2;
    const radius = 500;

    playerIds.forEach((id, index) => {
      const angle = (index / playerIds.length) * Math.PI * 2;
      const p = this.players[id];
      p.x = centerX + Math.cos(angle) * radius;
      p.y = centerY + Math.sin(angle) * radius;
      p.alive = true;
    });

    // Build initial state for all players
    const battleState = {};
    Object.values(this.players).forEach(p => {
      battleState[p.id] = this._getBattlePlayerData(p);
    });

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.BATTLE,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      battleState,
    });
  }

  updateBattlePosition(socketId, x, y) {
    const p = this.players[socketId];
    if (!p || !p.alive) return;
    p.x = x;
    p.y = y;
    this.battlePositions[socketId] = { x, y };
  }

  playerDefeated(socketId, killedBy) {
    const p = this.players[socketId];
    if (!p || !p.alive) return;
    p.alive = false;

    this.io.to(this.roomCode).emit('player_defeated', {
      id: socketId,
      name: p.name,
      killedBy,
    });

    this._checkBattleEnd();
  }

  _checkBattleEnd() {
    const alivePlayers = Object.values(this.players).filter(p => p.alive);
    if (alivePlayers.length <= 1) {
      const winner = alivePlayers.length === 1 ? alivePlayers[0] : null;
      this._endBattle(winner);
    }
  }

  _endBattle(winner) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = PHASES.RESULT;

    const rankings = Object.values(this.players)
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return b.score - a.score;
      })
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        alive: p.alive,
      }));

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.RESULT,
      winner: winner ? { id: winner.id, name: winner.name, color: winner.color } : null,
      rankings,
    });
  }

  broadcastBattleState() {
    if (this.phase !== PHASES.BATTLE) return;
    const state = {};
    Object.values(this.players).forEach(p => {
      state[p.id] = { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive };
    });
    this.io.to(this.roomCode).emit('battle_state', state);
  }

  _getBattlePlayerData(p) {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      colorIndex: p.colorIndex,
      x: p.x,
      y: p.y,
      hp: p.hp,
      maxHp: p.maxHp,
      speed: p.speed,
      power: p.power,
      fireRate: p.fireRate,
      bulletCount: p.bulletCount,
      bulletSpeed: p.bulletSpeed,
      pierce: p.pierce,
      shield: p.shield,
      alive: p.alive,
    };
  }

  _getPlayerStats(p) {
    return {
      hp: p.hp,
      maxHp: p.maxHp,
      speed: p.speed,
      power: p.power,
      fireRate: p.fireRate,
      bulletCount: p.bulletCount,
      bulletSpeed: p.bulletSpeed,
      collectRange: p.collectRange,
      pierce: p.pierce,
      shield: p.shield,
      gold: p.gold,
      exp: p.exp,
      level: p.level,
      score: p.score,
      abilities: p.abilities,
    };
  }

  returnToLobby() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = PHASES.LOBBY;
    this.currentRound = 0;
    this.shopReadySet.clear();

    // Reset player stats
    Object.values(this.players).forEach(p => {
      p.hp = 100;
      p.maxHp = 100;
      p.speed = 160;
      p.power = 10;
      p.fireRate = 500;
      p.bulletCount = 1;
      p.bulletSpeed = 400;
      p.collectRange = 80;
      p.pierce = false;
      p.shield = false;
      p.gold = 0;
      p.exp = 0;
      p.level = 1;
      p.score = 0;
      p.alive = true;
      p.abilities = [];
      p.ready = false;
    });

    this.io.to(this.roomCode).emit('phase_change', { phase: PHASES.LOBBY });
  }

  destroy() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
  }
}

module.exports = { GameRoom, generateRoomCode, PHASES };
