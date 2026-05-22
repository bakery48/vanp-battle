// Player.js - Player stats management
class PlayerStats {
  constructor(overrides = {}) {
    this.hp         = overrides.hp         !== undefined ? overrides.hp         : 100;
    this.maxHp      = overrides.maxHp      !== undefined ? overrides.maxHp      : 100;
    this.speed      = overrides.speed      !== undefined ? overrides.speed      : 160;
    this.power      = overrides.power      !== undefined ? overrides.power      : 10;
    this.fireRate   = overrides.fireRate   !== undefined ? overrides.fireRate   : 500;
    this.bulletCount= overrides.bulletCount!== undefined ? overrides.bulletCount: 1;
    this.bulletSpeed= overrides.bulletSpeed!== undefined ? overrides.bulletSpeed: 400;
    this.collectRange=overrides.collectRange!==undefined ? overrides.collectRange: 80;
    this.pierce     = overrides.pierce     !== undefined ? overrides.pierce     : false;
    this.shield     = overrides.shield     !== undefined ? overrides.shield     : false;
    this.gold       = overrides.gold       !== undefined ? overrides.gold       : 0;
    this.exp        = overrides.exp        !== undefined ? overrides.exp        : 0;
    this.level      = overrides.level      !== undefined ? overrides.level      : 1;
    this.score      = overrides.score      !== undefined ? overrides.score      : 0;
    this.abilities  = overrides.abilities  || [];
  }

  // EXP needed for next level
  expToNextLevel() {
    return this.level * 20 + 10;
  }

  // Try to level up; returns true if leveled
  tryLevelUp() {
    const needed = this.expToNextLevel();
    if (this.exp >= needed) {
      this.exp -= needed;
      this.level++;
      return true;
    }
    return false;
  }

  toJSON() {
    return {
      hp: this.hp,
      maxHp: this.maxHp,
      speed: this.speed,
      power: this.power,
      fireRate: this.fireRate,
      bulletCount: this.bulletCount,
      bulletSpeed: this.bulletSpeed,
      collectRange: this.collectRange,
      pierce: this.pierce,
      shield: this.shield,
      gold: this.gold,
      exp: this.exp,
      level: this.level,
      score: this.score,
      abilities: this.abilities,
    };
  }
}
