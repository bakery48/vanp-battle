// SoloScene.js - Solo survival phase (Vampire Survivors-like)
class SoloScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SoloScene' });
    this._handlers = [];
    this.stats = null;
    this.enemySpawner = null;
    this.weaponSystem = null;
    this.cursors = null;
    this.playerGfx = null;
    this.elapsedMs = 0;
    this.totalDuration = 120000;
    this.round = 1;
    this.totalRounds = 3;
    this.isPaused = false;
    this.abilityPanel = null;
    this.expOrbs = [];
  }

  init(data) {
    this.round = data.round || 1;
    this.totalRounds = data.totalRounds || 3;
    this.totalDuration = data.duration || 120000;
    this.elapsedMs = 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const worldW = 2000;
    const worldH = 2000;

    // World background - tiled grid
    const bg = this.add.graphics();
    bg.fillStyle(0x1a2a1a, 1);
    bg.fillRect(0, 0, worldW, worldH);
    // Grid lines
    bg.lineStyle(1, 0x2a3a2a, 0.5);
    for (let x = 0; x <= worldW; x += 100) {
      bg.lineBetween(x, 0, x, worldH);
    }
    for (let y = 0; y <= worldH; y += 100) {
      bg.lineBetween(0, y, worldW, y);
    }
    bg.setDepth(0);

    // World border
    const border = this.add.graphics();
    border.lineStyle(4, 0xff4444, 1);
    border.strokeRect(2, 2, worldW - 4, worldH - 4);
    border.setDepth(1);

    // Initialize stats
    this.stats = new PlayerStats();

    // Player graphics
    this.playerGfx = this.add.graphics();
    this._drawPlayer(0x4488ff);
    this.playerX = worldW / 2;
    this.playerY = worldH / 2;
    this.playerGfx.x = this.playerX;
    this.playerGfx.y = this.playerY;
    this.playerGfx.setDepth(10);

    // Player HP bar (above player)
    this.playerHpBg = this.add.graphics();
    this.playerHpBg.setDepth(11);
    this.playerHpBar = this.add.graphics();
    this.playerHpBar.setDepth(11);
    this._updatePlayerHpBar();

    // Camera
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.playerGfx, true, 0.1, 0.1);

    // Input
    this.cursors = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Systems
    this.enemySpawner = new EnemySpawner(this, { x: this.playerX, y: this.playerY });
    this.weaponSystem = new WeaponSystem(this, this.stats);

    // Callbacks
    this.onEnemyContact = (enemy) => {
      if (this.isPaused) return;
      this.stats.hp = Math.max(0, this.stats.hp - enemy.damage);
      this._updatePlayerHpBar();
      this._flashPlayer();
      if (this.stats.hp <= 0) {
        this._playerDied();
      }
    };

    this.onEnemyKilled = (enemy) => {
      this.stats.gold += enemy.gold;
      this.stats.score += enemy.exp;
      this._spawnExpOrb(enemy.x, enemy.y, enemy.exp);
      this._updateHUD();
    };

    // HUD
    this._createHUD();

    // Network event: phase change (server might push us to shop)
    this._addHandler('phase_change', (data) => {
      if (data.phase === 'shop') {
        this._goToShop();
      }
    });

    this._addHandler('disconnected', () => {
      this._cleanup();
      this.scene.start('LobbyScene');
    });
  }

  _drawPlayer(color) {
    this.playerGfx.clear();
    // Body
    this.playerGfx.fillStyle(color, 1);
    this.playerGfx.fillCircle(0, 0, 16);
    // Outline
    this.playerGfx.lineStyle(2, 0xffffff, 0.8);
    this.playerGfx.strokeCircle(0, 0, 16);
    // Eyes
    this.playerGfx.fillStyle(0xffffff, 1);
    this.playerGfx.fillCircle(-5, -4, 4);
    this.playerGfx.fillCircle(5, -4, 4);
    this.playerGfx.fillStyle(0x000000, 1);
    this.playerGfx.fillCircle(-4, -4, 2);
    this.playerGfx.fillCircle(6, -4, 2);
  }

  _updatePlayerHpBar() {
    const ratio = Math.max(0, this.stats.hp / this.stats.maxHp);
    const bw = 40;
    const bh = 5;

    this.playerHpBg.clear();
    this.playerHpBg.fillStyle(0x000000, 0.7);
    this.playerHpBg.fillRect(-bw / 2, -26, bw, bh);
    this.playerHpBg.x = this.playerX;
    this.playerHpBg.y = this.playerY;

    this.playerHpBar.clear();
    const barColor = ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffee00 : 0xff2222;
    this.playerHpBar.fillStyle(barColor, 1);
    this.playerHpBar.fillRect(-bw / 2, -26, bw * ratio, bh);
    this.playerHpBar.x = this.playerX;
    this.playerHpBar.y = this.playerY;
  }

  _flashPlayer() {
    this.tweens.add({
      targets: this.playerGfx,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 2,
    });
  }

  _createHUD() {
    const W = this.scale.width;
    // HUD panel
    this.hudBg = this.add.graphics();
    this.hudBg.fillStyle(0x000000, 0.7);
    this.hudBg.fillRect(0, 0, W, 64);
    this.hudBg.setScrollFactor(0).setDepth(100);

    this.hudTimer = this.add.text(W / 2, 10, '2:00', {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

    this.hudHp = this.add.text(20, 10, 'HP: 100/100', {
      fontSize: '18px', color: '#ff6666',
    }).setScrollFactor(0).setDepth(101);

    this.hudExp = this.add.text(20, 34, 'EXP: 0  Lv.1', {
      fontSize: '16px', color: '#88ff88',
    }).setScrollFactor(0).setDepth(101);

    this.hudGold = this.add.text(W - 160, 10, 'Gold: 0', {
      fontSize: '18px', color: '#ffdd44',
    }).setScrollFactor(0).setDepth(101);

    this.hudRound = this.add.text(W - 160, 34, `Round ${this.round}/${this.totalRounds}`, {
      fontSize: '16px', color: '#aabbcc',
    }).setScrollFactor(0).setDepth(101);

    // EXP bar (below HUD)
    this.expBarBg = this.add.graphics();
    this.expBarBg.fillStyle(0x002200, 1);
    this.expBarBg.fillRect(0, 64, W, 8);
    this.expBarBg.setScrollFactor(0).setDepth(100);

    this.expBarFill = this.add.graphics();
    this.expBarFill.setScrollFactor(0).setDepth(101);
  }

  _updateHUD() {
    const remaining = Math.max(0, this.totalDuration - this.elapsedMs);
    const sec = Math.floor(remaining / 1000);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    this.hudTimer.setText(`${mm}:${ss}`);

    if (remaining < 30000) {
      this.hudTimer.setColor('#ff4444');
    } else {
      this.hudTimer.setColor('#ffffff');
    }

    this.hudHp.setText(`HP: ${Math.ceil(this.stats.hp)}/${this.stats.maxHp}`);
    this.hudExp.setText(`EXP: ${Math.floor(this.stats.exp)}  Lv.${this.stats.level}`);
    this.hudGold.setText(`Gold: ${Math.floor(this.stats.gold)}`);

    // EXP bar
    const expRatio = Math.min(1, this.stats.exp / this.stats.expToNextLevel());
    const W = this.scale.width;
    this.expBarFill.clear();
    this.expBarFill.fillStyle(0x44ff44, 1);
    this.expBarFill.fillRect(0, 64, W * expRatio, 8);
  }

  _spawnExpOrb(x, y, amount) {
    const g = this.add.graphics();
    g.fillStyle(0x44ff44, 1);
    g.fillCircle(0, 0, 6);
    g.x = x;
    g.y = y;
    g.setDepth(4);

    this.expOrbs.push({ gfx: g, x, y, exp: amount, active: true });
  }

  _updateExpOrbs() {
    for (let i = this.expOrbs.length - 1; i >= 0; i--) {
      const orb = this.expOrbs[i];
      if (!orb.active) { this.expOrbs.splice(i, 1); continue; }

      const dx = this.playerX - orb.x;
      const dy = this.playerY - orb.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Pull toward player if within collect range
      if (dist < this.stats.collectRange) {
        if (dist < 20) {
          // Collect
          this.stats.exp += orb.exp;
          orb.gfx.destroy();
          orb.active = false;
          this.expOrbs.splice(i, 1);
          this._checkLevelUp();
          this._updateHUD();
        } else {
          const speed = 300;
          orb.x += (dx / dist) * speed * (1 / 60);
          orb.y += (dy / dist) * speed * (1 / 60);
          orb.gfx.x = orb.x;
          orb.gfx.y = orb.y;
        }
      }
    }
  }

  _checkLevelUp() {
    if (this.stats.tryLevelUp()) {
      this._showAbilityChoice();
    }
  }

  _showAbilityChoice() {
    this.isPaused = true;
    const W = this.scale.width;
    const H = this.scale.height;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, W, H);
    overlay.setScrollFactor(0).setDepth(200);

    const title = this.add.text(W / 2, 120, `Level Up! Lv.${this.stats.level}`, {
      fontSize: '36px', fontStyle: 'bold', color: '#f0c040',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    const choices = AbilitySystem.getRandomChoices(3);
    const cardW = 220;
    const cardH = 280;
    const spacing = 260;
    const startX = W / 2 - spacing;

    const elements = [overlay, title];

    choices.forEach((ability, idx) => {
      const cx = startX + idx * spacing;
      const cy = H / 2;

      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x1a3a6a, 1);
      cardBg.lineStyle(2, 0x4488ff, 1);
      cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
      cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
      cardBg.setScrollFactor(0).setDepth(201);

      const iconTxt = this.add.text(cx, cy - 80, ability.icon, {
        fontSize: '48px',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

      const nameTxt = this.add.text(cx, cy - 10, ability.name, {
        fontSize: '20px', fontStyle: 'bold', color: '#ffffff', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

      const descTxt = this.add.text(cx, cy + 30, ability.desc, {
        fontSize: '16px', color: '#aabbff', align: 'center', wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

      // Click zone
      const hitZone = this.add.rectangle(cx, cy, cardW, cardH, 0xffffff, 0)
        .setScrollFactor(0).setDepth(203).setInteractive({ useHandCursor: true });

      hitZone.on('pointerover', () => {
        cardBg.clear();
        cardBg.fillStyle(0x2a4a8a, 1);
        cardBg.lineStyle(3, 0xffdd00, 1);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
      });

      hitZone.on('pointerout', () => {
        cardBg.clear();
        cardBg.fillStyle(0x1a3a6a, 1);
        cardBg.lineStyle(2, 0x4488ff, 1);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10);
      });

      hitZone.on('pointerdown', () => {
        AbilitySystem.apply(ability.id, this.stats);
        elements.forEach(e => e.destroy());
        [cardBg, iconTxt, nameTxt, descTxt, hitZone].forEach(e => e.destroy());
        // Clean up other cards
        for (const el of abilityElements) {
          try { el.destroy(); } catch (e) {}
        }
        this.isPaused = false;
        this._updateHUD();
        // Check for another level up
        this._checkLevelUp();
      });

      elements.push(cardBg, iconTxt, nameTxt, descTxt, hitZone);
    });

    const abilityElements = elements.slice(2); // exclude overlay and title
  }

  update(time, delta) {
    if (this.isPaused) return;

    this.elapsedMs += delta;

    // Move player
    const speed = this.stats.speed;
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown) vx -= 1;
    if (this.cursors.right.isDown) vx += 1;
    if (this.cursors.up.isDown) vy -= 1;
    if (this.cursors.down.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

    this.playerX = Phaser.Math.Clamp(this.playerX + vx * speed * (delta / 1000), 20, 1980);
    this.playerY = Phaser.Math.Clamp(this.playerY + vy * speed * (delta / 1000), 20, 1980);

    this.playerGfx.x = this.playerX;
    this.playerGfx.y = this.playerY;
    this.enemySpawner.player.x = this.playerX;
    this.enemySpawner.player.y = this.playerY;

    this._updatePlayerHpBar();

    // Update enemy spawner
    const elapsedSec = this.elapsedMs / 1000;
    this.enemySpawner.update(delta, this.round, elapsedSec);

    // Update weapon
    this.weaponSystem.stats = this.stats;
    this.weaponSystem.update(delta, this.playerX, this.playerY, this.enemySpawner.getActiveEnemies());

    // Update exp orbs
    this._updateExpOrbs();

    // Update HUD
    this._updateHUD();

    // Time up
    if (this.elapsedMs >= this.totalDuration) {
      this.elapsedMs = this.totalDuration;
      this._goToShop();
    }
  }

  _playerDied() {
    // Player died in solo - still go to shop with current stats
    this._goToShop();
  }

  _goToShop() {
    if (this._goingToShop) return;
    this._goingToShop = true;

    // Send stats to server
    window.network.sendSoloEnd(this.stats.toJSON());

    this._cleanup();
    this.scene.start('ShopScene', {
      stats: this.stats.toJSON(),
      round: this.round,
      totalRounds: this.totalRounds,
    });
  }

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];
    if (this.enemySpawner) this.enemySpawner.destroyAll();
    if (this.weaponSystem) this.weaponSystem.destroyAll();
    for (const orb of this.expOrbs) {
      if (orb.gfx) orb.gfx.destroy();
    }
    this.expOrbs = [];
  }

  shutdown() {
    this._cleanup();
  }
}
