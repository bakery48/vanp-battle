// EnemySpawner.js - Enemy spawning system for solo phase
class EnemySpawner {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.enemies = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1500; // ms between spawns
    this.worldWidth = 2000;
    this.worldHeight = 2000;

    // Enemy templates
    this.enemyTypes = [
      { id: 'slime', hp: 30,  speed: 60,  damage: 5,  exp: 5,  gold: 3,  size: 14, color: 0x66cc44 },
      { id: 'bat',   hp: 15,  speed: 100, damage: 3,  exp: 8,  gold: 2,  size: 10, color: 0x8844cc },
      { id: 'golem', hp: 100, speed: 30,  damage: 15, exp: 20, gold: 10, size: 20, color: 0x888888 },
    ];
  }

  // Scale enemy stats based on round and elapsed time
  _getScaledType(round, elapsedSec) {
    const timeBonus = elapsedSec / 120; // 0 to 1 over 2 minutes
    const roundBonus = (round - 1) * 0.3;
    const totalBonus = 1 + timeBonus * 0.5 + roundBonus;

    // Spawn table: early = slimes, late = golems appear
    let rng = Math.random();
    let typeIndex;
    if (elapsedSec < 30) {
      typeIndex = rng < 0.85 ? 0 : 1; // mostly slimes, some bats
    } else if (elapsedSec < 70) {
      typeIndex = rng < 0.5 ? 0 : rng < 0.85 ? 1 : 2;
    } else {
      typeIndex = rng < 0.3 ? 0 : rng < 0.6 ? 1 : 2; // more golems late
    }

    const base = this.enemyTypes[typeIndex];
    return {
      ...base,
      hp: Math.round(base.hp * totalBonus),
      maxHp: Math.round(base.hp * totalBonus),
      damage: Math.round(base.damage * totalBonus),
    };
  }

  update(delta, round, elapsedSec) {
    this.spawnTimer += delta;

    // Adjust spawn interval: faster over time and round
    const baseInterval = Math.max(400, 1500 - elapsedSec * 5 - (round - 1) * 200);
    if (this.spawnTimer >= baseInterval) {
      this.spawnTimer = 0;
      this._spawnEnemy(round, elapsedSec);
    }

    // Update existing enemies
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

    // Spawn outside the visible area (~700px from player)
    const margin = 700;
    let x, y;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { x = px + (Math.random() * margin * 2 - margin); y = py - margin; }
    else if (side === 1) { x = px + (Math.random() * margin * 2 - margin); y = py + margin; }
    else if (side === 2) { x = px - margin; y = py + (Math.random() * margin * 2 - margin); }
    else               { x = px + margin; y = py + (Math.random() * margin * 2 - margin); }

    // Clamp to world bounds
    x = Phaser.Math.Clamp(x, 20, this.worldWidth - 20);
    y = Phaser.Math.Clamp(y, 20, this.worldHeight - 20);

    const g = this.scene.add.graphics();
    g.fillStyle(typeData.color, 1);
    if (typeData.id === 'slime') {
      g.fillCircle(0, 0, typeData.size);
      // Eyes
      g.fillStyle(0xffffff, 1);
      g.fillCircle(-5, -4, 3);
      g.fillCircle(5, -4, 3);
      g.fillStyle(0x000000, 1);
      g.fillCircle(-4, -4, 1.5);
      g.fillCircle(6, -4, 1.5);
    } else if (typeData.id === 'bat') {
      g.fillEllipse(0, 0, typeData.size * 2, typeData.size);
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(-typeData.size, 0, -typeData.size - 8, -8, -typeData.size + 4, -4);
      g.fillTriangle(typeData.size, 0, typeData.size + 8, -8, typeData.size - 4, -4);
    } else {
      g.fillRect(-typeData.size, -typeData.size, typeData.size * 2, typeData.size * 2);
      g.fillStyle(0x555555, 1);
      g.fillRect(-typeData.size + 2, -typeData.size + 2, typeData.size * 2 - 4, typeData.size * 2 - 4);
      g.fillStyle(0xff2222, 1);
      g.fillCircle(-5, -3, 4);
      g.fillCircle(5, -3, 4);
    }

    g.x = x;
    g.y = y;
    g.setDepth(2);

    // HP bar
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
      hp: typeData.hp,
      maxHp: typeData.maxHp,
      speed: typeData.speed,
      damage: typeData.damage,
      exp: typeData.exp,
      gold: typeData.gold,
      size: typeData.size,
      id: typeData.id,
      active: true,
      hitCooldown: 0,
      pierceHitBy: new Set(),
    };

    this.enemies.push(enemy);
  }

  _updateEnemy(e, delta) {
    if (!e.active) return;

    // Move toward player
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const speed = e.speed * (delta / 1000);
      e.x += (dx / dist) * speed;
      e.y += (dy / dist) * speed;
    }

    e.gfx.x = e.x;
    e.gfx.y = e.y;
    e.hpBg.x = e.x;
    e.hpBg.y = e.y;
    e.hpBar.x = e.x;
    e.hpBar.y = e.y;

    // Update HP bar
    const ratio = Math.max(0, e.hp / e.maxHp);
    e.hpBar.clear();
    e.hpBar.fillStyle(ratio > 0.5 ? 0x00ff44 : ratio > 0.25 ? 0xffff00 : 0xff2222, 1);
    e.hpBar.fillRect(-e.size, -e.size - 10, e.size * 2 * ratio, 5);

    // Hit cooldown
    if (e.hitCooldown > 0) e.hitCooldown -= delta;

    // Damage player on contact
    if (dist < e.size + 12 && e.hitCooldown <= 0) {
      e.hitCooldown = 1000;
      if (this.scene.onEnemyContact) {
        this.scene.onEnemyContact(e);
      }
    }
  }

  hitEnemy(enemy, damage) {
    enemy.hp -= damage;
    // Flash
    this.scene.tweens.add({
      targets: enemy.gfx,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
    });

    if (enemy.hp <= 0) {
      this.destroyEnemy(enemy);
      return true; // killed
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
  }

  getActiveEnemies() {
    return this.enemies.filter(e => e.active);
  }
}
