// BattleScene.js - PvP Battle Phase
class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
    this._handlers = [];
    this.myStats = null;
    this.players = {}; // id -> { gfx, hpBg, hpBar, nameTxt, x, y, hp, maxHp, alive, speed, power, fireRate, bulletCount, bulletSpeed, shield, pierce }
    this.myBullets = [];
    this.otherBullets = [];
    this.botBullets = [];
    this.fireTimer = 0;
    this.positionTimer = 0;
    this.isDead = false;
    this.spectateTarget = null;
    this.worldW = 1500;
    this.worldH = 1500;

    // Input
    this.cursors = null;
    this.myX = 750;
    this.myY = 750;

    // Battle mode
    this.battleMode = 'royale';
    this.modeAnnounced = false;

    // Boss mode
    this.boss = null;           // { gfx, aura, hpBg, hpBar, hpTxt, x, y, hp, maxHp }
    this.bossBullets = [];
    this.bossAttackTimer = 0;

    // Mob mode
    this.mobEnemies = {};       // id -> { gfx, hpBg, hpBar, x, y, hp, maxHp, active, serverX, serverY }
    this.myKills = 0;
    this.killsDisplay = null;   // text object
    this.mobTimer = 90;
    this.mobTimerTxt = null;
    this.isHost = false;
    this.mobEnemyIdCounter = 0;
    this.mobSpawnTimer = 0;
    this.mobPositionTimer = 0;
    this.mobAuraTween = null;
  }

  init(data) {
    this.battleState = data.battleState || {};
    this.myStats = data.myStats ? new PlayerStats(data.myStats) : new PlayerStats();
    this.battleMode = (data.battleState && data.battleState.__mode) ? data.battleState.__mode : 'royale';
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const worldW = this.worldW;
    const worldH = this.worldH;

    // World background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a0a0a, 1);
    bg.fillRect(0, 0, worldW, worldH);
    // Grid
    bg.lineStyle(1, 0x2a1a1a, 0.6);
    for (let x = 0; x <= worldW; x += 100) bg.lineBetween(x, 0, x, worldH);
    for (let y = 0; y <= worldH; y += 100) bg.lineBetween(0, y, worldW, y);

    // Border
    const border = this.add.graphics();
    border.lineStyle(6, 0xff2222, 1);
    border.strokeRect(3, 3, worldW - 6, worldH - 6);
    border.setDepth(1);

    // Camera
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    // Input - force canvas focus
    this.sys.game.canvas.setAttribute('tabindex', '0');
    this.sys.game.canvas.focus();
    this.cursors = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.aimKeys = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.UP,
      down:  Phaser.Input.Keyboard.KeyCodes.DOWN,
      left:  Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });
    this.input.keyboard.resetKeys();
    this.lastAimAngle = 0;

    // Aim indicator
    this.aimIndicator = this.add.graphics().setDepth(12);

    // Create player sprites from initial battle state
    const myId = window.network.myId;
    this.isHost = window.network.isHost();

    for (const [id, pData] of Object.entries(this.battleState)) {
      if (id === '__mode') continue; // skip mode marker
      this._createPlayerSprite(id, pData);
      if (id === myId) {
        this.myX = pData.x;
        this.myY = pData.y;
        const me = this.players[myId];
        if (me) {
          // Apply myStats (from shop)
          pData.hp = this.myStats.hp;
          pData.maxHp = this.myStats.maxHp;
          pData.speed = this.myStats.speed;
          pData.power = this.myStats.power;
          pData.fireRate = this.myStats.fireRate;
          pData.bulletCount = this.myStats.bulletCount;
          pData.bulletSpeed = this.myStats.bulletSpeed;
          pData.pierce = this.myStats.pierce;
          pData.shield = this.myStats.shield;
          me.hp = pData.hp;
          me.maxHp = pData.maxHp;
          me.speed = pData.speed;
          me.power = pData.power;
          me.fireRate = pData.fireRate;
          me.bulletCount = pData.bulletCount;
          me.bulletSpeed = pData.bulletSpeed;
          me.pierce = pData.pierce;
          me.shield = pData.shield;
          this._updatePlayerHpBar(id);
        }
        this.cameras.main.startFollow(this.players[id].gfx, true, 0.1, 0.1);
      }
    }

    // HUD
    this._createHUD();

    // Mode-specific initialization
    if (this.battleMode === 'boss') {
      this._initBossMode();
    } else if (this.battleMode === 'mob') {
      this._initMobMode();
    }

    // Show mode announcement
    const modeLabels = {
      royale: '⚔️ バトルロイヤル！',
      boss:   '👾 ボス討伐！',
      mob:    '💀 殲滅戦！',
    };
    this._showModeAnnouncement(modeLabels[this.battleMode] || '⚔️ バトル開始！');

    // Network events
    this._addHandler('battle_state', (state) => {
      for (const [id, data] of Object.entries(state)) {
        if (id === myId) continue; // don't update own position from server
        if (this.players[id]) {
          const p = this.players[id];
          // Smooth interpolation
          p.serverX = data.x;
          p.serverY = data.y;
          p.hp = data.hp;
          p.maxHp = data.maxHp;
          p.alive = data.alive;
          this._updatePlayerHpBar(id);
          if (!data.alive && p.alive !== false) {
            p.alive = false;
            p.gfx.setAlpha(0.3);
          }
        }
      }
    });

    this._addHandler('battle_attack', (data) => {
      if (data.fromId === myId) return;
      const shooter = this.players[data.fromId];
      if (!shooter) return;
      this._spawnOtherBullet(shooter.x, shooter.y, data.vx, data.vy, data.fromId);
    });

    this._addHandler('battle_hit_confirmed', (data) => {
      const p = this.players[data.targetId];
      if (!p) return;
      p.hp = data.hp;
      p.maxHp = data.maxHp;
      this._updatePlayerHpBar(data.targetId);

      if (data.targetId === myId) {
        // Screen flash
        const flash = this.add.graphics();
        flash.fillStyle(0xff0000, 0.4);
        flash.fillRect(0, 0, W, H);
        flash.setScrollFactor(0).setDepth(500);
        this.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 300,
          onComplete: () => flash.destroy(),
        });
      }
    });

    this._addHandler('shield_blocked', (data) => {
      const p = this.players[data.targetId];
      if (p) p.shield = false;
      if (data.targetId === myId) this.myStats.shield = false;
    });

    this._addHandler('player_defeated', (data) => {
      const p = this.players[data.id];
      if (p) {
        p.alive = false;
        p.gfx.setAlpha(0.3);
        if (p.hpBar) p.hpBar.setAlpha(0.3);
      }

      if (data.id === myId) {
        this.isDead = true;
        this._showDeadMessage();
        // Find spectate target
        const alive = Object.values(this.players).filter(pl => pl.alive && pl.id !== myId);
        if (alive.length > 0) {
          this.spectateTarget = alive[0];
          this.cameras.main.startFollow(this.spectateTarget.gfx, true, 0.1, 0.1);
        }
      }
    });

    this._addHandler('phase_change', (data) => {
      if (data.phase === 'result') {
        this._showResultScreen(data.winner, data.rankings, data.killMode);
      } else if (data.phase === 'lobby') {
        this._cleanup();
        this.scene.start('LobbyScene');
      }
    });

    this._addHandler('player_leave', (data) => {
      const p = this.players[data.id];
      if (p) {
        p.alive = false;
        p.gfx.setAlpha(0.2);
      }
    });

    this._addHandler('disconnected', () => {
      this._cleanup();
      this.scene.start('LobbyScene');
    });

    // Boss mode events
    this._addHandler('boss_state', (data) => {
      if (!this.boss) return;
      this.boss.hp = data.hp;
      if (!this.boss.maxHp || this.boss.maxHp === 0) this.boss.maxHp = data.maxHp;
      this._updateBossHpBar();
      this._updateDamageDisplay(data.damages);
    });

    this._addHandler('boss_attack', (data) => {
      if (!this.boss) return;
      data.angles.forEach(angle => {
        this._spawnBossProjectile(this.boss.x, this.boss.y, angle, data.damage, data.type);
      });
    });

    this._addHandler('boss_aoe_warning', (data) => {
      this._showAoeWarning(data.duration);
    });

    // Mob mode events
    this._addHandler('mob_kill', (data) => {
      if (data.killedBy === myId) this.myKills++;
      const e = this.mobEnemies[data.enemyId];
      if (e) this._destroyMobEnemy(data.enemyId);
      this._updateKillsDisplay(data.kills);
    });

    this._addHandler('mob_enemy_spawned', (data) => {
      if (!this.isHost) this._createMobEnemy(data);
    });

    this._addHandler('mob_enemy_positions', (updates) => {
      if (this.isHost) return;
      updates.forEach(u => {
        if (this.mobEnemies[u.id]) {
          this.mobEnemies[u.id].serverX = u.x;
          this.mobEnemies[u.id].serverY = u.y;
        }
      });
    });

    this._addHandler('mob_timer', (data) => {
      this.mobTimer = data.timeLeft;
      if (this.mobTimerTxt) {
        this.mobTimerTxt.setText(`⏱ ${data.timeLeft}s`);
        if (data.timeLeft <= 10) this.mobTimerTxt.setColor('#ff4444');
        else if (data.timeLeft <= 30) this.mobTimerTxt.setColor('#ffaa44');
      }
    });
  }

  // ── Mode Announcement ────────────────────────────────────────────

  _showModeAnnouncement(text) {
    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, W, 120);
    overlay.setScrollFactor(0).setDepth(600);

    const txt = this.add.text(W / 2, 60, text, {
      fontSize: '48px', fontStyle: 'bold', color: '#f0c040',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(601);

    this.tweens.add({
      targets: [overlay, txt],
      alpha: 0,
      delay: 2000,
      duration: 1000,
      onComplete: () => { overlay.destroy(); txt.destroy(); },
    });
  }

  // ── Boss Mode ─────────────────────────────────────────────────────

  _initBossMode() {
    this._createBossGraphics();
    this._createBossHpBar();
    this._createDamageDisplay();
  }

  _createBossGraphics() {
    const x = 750, y = 750;

    // Aura ring
    const aura = this.add.graphics();
    aura.lineStyle(8, 0xff4400, 0.5);
    aura.strokeCircle(0, 0, 75);
    aura.x = x; aura.y = y;
    aura.setDepth(5);

    // Main body
    const g = this.add.graphics();
    g.fillStyle(0x880000, 1);
    g.fillCircle(0, 0, 60);
    g.lineStyle(4, 0xff2200, 1);
    g.strokeCircle(0, 0, 60);
    // Eyes
    g.fillStyle(0xff8800, 1);
    g.fillCircle(-18, -12, 12);
    g.fillCircle(18, -12, 12);
    g.fillStyle(0x000000, 1);
    g.fillCircle(-15, -12, 6);
    g.fillCircle(21, -12, 6);
    // Mouth
    g.lineStyle(3, 0xff0000, 1);
    g.strokeRect(-20, 10, 40, 14);
    g.x = x; g.y = y;
    g.setDepth(6);

    // Name tag
    const nameTxt = this.add.text(x, y - 80, '👾 BOSS', {
      fontSize: '20px', fontStyle: 'bold', color: '#ff4400',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(7);

    this.boss = {
      gfx: g, aura, nameTxt,
      x, y,
      hp: 0, maxHp: 0,
    };

    // Pulsing aura tween
    this.mobAuraTween = this.tweens.add({
      targets: aura,
      scaleX: 1.2, scaleY: 1.2,
      alpha: { from: 0.3, to: 0.8 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  _createBossHpBar() {
    const W = this.scale.width;

    // Background bar
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x330000, 1);
    hpBg.fillRoundedRect(W / 2 - 250, 55, 500, 24, 6);
    hpBg.lineStyle(2, 0xff4400, 1);
    hpBg.strokeRoundedRect(W / 2 - 250, 55, 500, 24, 6);
    hpBg.setScrollFactor(0).setDepth(110);

    // HP fill
    const hpBar = this.add.graphics();
    hpBar.setScrollFactor(0).setDepth(111);

    const hpTxt = this.add.text(W / 2, 67, 'BOSS HP', {
      fontSize: '14px', fontStyle: 'bold', color: '#ff8800',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(112);

    this.boss.hpBg = hpBg;
    this.boss.hpBar = hpBar;
    this.boss.hpTxt = hpTxt;
  }

  _updateBossHpBar() {
    if (!this.boss || !this.boss.hpBar) return;
    const W = this.scale.width;
    const ratio = Math.max(0, this.boss.hp / (this.boss.maxHp || 1));
    const bar = this.boss.hpBar;
    bar.clear();
    const col = ratio > 0.5 ? 0xff4400 : ratio > 0.25 ? 0xff8800 : 0xff0000;
    bar.fillStyle(col, 1);
    bar.fillRoundedRect(W / 2 - 248, 57, 496 * ratio, 20, 4);

    if (this.boss.hpTxt) {
      this.boss.hpTxt.setText(`BOSS  HP: ${Math.ceil(this.boss.hp)} / ${this.boss.maxHp}`);
    }
  }

  _createDamageDisplay() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.damageDisplay = this.add.text(W - 10, 60, '', {
      fontSize: '14px', color: '#ff8888', align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(110);
  }

  _updateDamageDisplay(damages) {
    if (!this.damageDisplay || !damages) return;
    const lines = ['ダメージ:'];
    const sorted = Object.entries(damages).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id, dmg]) => {
      const p = this.players[id];
      const name = p ? p.nameTxt.text : id.substring(0, 6);
      const isMine = id === window.network.myId;
      lines.push(`${isMine ? '►' : ' '} ${name}: ${Math.ceil(dmg)}`);
    });
    this.damageDisplay.setText(lines.join('\n'));
  }

  _spawnBossProjectile(bx, by, angle, damage, type) {
    const speed = type === 'spread' ? 300 : 380;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const radius = type === 'spread' ? 10 : 7;
    const color = type === 'spread' ? 0xff0088 : 0xff6600;

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(0, 0, radius);
    g.x = bx; g.y = by;
    g.setDepth(9);

    this.bossBullets.push({
      gfx: g, x: bx, y: by, vx, vy,
      damage, active: true, lifetime: 4000,
    });
  }

  _updateBossMode(delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    // Update boss projectiles
    for (let i = this.bossBullets.length - 1; i >= 0; i--) {
      const b = this.bossBullets[i];
      if (!b.active) { this.bossBullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x;
      b.gfx.y = b.y;

      if (b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH || b.lifetime <= 0) {
        b.gfx.destroy();
        b.active = false;
        this.bossBullets.splice(i, 1);
        continue;
      }

      // Hit local player
      if (me && me.alive && !this.isDead) {
        const dx = b.x - this.myX;
        const dy = b.y - this.myY;
        if (Math.sqrt(dx * dx + dy * dy) < 18 + (b.damage > 15 ? 10 : 7)) {
          b.gfx.destroy();
          b.active = false;
          this.bossBullets.splice(i, 1);

          me.hp = Math.max(0, me.hp - b.damage);
          this.myStats.hp = me.hp;
          this._updatePlayerHpBar(myId);

          // Screen flash red
          const W = this.scale.width, H = this.scale.height;
          const flash = this.add.graphics();
          flash.fillStyle(0xff0000, 0.45);
          flash.fillRect(0, 0, W, H);
          flash.setScrollFactor(0).setDepth(500);
          this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

          if (me.hp <= 0 && !this.isDead) {
            this.isDead = true;
            me.alive = false;
            me.gfx.setAlpha(0.3);
            window.network.sendPlayerDied('boss');
            this._showDeadMessage();
          }
          continue;
        }
      }
    }

    // My bullets hitting boss
    if (this.boss && me && me.alive) {
      for (let i = this.myBullets.length - 1; i >= 0; i--) {
        const b = this.myBullets[i];
        if (!b.active) continue;
        const dx = b.x - this.boss.x;
        const dy = b.y - this.boss.y;
        if (Math.sqrt(dx * dx + dy * dy) < 60 + 7) {
          window.network.sendBossHit(b.damage);
          if (!b.pierce) {
            b.gfx.destroy();
            b.active = false;
            this.myBullets.splice(i, 1);
          }
        }
      }
    }
  }

  _showAoeWarning(duration) {
    if (!this.boss) return;
    const warn = this.add.graphics();
    warn.lineStyle(4, 0xff0000, 0.8);
    warn.strokeCircle(this.boss.x, this.boss.y, 400);
    warn.setDepth(4);
    this.time.delayedCall(duration, () => { warn.destroy(); });

    const W = this.scale.width;
    const txt = this.add.text(W / 2, 110, '⚠️ 広範囲攻撃！', {
      fontSize: '28px', fontStyle: 'bold', color: '#ff4444',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(601);
    this.tweens.add({
      targets: txt, alpha: 0, delay: duration - 200, duration: 200,
      onComplete: () => txt.destroy(),
    });
  }

  // ── Mob Mode ─────────────────────────────────────────────────────

  _initMobMode() {
    const W = this.scale.width;

    // Timer display
    this.mobTimerTxt = this.add.text(W / 2, 60, `⏱ ${this.mobTimer}s`, {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(110);

    // Kills display panel
    this.killsDisplay = this.add.text(10, 60, 'キル数:\n', {
      fontSize: '16px', color: '#88ffaa',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(110);
  }

  _updateKillsDisplay(kills) {
    if (!this.killsDisplay) return;
    const lines = ['キル数:'];
    const sorted = Object.entries(kills).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id, count]) => {
      const p = this.players[id];
      const name = p ? p.nameTxt.text : id.substring(0, 6);
      const isMine = id === window.network.myId;
      lines.push(`${isMine ? '►' : ' '} ${name}: ${count}`);
    });
    this.killsDisplay.setText(lines.join('\n'));
  }

  _createMobEnemy(data) {
    const { id, x, y, hp, type } = data;
    if (this.mobEnemies[id]) return;

    const color = type === 'bat' ? 0x8844aa : 0x44aa44;
    const radius = type === 'bat' ? 10 : 13;

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, radius);
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeCircle(0, 0, radius);
    if (type === 'bat') {
      g.fillStyle(0xffddff, 0.8);
      g.fillCircle(-8, -4, 5);
      g.fillCircle(8, -4, 5);
    } else {
      g.fillStyle(0x88ff88, 0.9);
      g.fillCircle(-4, -4, 3);
      g.fillCircle(4, -4, 3);
    }
    g.x = x; g.y = y;
    g.setDepth(8);

    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x000000, 0.6);
    hpBg.fillRect(-12, -18, 24, 4);
    hpBg.x = x; hpBg.y = y;
    hpBg.setDepth(9);

    const hpBar = this.add.graphics();
    hpBar.fillStyle(0x00ff44, 1);
    hpBar.fillRect(-12, -18, 24, 4);
    hpBar.x = x; hpBar.y = y;
    hpBar.setDepth(9);

    this.mobEnemies[id] = {
      gfx: g, hpBg, hpBar,
      x, y, hp, maxHp: hp,
      active: true, type,
      serverX: x, serverY: y,
    };
  }

  _destroyMobEnemy(id) {
    const e = this.mobEnemies[id];
    if (!e) return;
    if (e.gfx) e.gfx.destroy();
    if (e.hpBg) e.hpBg.destroy();
    if (e.hpBar) e.hpBar.destroy();
    delete this.mobEnemies[id];
  }

  _updateMobEnemyHpBar(id) {
    const e = this.mobEnemies[id];
    if (!e || !e.hpBar) return;
    const ratio = Math.max(0, e.hp / e.maxHp);
    e.hpBar.clear();
    e.hpBar.fillStyle(ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffee00 : 0xff2222, 1);
    e.hpBar.fillRect(-12, -18, 24 * ratio, 4);
  }

  _spawnMobEnemy() {
    this.mobEnemyIdCounter++;
    const id = `mob_${window.network.myId}_${this.mobEnemyIdCounter}`;

    // Random spawn near edges
    const margin = 100;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = margin + Math.random() * (this.worldW - margin * 2); y = margin; }
    else if (side === 1) { x = this.worldW - margin; y = margin + Math.random() * (this.worldH - margin * 2); }
    else if (side === 2) { x = margin + Math.random() * (this.worldW - margin * 2); y = this.worldH - margin; }
    else { x = margin; y = margin + Math.random() * (this.worldH - margin * 2); }

    const type = Math.random() < 0.7 ? 'slime' : 'bat';
    const hp = type === 'bat' ? 30 : 50;

    const data = { id, x, y, hp, type };
    this._createMobEnemy(data);
    window.network.sendMobEnemySpawn(data);
  }

  _updateMobMode(delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    if (this.isHost) {
      // Spawn enemies
      this.mobSpawnTimer += delta;
      if (this.mobSpawnTimer >= 600) {
        this.mobSpawnTimer = 0;
        this._spawnMobEnemy();
      }

      // Broadcast positions
      this.mobPositionTimer += delta;
      if (this.mobPositionTimer >= 150) {
        this.mobPositionTimer = 0;
        const updates = Object.entries(this.mobEnemies)
          .filter(([, e]) => e.active)
          .map(([id, e]) => ({ id, x: e.x, y: e.y }));
        if (updates.length > 0) window.network.sendMobEnemyPositions(updates);
      }

      // Move enemies (host authority)
      for (const [id, e] of Object.entries(this.mobEnemies)) {
        if (!e.active) continue;
        // Find nearest player
        let target = null;
        let minDist = Infinity;
        for (const [pid, p] of Object.entries(this.players)) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          if (d < minDist) { minDist = d; target = p; }
        }
        if (target) {
          const spd = (e.type === 'bat' ? 120 : 80) * (delta / 1000);
          const dx = target.x - e.x;
          const dy = target.y - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0) {
            e.x += (dx / dist) * spd;
            e.y += (dy / dist) * spd;
          }
        }
        e.gfx.x = e.x; e.gfx.y = e.y;
        e.hpBg.x = e.x; e.hpBg.y = e.y;
        e.hpBar.x = e.x; e.hpBar.y = e.y;
      }
    } else {
      // Non-host: interpolate enemy positions
      for (const [id, e] of Object.entries(this.mobEnemies)) {
        if (!e.active) continue;
        if (e.serverX !== undefined) {
          e.x = Phaser.Math.Linear(e.x, e.serverX, 0.2);
          e.y = Phaser.Math.Linear(e.y, e.serverY, 0.2);
          e.gfx.x = e.x; e.gfx.y = e.y;
          e.hpBg.x = e.x; e.hpBg.y = e.y;
          e.hpBar.x = e.x; e.hpBar.y = e.y;
        }
      }
    }

    // All players: check my bullets hitting enemies
    if (me && me.alive) {
      for (let i = this.myBullets.length - 1; i >= 0; i--) {
        const b = this.myBullets[i];
        if (!b.active) continue;
        for (const [eid, e] of Object.entries(this.mobEnemies)) {
          if (!e.active) continue;
          const dx = b.x - e.x;
          const dy = b.y - e.y;
          if (Math.sqrt(dx * dx + dy * dy) < 13 + 7) {
            window.network.sendMobHit(eid, b.damage);
            if (!b.pierce) {
              b.gfx.destroy();
              b.active = false;
              this.myBullets.splice(i, 1);
            }
            break;
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────

  _createPlayerSprite(id, pData) {
    const colors = [0xff4444, 0x4488ff, 0x44cc44, 0xffdd00, 0xaa44ff, 0xff8800, 0x44dddd, 0xff88cc];
    const color = pData.color || colors[pData.colorIndex % colors.length] || 0x888888;

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, 18);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(0, 0, 18);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-6, -5, 4);
    g.fillCircle(6, -5, 4);
    g.fillStyle(0x000000, 1);
    g.fillCircle(-5, -5, 2);
    g.fillCircle(7, -5, 2);
    g.x = pData.x;
    g.y = pData.y;
    g.setDepth(10);

    // Name tag
    const nameTxt = this.add.text(0, -34, pData.name || 'Player', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(12);

    // HP bar bg
    const hpBg = this.add.graphics();
    hpBg.fillStyle(0x000000, 0.7);
    hpBg.fillRect(-24, -28, 48, 6);
    hpBg.x = pData.x;
    hpBg.y = pData.y;
    hpBg.setDepth(11);

    // HP bar fill
    const hpBar = this.add.graphics();
    hpBar.fillStyle(0x00ff44, 1);
    hpBar.fillRect(-24, -28, 48, 6);
    hpBar.x = pData.x;
    hpBar.y = pData.y;
    hpBar.setDepth(11);

    const isMe = id === window.network.myId;
    if (isMe) {
      // Highlight self with ring
      g.lineStyle(4, 0xffffff, 1);
      g.strokeCircle(0, 0, 22);
    }

    this.players[id] = {
      id,
      gfx: g,
      nameTxt,
      hpBg,
      hpBar,
      x: pData.x,
      y: pData.y,
      hp: pData.hp || 100,
      maxHp: pData.maxHp || 100,
      alive: true,
      speed: pData.speed || 160,
      power: pData.power || 10,
      fireRate: pData.fireRate || 500,
      bulletCount: pData.bulletCount || 1,
      bulletSpeed: pData.bulletSpeed || 400,
      pierce: pData.pierce || false,
      shield: pData.shield || false,
      serverX: pData.x,
      serverY: pData.y,
    };
  }

  _updatePlayerHpBar(id) {
    const p = this.players[id];
    if (!p) return;
    const ratio = Math.max(0, p.hp / p.maxHp);
    p.hpBar.clear();
    const col = ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffee00 : 0xff2222;
    p.hpBar.fillStyle(col, 1);
    p.hpBar.fillRect(-24, -28, 48 * ratio, 6);
  }

  _createHUD() {
    const W = this.scale.width;

    this.hudBg = this.add.graphics();
    this.hudBg.fillStyle(0x000000, 0.7);
    this.hudBg.fillRect(0, 0, W, 50);
    this.hudBg.setScrollFactor(0).setDepth(100);

    this.hudHpTxt = this.add.text(20, 12, 'HP: ---', {
      fontSize: '20px', color: '#ff6666',
    }).setScrollFactor(0).setDepth(101);

    this.hudPlayerCount = this.add.text(W / 2, 12, 'Players: --', {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

    this.hudShield = this.add.text(W - 20, 12, '', {
      fontSize: '20px', color: '#88ddff',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(101);
  }

  _updateHUD() {
    const me = this.players[window.network.myId];
    if (!me) return;

    this.hudHpTxt.setText(`HP: ${Math.ceil(me.hp)} / ${me.maxHp}`);

    const alive = Object.values(this.players).filter(p => p.alive).length;
    this.hudPlayerCount.setText(`生存: ${alive}人`);

    this.hudShield.setText(me.shield ? '🛡️ シールド' : '');
  }

  update(time, delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    if (!me || !me.alive) {
      // Spectator mode: follow spectate target
      if (this.spectateTarget && this.spectateTarget.alive) {
        // Camera follows spectate target (already set in pointerdown handler)
      }
      this._updateOtherPlayers(delta);
      this._updateBullets(delta);
      return;
    }

    // Movement
    const speed = me.speed;
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown) vx -= 1;
    if (this.cursors.right.isDown) vx += 1;
    if (this.cursors.up.isDown) vy -= 1;
    if (this.cursors.down.isDown) vy += 1;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.myX = Phaser.Math.Clamp(this.myX + vx * speed * (delta / 1000), 20, this.worldW - 20);
    this.myY = Phaser.Math.Clamp(this.myY + vy * speed * (delta / 1000), 20, this.worldH - 20);

    me.x = this.myX;
    me.y = this.myY;
    me.gfx.x = this.myX;
    me.gfx.y = this.myY;
    me.hpBg.x = this.myX;
    me.hpBg.y = this.myY;
    me.hpBar.x = this.myX;
    me.hpBar.y = this.myY;
    me.nameTxt.x = this.myX;
    me.nameTxt.y = this.myY;

    // Send position to server
    this.positionTimer += delta;
    if (this.positionTimer >= 100) {
      this.positionTimer = 0;
      window.network.sendBattlePosition(this.myX, this.myY);
    }

    // Aim direction from arrow keys
    const ak = this.aimKeys;
    const ax = (ak.right.isDown ? 1 : 0) - (ak.left.isDown ? 1 : 0);
    const ay = (ak.down.isDown  ? 1 : 0) - (ak.up.isDown   ? 1 : 0);
    let manualAim = null;
    if (ax !== 0 || ay !== 0) {
      manualAim = Math.atan2(ay, ax);
      this.lastAimAngle = manualAim;
    }
    this._drawAimIndicator(manualAim);

    // Attack
    this.fireTimer += delta;
    if (this.fireTimer >= me.fireRate) {
      this.fireTimer = 0;
      this._attack(me, manualAim);
    }

    // Update other players (interpolate)
    this._updateOtherPlayers(delta);

    // Bot AI
    this._updateBotAI(delta);
    this._updateBotBullets(delta);

    // Update bullets
    this._updateBullets(delta);

    // Update HUD
    this._updateHUD();

    // Mode-specific update
    if (this.battleMode === 'boss') {
      this._updateBossMode(delta);
    } else if (this.battleMode === 'mob') {
      this._updateMobMode(delta);
    }
  }

  _drawAimIndicator(aimAngle) {
    const g = this.aimIndicator;
    g.clear();
    const angle = aimAngle !== null ? aimAngle : this.lastAimAngle;
    if (angle === null || angle === undefined) return;

    const dist = 28;
    const tx = this.myX + Math.cos(angle) * dist;
    const ty = this.myY + Math.sin(angle) * dist;
    const tipX = this.myX + Math.cos(angle) * (dist + 10);
    const tipY = this.myY + Math.sin(angle) * (dist + 10);
    const perpX = -Math.sin(angle) * 5;
    const perpY  =  Math.cos(angle) * 5;

    g.fillStyle(aimAngle !== null ? 0xffffff : 0x888888, aimAngle !== null ? 1 : 0.5);
    g.fillTriangle(
      tipX, tipY,
      tx + perpX, ty + perpY,
      tx - perpX, ty - perpY
    );
  }

  _updateOtherPlayers(delta) {
    const myId = window.network.myId;
    for (const [id, p] of Object.entries(this.players)) {
      if (id === myId) continue;
      if (!p.alive) continue;

      // Lerp to server position
      if (p.serverX !== undefined) {
        p.x = Phaser.Math.Linear(p.x, p.serverX, 0.2);
        p.y = Phaser.Math.Linear(p.y, p.serverY, 0.2);
        p.gfx.x = p.x;
        p.gfx.y = p.y;
        p.hpBg.x = p.x;
        p.hpBg.y = p.y;
        p.hpBar.x = p.x;
        p.hpBar.y = p.y;
        p.nameTxt.x = p.x;
        p.nameTxt.y = p.y;
      }
    }
  }

  _attack(me, manualAim) {
    const myId = window.network.myId;

    let baseAngle = manualAim;
    if (baseAngle === null) {
      if (this.battleMode === 'mob' || this.battleMode === 'boss') {
        // Auto-aim: find closest mob enemy
        let closest = null;
        let minDist = Infinity;
        for (const [id, e] of Object.entries(this.mobEnemies)) {
          if (!e.active) continue;
          const dx = e.x - me.x, dy = e.y - me.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; closest = e; }
        }
        if (this.battleMode === 'boss' && this.boss) {
          // Auto-aim at boss in boss mode
          baseAngle = Math.atan2(this.boss.y - me.y, this.boss.x - me.x);
        } else if (closest) {
          baseAngle = Math.atan2(closest.y - me.y, closest.x - me.x);
        } else {
          baseAngle = this.lastAimAngle;
        }
      } else {
        // Auto-aim: find closest alive player
        let closest = null;
        let minDist = Infinity;
        for (const [id, p] of Object.entries(this.players)) {
          if (id === myId || !p.alive) continue;
          const dx = p.x - me.x, dy = p.y - me.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; closest = p; }
        }
        if (!closest) return;
        baseAngle = Math.atan2(closest.y - me.y, closest.x - me.x);
      }
    }

    const count = me.bulletCount;
    const spread = count > 1 ? (Math.PI / 8) : 0;

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = baseAngle + offset;
      const vx = Math.cos(angle) * me.bulletSpeed;
      const vy = Math.sin(angle) * me.bulletSpeed;

      const g = this.add.graphics();
      g.fillStyle(0xff8844, 1);
      g.fillCircle(0, 0, 7);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(0, 0, 7);
      g.x = me.x;
      g.y = me.y;
      g.setDepth(8);

      this.myBullets.push({
        gfx: g, x: me.x, y: me.y, vx, vy,
        damage: me.power,
        pierce: me.pierce,
        active: true,
        lifetime: 3000,
        hitPlayers: new Set(),
      });

      // Broadcast to others
      window.network.sendBattleAttack({ vx, vy, angle });
    }
  }

  _spawnOtherBullet(x, y, vx, vy, fromId) {
    const g = this.add.graphics();
    g.fillStyle(0xffaa44, 0.8);
    g.fillCircle(0, 0, 6);
    g.x = x;
    g.y = y;
    g.setDepth(7);

    this.otherBullets.push({
      gfx: g, x, y, vx, vy,
      fromId,
      active: true,
      lifetime: 3000,
    });
  }

  _updateBullets(delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    // My bullets
    for (let i = this.myBullets.length - 1; i >= 0; i--) {
      const b = this.myBullets[i];
      if (!b.active) { this.myBullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x;
      b.gfx.y = b.y;

      if (b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH || b.lifetime <= 0) {
        b.gfx.destroy();
        b.active = false;
        this.myBullets.splice(i, 1);
        continue;
      }

      let hit = false;
      for (const [id, p] of Object.entries(this.players)) {
        if (id === myId || !p.alive || b.hitPlayers.has(id)) continue;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) {
          b.hitPlayers.add(id);

          if (p.isBot) {
            // Bot hit: handle client-side
            p.hp = Math.max(0, p.hp - b.damage);
            this._updatePlayerHpBar(id);
            if (p.hp <= 0) {
              p.alive = false;
              p.gfx.setAlpha(0.3);
              window.network.reportBotDefeated(id);
            }
          } else {
            window.network.sendBattleHit(id, b.damage);
          }

          if (!b.pierce) { hit = true; break; }
        }
      }

      if (hit) {
        b.gfx.destroy();
        b.active = false;
        this.myBullets.splice(i, 1);
      }
    }

    // Others' bullets - check collision with me
    for (let i = this.otherBullets.length - 1; i >= 0; i--) {
      const b = this.otherBullets[i];
      if (!b.active) { this.otherBullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x;
      b.gfx.y = b.y;

      if (b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH || b.lifetime <= 0) {
        b.gfx.destroy();
        b.active = false;
        this.otherBullets.splice(i, 1);
        continue;
      }

      // Collision with local player (visual only - server is authoritative)
      if (me && me.alive) {
        const dx = b.x - me.x;
        const dy = b.y - me.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) {
          b.gfx.destroy();
          b.active = false;
          this.otherBullets.splice(i, 1);
        }
      }
    }
  }

  _showDeadMessage() {
    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, W, H);
    overlay.setScrollFactor(0).setDepth(300);

    this.add.text(W / 2, H / 2 - 40, '脱落しました', {
      fontSize: '48px', fontStyle: 'bold', color: '#ff4444',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);

    this.add.text(W / 2, H / 2 + 30, '観戦モードに切り替わります...', {
      fontSize: '22px', color: '#aabbcc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);
  }

  _showResultScreen(winner, rankings, killMode = false) {
    this._cleanup();

    const W = this.scale.width;
    const H = this.scale.height;
    const myId = window.network.myId;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.85);
    overlay.fillRect(0, 0, W, H);
    overlay.setScrollFactor(0).setDepth(400);

    this.add.text(W / 2, 60, '試合終了', {
      fontSize: '52px', fontStyle: 'bold', color: '#f0c040',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(401);

    if (winner) {
      const isMe = winner.id === myId;
      const winnerColor = '#' + (winner.color || 0xffffff).toString(16).padStart(6, '0');
      this.add.text(W / 2, 130, isMe ? '🎉 あなたの勝利！' : `${winner.name} の勝利！`, {
        fontSize: '32px', fontStyle: 'bold', color: isMe ? '#ffee44' : winnerColor,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(401);
    }

    // Rankings
    this.add.text(W / 2, 190, 'ランキング', {
      fontSize: '22px', color: '#aabbcc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(401);

    (rankings || []).forEach((r, i) => {
      const y = 225 + i * 44;
      const isMe = r.id === myId;
      const rankColors = ['#f0c040', '#cccccc', '#cc8844'];
      const rankColor = rankColors[i] || '#aabbcc';
      const plColor = '#' + (r.color || 0xffffff).toString(16).padStart(6, '0');

      this.add.text(W / 2 - 200, y, `${r.rank}.`, {
        fontSize: '20px', fontStyle: 'bold', color: rankColor,
      }).setScrollFactor(0).setDepth(401);

      this.add.text(W / 2 - 160, y, `${isMe ? '► ' : ''}${r.name}`, {
        fontSize: '20px', color: isMe ? '#ffee44' : '#ffffff',
        fontStyle: isMe ? 'bold' : 'normal',
      }).setScrollFactor(0).setDepth(401);

      const statTxt = killMode
        ? `Kill: ${r.kills !== undefined ? r.kills : 0}`
        : `Score: ${r.score}`;
      this.add.text(W / 2 + 120, y, statTxt, {
        fontSize: '18px', color: killMode ? '#ffaa44' : '#88cc88',
      }).setScrollFactor(0).setDepth(401);
    });

    // Return to lobby button (host only)
    const btnY = H - 80;
    if (window.network.isHost()) {
      const btnBg = this.add.graphics();
      btnBg.fillStyle(0x225533, 1);
      btnBg.fillRoundedRect(W / 2 - 120, btnY - 25, 240, 50, 8);
      btnBg.lineStyle(2, 0x44aa66, 1);
      btnBg.strokeRoundedRect(W / 2 - 120, btnY - 25, 240, 50, 8);
      btnBg.setScrollFactor(0).setDepth(401);

      const btnTxt = this.add.text(W / 2, btnY, 'ロビーに戻る', {
        fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(402);

      const hitZone = this.add.rectangle(W / 2, btnY, 240, 50, 0xffffff, 0)
        .setScrollFactor(0).setDepth(403).setInteractive({ useHandCursor: true });

      hitZone.on('pointerdown', () => {
        window.network.returnToLobby();
      });
    } else {
      this.add.text(W / 2, btnY, 'ホストがロビーに戻るのを待っています...', {
        fontSize: '18px', color: '#aabbcc',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(401);
    }

    // Handle lobby return
    this._addHandler('phase_change', (data) => {
      if (data.phase === 'lobby') {
        window.network.roomCode = window.network.roomCode; // keep room code
        this._cleanup();
        this.scene.start('LobbyScene');
      }
    });
  }

  // ── Bot AI ──────────────────────────────────────────────────────

  _updateBotAI(delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    for (const [id, bot] of Object.entries(this.players)) {
      if (!bot.isBot || !bot.alive) continue;

      // Target: nearest alive combatant
      let target = null;
      let minDist = Infinity;
      for (const [tid, tp] of Object.entries(this.players)) {
        if (tid === id || !tp.alive) continue;
        const d = Math.hypot(tp.x - bot.x, tp.y - bot.y);
        if (d < minDist) { minDist = d; target = tp; }
      }
      if (!target) continue;

      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Movement: keep ~150px distance, strafe slightly
      const PREF_DIST = 150;
      let vx = 0, vy = 0;
      if (dist > PREF_DIST + 30) {
        vx = dx / dist;
        vy = dy / dist;
      } else if (dist < PREF_DIST - 30) {
        vx = -(dx / dist);
        vy = -(dy / dist);
      }
      // Strafe offset (unique per bot using strafePhase)
      if (!bot.strafePhase) bot.strafePhase = Math.random() * Math.PI * 2;
      const strafe = Math.sin(Date.now() * 0.0015 + bot.strafePhase) * 0.5;
      if (dist > 0) { vx += (-dy / dist) * strafe; vy += (dx / dist) * strafe; }

      const spd = (bot.speed || 140) * (delta / 1000);
      bot.x = Phaser.Math.Clamp(bot.x + vx * spd, 20, this.worldW - 20);
      bot.y = Phaser.Math.Clamp(bot.y + vy * spd, 20, this.worldH - 20);

      // Update visuals
      bot.gfx.x = bot.x;      bot.gfx.y = bot.y;
      bot.hpBg.x = bot.x;     bot.hpBg.y = bot.y;
      bot.hpBar.x = bot.x;    bot.hpBar.y = bot.y;
      bot.nameTxt.x = bot.x;  bot.nameTxt.y = bot.y;

      // Fire at target when in range
      if (!bot.botFireTimer) bot.botFireTimer = 0;
      bot.botFireTimer += delta;
      if (bot.botFireTimer >= (bot.fireRate || 600) && dist < 700) {
        bot.botFireTimer = 0;
        this._botFire(bot, target.x, target.y);
      }
    }
  }

  _botFire(bot, targetX, targetY) {
    const count = bot.bulletCount || 1;
    const baseAngle = Math.atan2(targetY - bot.y, targetX - bot.x);
    const spread = count > 1 ? Math.PI / 8 : 0;

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = baseAngle + offset;
      const spd = bot.bulletSpeed || 350;

      const g = this.add.graphics();
      g.fillStyle(0xff4444, 0.9);
      g.fillCircle(0, 0, 6);
      g.lineStyle(1, 0xffaaaa, 0.5);
      g.strokeCircle(0, 0, 6);
      g.x = bot.x; g.y = bot.y;
      g.setDepth(7);

      this.botBullets.push({
        gfx: g, x: bot.x, y: bot.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        damage: bot.power || 8,
        pierce: bot.pierce || false,
        active: true, lifetime: 3000,
        fromBotId: bot.id,
      });
    }
  }

  _updateBotBullets(delta) {
    const myId = window.network.myId;
    const me = this.players[myId];

    for (let i = this.botBullets.length - 1; i >= 0; i--) {
      const b = this.botBullets[i];
      if (!b.active) { this.botBullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x; b.gfx.y = b.y;

      if (b.x < 0 || b.x > this.worldW || b.y < 0 || b.y > this.worldH || b.lifetime <= 0) {
        b.gfx.destroy(); b.active = false;
        this.botBullets.splice(i, 1);
        continue;
      }

      // Hit human player
      if (me && me.alive && !this.isDead) {
        const dx = b.x - me.x, dy = b.y - me.y;
        if (Math.sqrt(dx * dx + dy * dy) < 18 + 6) {
          b.gfx.destroy(); b.active = false;
          this.botBullets.splice(i, 1);

          me.hp = Math.max(0, me.hp - b.damage);
          this.myStats.hp = me.hp;
          this._updatePlayerHpBar(myId);

          // Screen flash
          const W = this.scale.width, H = this.scale.height;
          const flash = this.add.graphics();
          flash.fillStyle(0xff0000, 0.35);
          flash.fillRect(0, 0, W, H);
          flash.setScrollFactor(0).setDepth(500);
          this.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });

          if (me.hp <= 0) {
            this.isDead = true;
            me.alive = false;
            me.gfx.setAlpha(0.3);
            window.network.sendPlayerDied(b.fromBotId);
            this._showDeadMessage();
            // Spectate a living bot
            const aliveBot = Object.values(this.players).find(p => p.isBot && p.alive);
            if (aliveBot) {
              this.spectateTarget = aliveBot;
              this.cameras.main.startFollow(aliveBot.gfx, true, 0.1, 0.1);
            }
          }
          continue;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];

    for (const b of this.myBullets)   if (b.gfx) b.gfx.destroy();
    for (const b of this.otherBullets) if (b.gfx) b.gfx.destroy();
    for (const b of this.botBullets)   if (b.gfx) b.gfx.destroy();
    this.myBullets = [];
    this.otherBullets = [];
    this.botBullets = [];

    // Boss cleanup
    for (const b of this.bossBullets) if (b.gfx) b.gfx.destroy();
    this.bossBullets = [];
    if (this.mobAuraTween) { this.mobAuraTween.stop(); this.mobAuraTween = null; }
    if (this.boss) {
      if (this.boss.gfx) this.boss.gfx.destroy();
      if (this.boss.aura) this.boss.aura.destroy();
      if (this.boss.nameTxt) this.boss.nameTxt.destroy();
      if (this.boss.hpBg) this.boss.hpBg.destroy();
      if (this.boss.hpBar) this.boss.hpBar.destroy();
      if (this.boss.hpTxt) this.boss.hpTxt.destroy();
      this.boss = null;
    }
    if (this.damageDisplay) { this.damageDisplay.destroy(); this.damageDisplay = null; }

    // Mob cleanup
    for (const id of Object.keys(this.mobEnemies)) this._destroyMobEnemy(id);
    this.mobEnemies = {};
    if (this.mobTimerTxt) { this.mobTimerTxt.destroy(); this.mobTimerTxt = null; }
    if (this.killsDisplay) { this.killsDisplay.destroy(); this.killsDisplay = null; }
  }

  shutdown() {
    this._cleanup();
  }
}
