// AbilitySystem.js - Level-up ability definitions and application
const ABILITIES = [
  {
    id: 'atk_up',
    name: '攻撃力UP',
    desc: '攻撃力 +20%',
    icon: '⚔️',
    apply: (stats) => { stats.power *= 1.2; },
  },
  {
    id: 'fire_up',
    name: '攻撃速度UP',
    desc: '攻撃速度 +15%',
    icon: '⚡',
    apply: (stats) => { stats.fireRate = Math.max(80, stats.fireRate * 0.87); },
  },
  {
    id: 'speed_up',
    name: '移動速度UP',
    desc: '移動速度 +10%',
    icon: '👟',
    apply: (stats) => { stats.speed *= 1.1; },
  },
  {
    id: 'multi_shot',
    name: '弾数+1',
    desc: 'マルチショット（弾が増える）',
    icon: '🔫',
    apply: (stats) => { stats.bulletCount += 1; },
  },
  {
    id: 'pierce',
    name: '貫通弾',
    desc: '弾が敵を貫通する',
    icon: '🏹',
    apply: (stats) => { stats.pierce = true; },
  },
  {
    id: 'collect_up',
    name: '吸収範囲UP',
    desc: 'EXP吸取り範囲が広がる',
    icon: '🧲',
    apply: (stats) => { stats.collectRange += 40; },
  },
  {
    id: 'hp_heal',
    name: 'HP回復',
    desc: 'HP +30（即時回復）',
    icon: '❤️',
    apply: (stats) => { stats.hp = Math.min(stats.maxHp, stats.hp + 30); },
  },
  {
    id: 'maxhp_up',
    name: '最大HP UP',
    desc: '最大HP +50',
    icon: '💪',
    apply: (stats) => { stats.maxHp += 50; stats.hp += 50; },
  },
  {
    id: 'bullet_speed_up',
    name: '弾速UP',
    desc: '弾速度 +20%',
    icon: '💨',
    apply: (stats) => { stats.bulletSpeed *= 1.2; },
  },
];

class AbilitySystem {
  // Pick 3 random unique abilities
  static getRandomChoices(count = 3) {
    const shuffled = [...ABILITIES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  static apply(abilityId, stats) {
    const ability = ABILITIES.find(a => a.id === abilityId);
    if (!ability) return;
    ability.apply(stats);
    if (!stats.abilities) stats.abilities = [];
    stats.abilities.push(abilityId);
  }

  static getById(id) {
    return ABILITIES.find(a => a.id === id);
  }
}
