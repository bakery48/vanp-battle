// EnemySpawner.js - Enemy spawning system for solo phase
class EnemySpawner {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.enemies = [];
    this.enemyBullets = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1500;
    this.worldWidth = 2000;
    this.worldHeight = 2000;

    this.enemyTypes = [
      { id: 'slime',   hp: 30,  speed: 60,  damage: 5,  exp: 5,  gold: 3,  size: 14, color: 0x66cc44 },
      { id: 'bat',     hp: 15,  speed: 100, damage: 3,  exp: 8,  gold: 2,  size: 10, color: 0x8844cc },
      { id: 'golem',   hp: 100, speed: 30,  damage: 15, exp: 20, gold: 10, size: 20, color: 0x888888 },
      { id: 'archer',  hp: 45,  speed: 50,  damage: 3,  exp: 12, gold: 5,  size: 13, color: 0xcc7722, bulletDamage: 10, shootInterval: 2000 },
      { id: 'spinner', hp: 35,  speed: 35,  damage: 3,  exp: 15, gold: 6,  size: 14, color: 0xbb33bb, bulletDamage: 6,  shootInterval: 2800 },
    ];
  }

  _getScaledType(round, elapsedSec) {
    const timeBonus = elapsedSec / 120;
    const roundBonus = (round - 1) * 0.3;
    const totalBonus = 1 + timeBonus * 0.5 + roundBonus;

    let rng = Math.random();
    let typeIndex;
    if (elapsedSec < 30) {
      typeIndex = rng < 0.85 ? 0 : 1;
    } else if (elapsedSec < 50) {
      typeIndex = rng < 0.45 ? 0 : rng < 0.8 ? 1 : 2;
    } else if (elapsedSec < 70) {
      typeIndex = rng < 0.3 ? 0 : rng < 0.55 ? 1 : rng < 0.8 ? 2 : 3;
    } else {
      typeIndex = rng < 0.2 ? 0 : rng < 0.4 ? 1 : rng < 0.58 ? 2 : rng < 0.78 ? 3 : 4;
    }

    const base = this.enemyTypes[typeIndex];
    return {
      ...base,
      hp:           Math.round(base.hp * totalBonus),
      maxHp:        Math.round(base.hp * totalBonus),
      damage:       Math.round(base.damage * totalBonus),
      bulletDamage: base.bulletDamage ? Math.round(base.bulletDamage * totalBonus) : 0,
    };
  }

  update(delta, round, elapsedSec) {
    this.spawnTimer += delta;

    const baseInterval = Math.max(400, 1500 - elapsedSec * 5 - (round - 1) * 200);
    if (this.spawnTimer >= baseInterval) {
      this.spawnTimer = 0;
      this._spawnEnemy(round, elapsedSec);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e || !e.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      this._updateEnemy(e, delta);
    }
  }

  _spawnEnemy(round, elapsedSec) {
    const typeData = this._getScaledType(round, elapsedSec);
    const px = this.player.x;
    const py = this.player.y;

    const margin = 700;
    let x, y;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { x = px + (Math.random() * margin * 2 - margin); y = py - margin; }
    else if (side === 1) { x = px + (Math.random() * margin * 2 - margin); y = py + margin; }
    else if (side === 2) { x = px - margin; y = py + (Math.random() * margin * 2 - margin); }
    else               { x = px + margin; y = py + (Math.random() * margin * 2 - margin); }

    x = Phaser.Math.Clamp(x, 20, this.worldWidth - 20);
    y = Phaser.Math.Clamp(y, 20, this.worldHeight - 20);

    const g = this.scene.add.graphics();
    this._drawEnemyGraphics(g, typeData);
    g.x = x;
    g.y = y;
    g.setDepth(2);

    const hpBg = this.scene.add.graphics();
    hpBg.fillStyle(0x000000, 0.6);
    hpBg.fillRect(-typeData.size, -typeData.size - 10, typeData.size * 2, 5);
    hpBg.x = x;
    hpBg.y = y;
    hpBg.setDepth(3);

    const hpBar = this.scene.add.graphics();
    hpBar.fillStyle(0x00ff44, 1);
    hpBar.fillRect(-typeData.size, -typeData.size - 10, typeData.size * 2, 5);
    hpBar.x = x;
    hpBar.y = y;
    hpBar.setDepth(3);

    const enemy = {
      gfx: g,
      hpBg,
      hpBar,
      x, y,
      hp:           typeData.hp,
      maxHp:        typeData.maxHp,
      speed:        typeData.speed,
      damage:       typeData.damage,
      bulletDamage: typeData.bulletDamage || 0,
      shootInterval: typeData.shootInterval || 0,
      shootTimer:   0,
      exp:          typeData.exp,
      gold:         typeData.gold,
      size:         typeData.size,
      id:           typeData.id,
      active:       true,
      hitCooldown:  0,
      pierceHitBy:  new Set(),
    };

    this.enemies.push(enemy);
  }

  _drawEnemyGraphics(g, t) {
    const s = t.size;

    if (t.id === 'slime') {
      g.fillStyle(t.color, 1);
      g.fillCircle(0, 0, s);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-5, -4, 3);
      g.fillCircle(5, -4, 3);
      g.fillStyle(0x000000, 1);
      g.fillCircle(-4, -4, 1.5);
      g.fillCircle(6, -4, 1.5);

    } else if (t.id === 'bat') {
      g.fillStyle(t.color, 1);
      g.fillEllipse(0, 0, s * 2, s);
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(-s, 0, -s - 8, -8, -s + 4, -4);
      g.fillTriangle(s, 0, s + 8, -8, s - 4, -4);

    } else if (t.id === 'golem') {
      g.fillStyle(t.color, 1);
      g.fillRect(-s, -s, s * 2, s * 2);
      g.fillStyle(0x555555, 1);
      g.fillRect(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4);
      g.fillStyle(0xff2222, 1);
      g.fillCircle(-5, -3, 4);
      g.fillCircle(5, -3, 4);

    } else if (t.id === 'archer') {
      // Diamond body
      g.fillStyle(t.color, 1);
      g.fillTriangle(0, -s, s, 0, 0, s);
      g.fillTriangle(0, -s, -s, 0, 0, s);
      g.lineStyle(2, 0xff9944, 1);
      g.beginPath();
      g.moveTo(0, -s);
      g.lineTo(s, 0);
      g.lineTo(0, s);
      g.lineTo(-s, 0);
      g.closePath();
      g.strokePath();
      // Eye
      g.fillStyle(0xffee88, 1);
      g.fillCircle(0, -2, 4);
      g.fillStyle(0x000000, 1);
      g.fillCircle(1, -2, 2);
      // Arrow indicator
      g.lineStyle(2, 0xffffff, 0.7);
      g.lineBetween(0, 0, s + 6, 0);
      g.fillStyle(0xffffff, 0.7);
      g.fillTriangle(s + 6, 0, s + 1, -3, s + 1, 3);

    } else if (t.id === 'spinner') {
      // Spikes
      g.fillStyle(0xdd66dd, 0.8);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const tx = Math.cos(angle) * (s + 7);
        const ty = Math.sin(angle) * (s + 7);
        const p1x = Math.cos(angle + 0.35) * (s - 1);
        const p1y = Math.sin(angle + 0.35) * (s - 1);
        const p2x = Math.cos(angle - 0.35) * (s - 1);
        const p2y = Math.sin(angle - 0.35) * (s - 1);
        g.fillTriangle(tx, ty, p1x, p1y, p2x, p2y);
      }
      // Body
      g.fillStyle(t.color, 1);
      g.fillCircle(0, 0, s);
      g.lineStyle(2, 0xee88ee, 1);
      g.strokeCircle(0, 0, s);
      // Center
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(0, 0, 4);
    }
  }

  _updateEnemy(e, delta) {
    if (!e.active) return;

    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Movement — archer keeps preferred distance, others chase
    if (e.id === 'archer') {
      const prefDist = 220;
      const spd = e.speed * (delta / 1000);
      if (dist < prefDist - 60 && dist > 0) {
        e.x -= (dx / dist) * spd;
        e.y -= (dy / dist) * spd;
      } else if (dist > prefDist + 80 && dist > 0) {
        e.x += (dx / dist) * spd;
        e.y += (dy / dist) * spd;
      }
    } else {
      if (dist > 0) {
        const spd = e.speed * (delta / 1000);
        e.x += (dx / dist) * spd;
        e.y += (dy / dist) * spd;
      }
    }

    // Shoot timer
    if (e.shootInterval > 0) {
      e.shootTimer += delta;
      if (e.shootTimer >= e.shootInterval) {
        e.shootTimer -= e.shootInterval;
        this._enemyShoot(e);
      }
    }

    e.gfx.x = e.x;
    e.gfx.y = e.y;
    e.hpBg.x = e.x;
    e.hpBg.y = e.y;
    e.hpBar.x = e.x;
    e.hpBar.y = e.y;

    const ratio = Math.max(0, e.hp / e.maxHp);
    e.hpBar.clear();
    e.hpBar.fillStyle(ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffff00 : 0xff2222, 1);
    e.hpBar.fillRect(-e.size, -e.size - 10, e.size * 2 * ratio, 5);

    if (e.hitCooldown > 0) e.hitCooldown -= delta;

    if (dist < e.size + 12 && e.hitCooldown <= 0) {
      e.hitCooldown = 1000;
      if (this.scene.onEnemyContact) {
        this.scene.onEnemyContact(e);
      }
    }
  }

  _enemyShoot(e) {
    if (e.id === 'archer') {
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 20) return;
      const speed = 320;
      this._spawnEnemyBullet(e.x, e.y, (dx / dist) * speed, (dy / dist) * speed, e.bulletDamage, 'archer');

    } else if (e.id === 'spinner') {
      const count = 8;
      const speed = 180;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        this._spawnEnemyBullet(e.x, e.y, Math.cos(angle) * speed, Math.sin(angle) * speed, e.bulletDamage, 'spinner');
      }
    }
  }

  _spawnEnemyBullet(x, y, vx, vy, damage, type) {
    const color  = type === 'archer' ? 0xff9933 : 0xff44ff;
    const radius = type === 'archer' ? 5 : 6;

    const g = this.scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(0, 0, radius);
    g.lineStyle(1, 0xffffff, 0.4);
    g.strokeCircle(0, 0, radius);
    g.x = x; g.y = y;
    g.setDepth(3);

    this.enemyBullets.push({ gfx: g, x, y, vx, vy, damage, radius, active: true, lifetime: 3500 });
  }

  updateBullets(delta, playerX, playerY, onHit) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      if (!b.active) { this.enemyBullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x;
      b.gfx.y = b.y;

      if (b.x < 0 || b.x > this.worldWidth || b.y < 0 || b.y > this.worldHeight || b.lifetime <= 0) {
        b.gfx.destroy();
        b.active = false;
        this.enemyBullets.splice(i, 1);
        continue;
      }

      const dx = b.x - playerX;
      const dy = b.y - playerY;
      if (Math.sqrt(dx * dx + dy * dy) < 16 + b.radius) {
        b.gfx.destroy();
        b.active = false;
        this.enemyBullets.splice(i, 1);
        if (onHit) onHit(b.damage);
      }
    }
  }

  hitEnemy(enemy, damage) {
    enemy.hp -= damage;
    this.scene.tweens.add({
      targets: enemy.gfx,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
    });

    if (enemy.hp <= 0) {
      this.destroyEnemy(enemy);
      return true;
    }
    return false;
  }

  destroyEnemy(enemy) {
    enemy.active = false;
    if (enemy.gfx) enemy.gfx.destroy();
    if (enemy.hpBg) enemy.hpBg.destroy();
    if (enemy.hpBar) enemy.hpBar.destroy();
  }

  destroyAll() {
    for (const e of this.enemies) {
      if (e.active) this.destroyEnemy(e);
    }
    this.enemies = [];
    for (const b of this.enemyBullets) {
      if (b.gfx) b.gfx.destroy();
    }
    this.enemyBullets = [];
  }

  getActiveEnemies() {
    return this.enemies.filter(e => e.active);
  }
}
