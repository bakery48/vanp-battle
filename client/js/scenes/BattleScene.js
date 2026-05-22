// BattleScene.js - PvP Battle Phase
class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
    this._handlers = [];
    this.myStats = null;
    this.players = {}; // id -> { gfx, hpBg, hpBar, nameTxt, x, y, hp, maxHp, alive, speed, power, fireRate, bulletCount, bulletSpeed, shield, pierce }
    this.myBullets = [];
    this.otherBullets = [];
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
  }

  init(data) {
    this.battleState = data.battleState || {};
    this.myStats = data.myStats ? new PlayerStats(data.myStats) : new PlayerStats();
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

    // Input
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Create player sprites from initial battle state
    const myId = window.network.myId;

    for (const [id, pData] of Object.entries(this.battleState)) {
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
        this._showResultScreen(data.winner, data.rankings);
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
  }

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

    // Auto attack: find closest other alive player
    this.fireTimer += delta;
    if (this.fireTimer >= me.fireRate) {
      this.fireTimer = 0;
      this._autoAttack(me);
    }

    // Update other players (interpolate)
    this._updateOtherPlayers(delta);

    // Update bullets
    this._updateBullets(delta);

    // Update HUD
    this._updateHUD();
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

  _autoAttack(me) {
    const myId = window.network.myId;
    let closest = null;
    let minDist = Infinity;

    for (const [id, p] of Object.entries(this.players)) {
      if (id === myId || !p.alive) continue;
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }

    if (!closest) return;

    const count = me.bulletCount;
    const baseAngle = Math.atan2(closest.y - me.y, closest.x - me.x);
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
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (Math.sqrt(dx * dx + dy * dy) < 22) {
          b.hitPlayers.add(id);
          window.network.sendBattleHit(id, b.damage);
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

  _showResultScreen(winner, rankings) {
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

      this.add.text(W / 2 + 120, y, `Score: ${r.score}`, {
        fontSize: '18px', color: '#88cc88',
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

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];

    for (const b of this.myBullets) if (b.gfx) b.gfx.destroy();
    this.myBullets = [];
    for (const b of this.otherBullets) if (b.gfx) b.gfx.destroy();
    this.otherBullets = [];
  }

  shutdown() {
    this._cleanup();
  }
}
