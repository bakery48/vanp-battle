class WeaponSystem {
  constructor(scene, stats) {
    this.scene = scene;
    this.stats = stats;
    this.bullets = [];
    this.fireTimer = 0;
  }

  // aimAngle: radians or null (→ auto-target nearest enemy)
  update(delta, playerX, playerY, enemies, aimAngle = null) {
    this.fireTimer += delta;

    if (this.fireTimer >= this.stats.fireRate) {
      this.fireTimer = 0;

      let angle = aimAngle;
      if (angle === null) {
        const target = this._findClosestEnemy(playerX, playerY, enemies);
        if (target) {
          angle = Math.atan2(target.y - playerY, target.x - playerX);
        }
      }

      if (angle !== null) {
        this._fireAtAngle(playerX, playerY, angle);
      }
    }

    this._updateBullets(delta, enemies);
  }

  _findClosestEnemy(px, py, enemies) {
    let closest = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e.active) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = e; }
    }
    return closest;
  }

  _fireAtAngle(px, py, baseAngle) {
    const count = this.stats.bulletCount;
    const spread = count > 1 ? (Math.PI / 8) : 0;

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = baseAngle + offset;

      const g = this.scene.add.graphics();
      g.fillStyle(0xffff44, 1);
      g.fillCircle(0, 0, 5);
      g.x = px;
      g.y = py;
      g.setDepth(5);

      this.bullets.push({
        gfx: g,
        x: px, y: py,
        vx: Math.cos(angle) * this.stats.bulletSpeed,
        vy: Math.sin(angle) * this.stats.bulletSpeed,
        damage: this.stats.power,
        pierce: this.stats.pierce,
        hitEnemies: new Set(),
        active: true,
        lifetime: 3000,
      });
    }
  }

  _updateBullets(delta, enemies) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b.active) { this.bullets.splice(i, 1); continue; }

      b.x += b.vx * (delta / 1000);
      b.y += b.vy * (delta / 1000);
      b.lifetime -= delta;
      b.gfx.x = b.x;
      b.gfx.y = b.y;

      if (b.x < 0 || b.x > 2000 || b.y < 0 || b.y > 2000 || b.lifetime <= 0) {
        this._destroyBullet(b);
        this.bullets.splice(i, 1);
        continue;
      }

      let destroy = false;
      for (const e of enemies) {
        if (!e.active || b.hitEnemies.has(e)) continue;
        const dx = b.x - e.x, dy = b.y - e.y;
        if (Math.sqrt(dx * dx + dy * dy) < e.size + 5) {
          b.hitEnemies.add(e);
          const killed = this.scene.enemySpawner
            ? this.scene.enemySpawner.hitEnemy(e, b.damage) : false;
          if (killed && this.scene.onEnemyKilled) this.scene.onEnemyKilled(e);
          if (!b.pierce) { destroy = true; break; }
        }
      }

      if (destroy) { this._destroyBullet(b); this.bullets.splice(i, 1); }
    }
  }

  _destroyBullet(b) {
    b.active = false;
    if (b.gfx) b.gfx.destroy();
  }

  destroyAll() {
    for (const b of this.bullets) { if (b.gfx) b.gfx.destroy(); }
    this.bullets = [];
  }

  // Battle scene: fire toward explicit target position
  fireBattle(px, py, targetX, targetY) {
    const count = this.stats.bulletCount;
    const baseAngle = Math.atan2(targetY - py, targetX - px);
    const spread = count > 1 ? (Math.PI / 8) : 0;
    const fired = [];

    for (let i = 0; i < count; i++) {
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
      const angle = baseAngle + offset;

      const g = this.scene.add.graphics();
      g.fillStyle(0xff8844, 1);
      g.fillCircle(0, 0, 6);
      g.x = px; g.y = py;
      g.setDepth(5);

      const bullet = {
        gfx: g, x: px, y: py,
        vx: Math.cos(angle) * this.stats.bulletSpeed,
        vy: Math.sin(angle) * this.stats.bulletSpeed,
        angle, damage: this.stats.power,
        pierce: this.stats.pierce,
        active: true, lifetime: 3000, fromPlayer: true,
      };
      this.bullets.push(bullet);
      fired.push({ vx: bullet.vx, vy: bullet.vy, angle });
    }
    return fired;
  }
}
