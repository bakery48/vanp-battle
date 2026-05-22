'use strict';

const PHASES = {
  LOBBY: 'lobby',
  SOLO: 'solo',
  SHOP: 'shop',
  BATTLE: 'battle',
  RESULT: 'result',
};

const SOLO_DURATION = 120000;
const SHOP_DURATION = 30000;

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

class GameRoom {
  constructor(io, roomCode) {
    this.io = io;
    this.roomCode = roomCode;
    this.phase = PHASES.LOBBY;
    this.players = {};       // socketId -> player data (humans only)
    this.bots = {};          // botId -> bot data
    this.hostId = null;
    this.totalRounds = 3;
    this.cpuCount = 0;
    this.currentRound = 0;
    this.phaseTimer = null;
    this.shopReadySet = new Set();

    // Battle mode
    this.battleMode = 'random'; // 'random'|'royale'|'boss'|'mob'
    this.selectedMode = null;   // actual mode chosen
    this.bossState = null;      // boss mode state
    this.mobState = null;       // mob mode state
    this.mobEnemies = {};       // enemyId -> { hp, maxHp, active, killedBy }
    this.mobTimer = null;
    this.bossAttackTimer = null;
    this.bossSpreadTimer = null;
  }

  // ── Human player management ──────────────────────────────────────

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
      isBot: false,
      ready: false,
      hp: 100, maxHp: 100,
      speed: 160, power: 10, fireRate: 500,
      bulletCount: 1, bulletSpeed: 400, collectRange: 80,
      pierce: false, shield: false,
      gold: 0, exp: 0, level: 1, score: 0, alive: true, abilities: [],
      x: 0, y: 0,
    };

    if (!this.hostId) this.hostId = socketId;

    // If a second human joins, clear CPUs
    if (Object.keys(this.players).length > 1 && this.cpuCount > 0) {
      this.cpuCount = 0;
      this.bots = {};
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

    if (this.phase === PHASES.BATTLE) {
      if (this.selectedMode === 'royale') {
        this._checkBattleEnd();
      }
    }
  }

  getPlayerCount() { return Object.keys(this.players).length; }

  getPlayersPublic() {
    return Object.values(this.players).map(p => ({
      id: p.id, name: p.name, color: p.color, colorIndex: p.colorIndex,
      ready: p.ready, alive: p.alive, isBot: false,
    }));
  }

  // ── Config ───────────────────────────────────────────────────────

  setRounds(count, socketId) {
    if (socketId !== this.hostId) return false;
    this.totalRounds = Math.max(1, Math.min(5, count));
    return true;
  }

  setCpuCount(count, socketId) {
    if (socketId !== this.hostId) return false;
    if (Object.keys(this.players).length > 1) return false; // only in solo mode
    this.cpuCount = Math.max(0, Math.min(7, count));
    this._rebuildBots();
    return true;
  }

  setBattleMode(mode, socketId) {
    if (socketId !== this.hostId) return false;
    if (!['random', 'royale', 'boss', 'mob'].includes(mode)) return false;
    this.battleMode = mode;
    return true;
  }

  // ── Bot management ───────────────────────────────────────────────

  _rebuildBots() {
    this.bots = {};
    const botColors = [0xff4444, 0x4488ff, 0x44cc44, 0xffdd00, 0xaa44ff, 0xff8800, 0x44dddd, 0xff88cc];
    const usedIndices = Object.values(this.players).map(p => p.colorIndex);

    for (let i = 0; i < this.cpuCount; i++) {
      const id = `bot_${i}`;
      let colorIndex = 0;
      for (let ci = 0; ci < botColors.length; ci++) {
        if (!usedIndices.includes(ci)) { colorIndex = ci; usedIndices.push(ci); break; }
      }
      this.bots[id] = {
        id, name: `CPU ${i + 1}`, isBot: true, colorIndex,
        color: botColors[colorIndex],
        hp: 100, maxHp: 100,
        speed: 140, power: 8, fireRate: 600,
        bulletCount: 1, bulletSpeed: 350, collectRange: 80,
        pierce: false, shield: false,
        gold: 0, exp: 0, level: 1, score: 0, alive: true, abilities: [],
        x: 0, y: 0,
      };
    }
  }

  // Scale bot stats to simulate N rounds of solo play
  _scaleBotStats(bot, rounds) {
    const s = 1 + (rounds - 1) * 0.35;
    bot.power       = Math.round(10 * s);
    bot.maxHp       = Math.round(100 + (rounds - 1) * 40);
    bot.hp          = bot.maxHp;
    bot.fireRate    = Math.max(180, Math.round(500 / Math.sqrt(s)));
    bot.speed       = Math.round(140 * (1 + (rounds - 1) * 0.06));
    bot.bulletSpeed = Math.round(350 * (1 + (rounds - 1) * 0.05));
    if (rounds >= 2) bot.bulletCount = Math.random() > 0.4 ? 2 : 1;
    if (rounds >= 3) bot.pierce      = Math.random() > 0.5;
  }

  botDefeated(botId) {
    const bot = this.bots[botId];
    if (!bot || !bot.alive) return;
    bot.alive = false;

    this.io.to(this.roomCode).emit('player_defeated', {
      id: botId, name: bot.name, killedBy: null,
    });

    if (this.selectedMode === 'royale' || this.selectedMode === null) {
      this._checkBattleEnd();
    }
  }

  // ── Phase management ─────────────────────────────────────────────

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

    Object.values(this.players).forEach(p => { p.alive = true; });

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.SOLO,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      duration: SOLO_DURATION,
    });

    this.phaseTimer = setTimeout(() => this._startShopPhase(), SOLO_DURATION);
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

    this.phaseTimer = setTimeout(() => this._advanceFromShop(), SHOP_DURATION);
  }

  playerSoloEnd(socketId, stats) {
    const p = this.players[socketId];
    if (!p) return;
    Object.assign(p, {
      hp: stats.hp, maxHp: stats.maxHp, speed: stats.speed, power: stats.power,
      fireRate: stats.fireRate, bulletCount: stats.bulletCount, bulletSpeed: stats.bulletSpeed,
      collectRange: stats.collectRange, pierce: stats.pierce,
      shield: stats.shield !== undefined ? stats.shield : p.shield,
      gold: stats.gold, exp: stats.exp, level: stats.level,
      score: stats.score, abilities: stats.abilities || [],
    });
  }

  playerShopBuy(socketId, itemId) {
    const p = this.players[socketId];
    if (!p || this.phase !== PHASES.SHOP) return { success: false };

    const items = {
      atk_up:    { cost: 50, apply: p => { p.power *= 1.25; } },
      fire_up:   { cost: 40, apply: p => { p.fireRate = Math.max(50, p.fireRate * 0.8); } },
      speed_up:  { cost: 30, apply: p => { p.speed *= 1.15; } },
      hp_potion: { cost: 20, apply: p => { p.hp = Math.min(p.maxHp, p.hp + 50); } },
      maxhp_up:  { cost: 60, apply: p => { p.maxHp += 100; p.hp += 100; } },
      shield:    { cost: 80, apply: p => { p.shield = true; } },
    };

    const item = items[itemId];
    if (!item || p.gold < item.cost) return { success: false };
    p.gold -= item.cost;
    item.apply(p);
    return { success: true, stats: this._getPlayerStats(p) };
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

    // Determine selected mode
    if (this.battleMode === 'random') {
      const modes = ['royale', 'boss', 'mob'];
      this.selectedMode = modes[Math.floor(Math.random() * modes.length)];
    } else {
      this.selectedMode = this.battleMode;
    }

    // Scale bot stats before battle
    Object.values(this.bots).forEach(bot => this._scaleBotStats(bot, this.totalRounds));

    const allCombatants = [
      ...Object.values(this.players),
      ...Object.values(this.bots),
    ];

    const mapSize = 1500;
    const radius  = 500;
    const cx = mapSize / 2, cy = mapSize / 2;

    allCombatants.forEach((p, index) => {
      const angle = (index / allCombatants.length) * Math.PI * 2;
      p.x = cx + Math.cos(angle) * radius;
      p.y = cy + Math.sin(angle) * radius;
      p.alive = true;
    });

    const battleState = {};
    allCombatants.forEach(p => { battleState[p.id] = this._getBattlePlayerData(p); });

    // Embed mode in battleState
    battleState.__mode = this.selectedMode;

    // Initialize mode-specific state
    if (this.selectedMode === 'boss') {
      const bossMaxHp = 3000 * this.totalRounds;
      this.bossState = {
        hp: bossMaxHp,
        maxHp: bossMaxHp,
        x: 750,
        y: 750,
        damages: {},
      };

      // Boss attack timer: normal attacks every 2 seconds
      this.bossAttackTimer = setInterval(() => {
        if (this.phase !== PHASES.BATTLE) return;
        const players = Object.values(this.players).filter(p => p.alive);
        const angles = players.map(p => Math.atan2(p.y - 750, p.x - 750));
        if (angles.length > 0) {
          this.io.to(this.roomCode).emit('boss_attack', { angles, type: 'normal', damage: 15 });
        }
      }, 2000);

      // Boss spread attack every 8 seconds
      this.bossSpreadTimer = setInterval(() => {
        if (this.phase !== PHASES.BATTLE) return;
        const angles = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
        this.io.to(this.roomCode).emit('boss_aoe_warning', { duration: 1500 });
        setTimeout(() => {
          if (this.phase !== PHASES.BATTLE) return;
          this.io.to(this.roomCode).emit('boss_attack', { angles, type: 'spread', damage: 25 });
        }, 1500);
      }, 8000);

    } else if (this.selectedMode === 'mob') {
      const kills = {};
      Object.keys(this.players).forEach(id => { kills[id] = 0; });

      this.mobState = {
        kills,
        timer: 90,
      };
      this.mobEnemies = {};

      // 90 second countdown timer
      this.mobTimer = setInterval(() => {
        if (this.phase !== PHASES.BATTLE) return;
        this.mobState.timer--;
        this.io.to(this.roomCode).emit('mob_timer', { timeLeft: this.mobState.timer });
        if (this.mobState.timer <= 0) {
          this._endMobMode();
        }
      }, 1000);
    }

    this.io.to(this.roomCode).emit('phase_change', {
      phase: PHASES.BATTLE,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      battleState,
      battleMode: this.selectedMode,
    });
  }

  // ── Boss mode ────────────────────────────────────────────────────

  processBossHit(socketId, damage) {
    if (!this.bossState) return;
    const p = this.players[socketId];
    if (!p || !p.alive) return;

    this.bossState.hp = Math.max(0, this.bossState.hp - damage);
    if (!this.bossState.damages[socketId]) this.bossState.damages[socketId] = 0;
    this.bossState.damages[socketId] += damage;

    this.io.to(this.roomCode).emit('boss_state', {
      hp: this.bossState.hp,
      maxHp: this.bossState.maxHp,
      damages: this.bossState.damages,
    });

    if (this.bossState.hp <= 0) {
      this._endBossMode();
    }
  }

  _endBossMode() {
    this._clearBossTimers();

    // Find max damage player
    let winnerId = null;
    let maxDmg = -1;
    for (const [id, dmg] of Object.entries(this.bossState.damages)) {
      if (dmg > maxDmg) {
        maxDmg = dmg;
        winnerId = id;
      }
    }

    const winner = winnerId ? this.players[winnerId] : null;
    this._endBattle(winner);
  }

  _clearBossTimers() {
    if (this.bossAttackTimer) { clearInterval(this.bossAttackTimer); this.bossAttackTimer = null; }
    if (this.bossSpreadTimer) { clearInterval(this.bossSpreadTimer); this.bossSpreadTimer = null; }
  }

  // ── Mob mode ─────────────────────────────────────────────────────

  addMobEnemy(id, x, y, hp, type) {
    this.mobEnemies[id] = { hp, maxHp: hp, active: true, type };
  }

  processMobHit(socketId, enemyId, damage) {
    const enemy = this.mobEnemies[enemyId];
    if (!enemy || !enemy.active) return;

    enemy.hp -= damage;

    if (enemy.hp <= 0) {
      enemy.active = false;
      enemy.killedBy = socketId;

      if (this.mobState && this.mobState.kills[socketId] !== undefined) {
        this.mobState.kills[socketId]++;
      } else if (this.mobState) {
        this.mobState.kills[socketId] = 1;
      }

      this.io.to(this.roomCode).emit('mob_kill', {
        enemyId,
        killedBy: socketId,
        kills: this.mobState ? this.mobState.kills : {},
      });
    }
  }

  _endMobMode() {
    if (this.mobTimer) { clearInterval(this.mobTimer); this.mobTimer = null; }

    const kills = this.mobState ? this.mobState.kills : {};

    const rankings = Object.values(this.players).map(p => ({
      id: p.id, name: p.name, color: p.color,
      kills: kills[p.id] || 0,
      alive: p.alive,
    })).sort((a, b) => b.kills - a.kills).map((p, i) => ({ ...p, rank: i + 1 }));

    const winner = rankings[0] || null;

    this.io.to(this.roomCode).emit('phase_change', {
      phase: 'result',
      winner: winner ? { id: winner.id, name: winner.name } : null,
      rankings,
      killMode: true,
    });
    this.phase = PHASES.RESULT;
  }

  // ── Battle ────────────────────────────────────────────────────────

  updateBattlePosition(socketId, x, y) {
    const p = this.players[socketId];
    if (!p || !p.alive) return;
    p.x = x;
    p.y = y;
  }

  playerDefeated(socketId, killedBy) {
    const p = this.players[socketId];
    if (!p || !p.alive) return;
    p.alive = false;
    this.io.to(this.roomCode).emit('player_defeated', { id: socketId, name: p.name, killedBy });

    // Only check battle end for royale mode
    if (this.selectedMode === 'royale' || this.selectedMode === null) {
      this._checkBattleEnd();
    }
  }

  _checkBattleEnd() {
    const aliveHumans = Object.values(this.players).filter(p => p.alive);
    const aliveBots   = Object.values(this.bots).filter(b => b.alive);
    const aliveAll    = [...aliveHumans, ...aliveBots];

    // End when: no humans remain, OR only 1 combatant remains total
    if (aliveHumans.length === 0 || aliveAll.length <= 1) {
      const winner = aliveHumans[0] || aliveBots[0] || null;
      this._endBattle(winner);
    }
  }

  _endBattle(winner) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this._clearBossTimers();
    if (this.mobTimer) { clearInterval(this.mobTimer); this.mobTimer = null; }

    this.phase = PHASES.RESULT;

    const allPlayers = [
      ...Object.values(this.players),
      ...Object.values(this.bots),
    ];

    const rankings = allPlayers
      .sort((a, b) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : b.score - a.score))
      .map((p, i) => ({
        rank: i + 1, id: p.id, name: p.name,
        color: p.color, score: p.score, alive: p.alive,
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
    const allCombatants = [
      ...Object.values(this.players),
      ...Object.values(this.bots),
    ];
    allCombatants.forEach(p => {
      state[p.id] = { x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive };
    });
    this.io.to(this.roomCode).emit('battle_state', state);
  }

  _getBattlePlayerData(p) {
    return {
      id: p.id, name: p.name, color: p.color, colorIndex: p.colorIndex,
      isBot: p.isBot || false,
      x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
      speed: p.speed, power: p.power, fireRate: p.fireRate,
      bulletCount: p.bulletCount, bulletSpeed: p.bulletSpeed,
      pierce: p.pierce, shield: p.shield, alive: p.alive,
    };
  }

  _getPlayerStats(p) {
    return {
      hp: p.hp, maxHp: p.maxHp, speed: p.speed, power: p.power,
      fireRate: p.fireRate, bulletCount: p.bulletCount,
      bulletSpeed: p.bulletSpeed, collectRange: p.collectRange,
      pierce: p.pierce, shield: p.shield, gold: p.gold,
      exp: p.exp, level: p.level, score: p.score, abilities: p.abilities,
    };
  }

  returnToLobby() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this._clearBossTimers();
    if (this.mobTimer) { clearInterval(this.mobTimer); this.mobTimer = null; }

    this.phase = PHASES.LOBBY;
    this.currentRound = 0;
    this.shopReadySet.clear();
    this.bots = {};
    this.bossState = null;
    this.mobState = null;
    this.mobEnemies = {};
    this.selectedMode = null;

    Object.values(this.players).forEach(p => {
      Object.assign(p, {
        hp: 100, maxHp: 100, speed: 160, power: 10, fireRate: 500,
        bulletCount: 1, bulletSpeed: 400, collectRange: 80,
        pierce: false, shield: false, gold: 0, exp: 0,
        level: 1, score: 0, alive: true, abilities: [], ready: false,
      });
    });

    this.io.to(this.roomCode).emit('phase_change', { phase: PHASES.LOBBY });
  }

  destroy() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this._clearBossTimers();
    if (this.mobTimer) { clearInterval(this.mobTimer); this.mobTimer = null; }
  }
}

module.exports = { GameRoom, generateRoomCode, PHASES };
