// NetworkManager.js - Singleton wrapper around socket.io
class NetworkManager {
  constructor() {
    this.socket = null;
    this.myId = null;
    this.roomCode = null;
    this.myPlayer = null;
    this.players = [];
    this.hostId = null;
    this.totalRounds = 3;
    this.listeners = {};
  }

  connect() {
    if (this.socket && this.socket.connected) return;
    this.socket = io();

    this.socket.on('connect', () => {
      this.myId = this.socket.id;
      this._emit('connected', { id: this.myId });
    });

    this.socket.on('disconnect', () => {
      this._emit('disconnected', {});
    });

    // Proxy all server events
    const events = [
      'room_created', 'room_joined', 'join_error',
      'player_join', 'player_leave',
      'rounds_updated', 'cpu_count_updated',
      'phase_change',
      'solo_end',
      'shop_buy_result', 'shop_player_ready',
      'battle_state', 'battle_attack', 'battle_hit_confirmed',
      'player_defeated', 'shield_blocked',
      'boss_state', 'boss_attack', 'boss_aoe_warning',
      'mob_kill', 'mob_enemy_spawned', 'mob_enemy_positions', 'mob_end', 'mob_timer',
      'battle_mode_updated',
    ];
    events.forEach(ev => {
      this.socket.on(ev, data => this._emit(ev, data));
    });
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  off(event, cb) {
    if (!this.listeners[event]) return;
    if (cb) {
      this.listeners[event] = this.listeners[event].filter(f => f !== cb);
    } else {
      this.listeners[event] = [];
    }
  }

  _emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }

  send(event, data) {
    if (!this.socket) return;
    this.socket.emit(event, data);
  }

  createRoom(name, rounds) {
    this.send('create_room', { name, rounds });
  }

  joinRoom(roomCode, name) {
    this.send('join_room', { roomCode, name });
  }

  setRounds(rounds) {
    this.send('set_rounds', { rounds });
  }

  setCpuCount(count) {
    this.send('set_cpu_count', { count });
  }

  reportBotDefeated(botId) {
    this.send('bot_defeated', { botId });
  }

  startGame() {
    this.send('start_game');
  }

  sendSoloEnd(stats) {
    this.send('solo_end', stats);
  }

  shopBuy(itemId) {
    this.send('shop_buy', { itemId });
  }

  shopReady() {
    this.send('shop_ready');
  }

  sendBattlePosition(x, y) {
    this.send('battle_position', { x, y });
  }

  sendPlayerDied(killedBy) {
    this.send('player_died', { killedBy });
  }

  sendBattleAttack(data) {
    this.send('battle_attack', data);
  }

  sendBattleHit(targetId, damage) {
    this.send('battle_hit', { targetId, damage });
  }

  returnToLobby() {
    this.send('return_to_lobby');
  }

  setBattleMode(mode) {
    this.send('set_battle_mode', { mode });
  }

  sendBossHit(damage) {
    this.send('boss_hit', { damage });
  }

  sendMobEnemySpawn(data) {
    this.send('mob_enemy_spawn', data);
  }

  sendMobEnemyPositions(updates) {
    this.send('mob_enemy_positions', updates);
  }

  sendMobHit(enemyId, damage) {
    this.send('mob_hit', { enemyId, damage });
  }

  isHost() {
    return this.myId && this.hostId && this.myId === this.hostId;
  }
}

// Global singleton
window.network = new NetworkManager();
