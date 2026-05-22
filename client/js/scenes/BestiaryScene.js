// BestiaryScene.js - Enemy bestiary overlay
class BestiaryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BestiaryScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    const enemies = [
      {
        id: 'slime',
        name: 'スライム',
        color: 0x66cc44,
        hp: 30, speed: 60, damage: 5, exp: 5, gold: 3, size: 14,
        attackType: '体当たり',
        spawnTiming: '序盤から大量出現',
        desc: '最も基本的な敵。動きは遅いが群れで迫ってくる。まとめて倒してEXPを稼ごう。',
        rarity: '★★★★★',
        rarityColor: '#66cc44',
      },
      {
        id: 'bat',
        name: 'コウモリ',
        color: 0x8844cc,
        hp: 15, speed: 100, damage: 3, exp: 8, gold: 2, size: 10,
        attackType: '体当たり',
        spawnTiming: '序盤から出現、後半も継続',
        desc: '素早く追いかけてくる小型の敵。HPは低いが速度が速いので油断すると囲まれる。',
        rarity: '★★★★☆',
        rarityColor: '#aa66ff',
      },
      {
        id: 'golem',
        name: 'ゴーレム',
        color: 0x888888,
        hp: 100, speed: 30, damage: 15, exp: 20, gold: 10, size: 20,
        attackType: '体当たり',
        spawnTiming: '中盤（30秒〜）から出現増加',
        desc: '岩でできた重装甲の敵。動きは鈍いが高いHPと強力な攻撃を持つ。',
        rarity: '★★☆☆☆',
        rarityColor: '#ff8844',
      },
      {
        id: 'archer',
        name: 'アーチャー',
        color: 0xcc7722,
        hp: 45, speed: 50, damage: 3, bulletDamage: 10, exp: 12, gold: 5, size: 13,
        attackType: '直線弾',
        spawnTiming: '中盤後半（50秒〜）',
        desc: '距離を保ちながら直線弾を撃ってくる。近づくと後退するが弾は止まらない。',
        rarity: '★★★☆☆',
        rarityColor: '#ffaa44',
      },
      {
        id: 'spinner',
        name: 'スピナー',
        color: 0xbb33bb,
        hp: 35, speed: 35, damage: 3, bulletDamage: 6, exp: 15, gold: 6, size: 14,
        attackType: '放射状弾×8',
        spawnTiming: '後半（70秒〜）',
        desc: 'ゆっくり近づきながら全方向へ弾をばら撒く。群れると逃げ場がなくなる。',
        rarity: '★★☆☆☆',
        rarityColor: '#ee66ee',
      },
    ];

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.88);
    bg.fillRect(0, 0, W, H);

    // Panel
    const panelW = 1220;
    const panelH = 560;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x0d1f3c, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    panel.lineStyle(2, 0x4488ff, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);

    this.add.text(W / 2, panelY + 28, '敵キャラ図鑑', {
      fontSize: '30px', fontStyle: 'bold', color: '#f0c040',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, panelY + 66, '※ HP・ダメージはラウンドと経過時間で増加します', {
      fontSize: '14px', color: '#888888',
    }).setOrigin(0.5, 0);

    // Cards — 5 in a row
    const cardW   = 210;
    const cardH   = 400;
    const cardGap = 18;
    const totalW  = cardW * 5 + cardGap * 4;
    const cardStartX = (W - totalW) / 2;
    const cardY   = panelY + 100;

    enemies.forEach((e, idx) => {
      const cx = cardStartX + idx * (cardW + cardGap);
      this._drawEnemyCard(cx, cardY, cardW, cardH, e);
    });

    // Close button
    const closeX = panelX + panelW - 20;
    const closeY = panelY + 20;

    const closeBg = this.add.graphics();
    closeBg.fillStyle(0x882222, 1);
    closeBg.fillCircle(closeX, closeY, 18);
    closeBg.lineStyle(2, 0xff6666, 1);
    closeBg.strokeCircle(closeX, closeY, 18);

    this.add.text(closeX, closeY, '✕', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const closeHit = this.add.circle(closeX, closeY, 22, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    closeHit.on('pointerover', () => {
      closeBg.clear();
      closeBg.fillStyle(0xcc3333, 1);
      closeBg.fillCircle(closeX, closeY, 18);
      closeBg.lineStyle(2, 0xff9999, 1);
      closeBg.strokeCircle(closeX, closeY, 18);
    });
    closeHit.on('pointerout', () => {
      closeBg.clear();
      closeBg.fillStyle(0x882222, 1);
      closeBg.fillCircle(closeX, closeY, 18);
      closeBg.lineStyle(2, 0xff6666, 1);
      closeBg.strokeCircle(closeX, closeY, 18);
    });
    closeHit.on('pointerdown', () => this.scene.stop());

    this.input.keyboard.once('keydown-ESC', () => this.scene.stop());
  }

  _drawEnemyCard(cx, cy, w, h, e) {
    const card = this.add.graphics();
    card.fillStyle(0x112244, 1);
    card.fillRoundedRect(cx, cy, w, h, 10);
    card.lineStyle(2, 0x336699, 1);
    card.strokeRoundedRect(cx, cy, w, h, 10);

    // Preview area
    const previewBg = this.add.graphics();
    previewBg.fillStyle(0x0a1a2a, 1);
    previewBg.fillRoundedRect(cx + 8, cy + 8, w - 16, 120, 8);

    const gx = cx + w / 2;
    const gy = cy + 68;
    this._drawEnemyPreview(gx, gy, e);

    // Name
    this.add.text(cx + w / 2, cy + 136, e.name, {
      fontSize: '19px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5, 0);

    // Rarity
    this.add.text(cx + w / 2, cy + 160, e.rarity, {
      fontSize: '14px', color: e.rarityColor,
    }).setOrigin(0.5, 0);

    // Attack type badge
    const atkColor = e.attackType.includes('弾') ? '#ff9933' : '#88ddff';
    this.add.text(cx + w / 2, cy + 180, `⚡ ${e.attackType}`, {
      fontSize: '13px', fontStyle: 'bold', color: atkColor,
    }).setOrigin(0.5, 0);

    // Stats
    const statY = cy + 202;
    const statDefs = [
      { label: 'HP',        value: e.hp,          icon: '❤️', color: '#ff6666' },
      { label: '速度',      value: e.speed,        icon: '💨', color: '#88ddff' },
      { label: 'ダメージ', value: (e.bulletDamage ? `${e.damage}/${e.bulletDamage}` : e.damage), icon: '⚔️', color: '#ffaa44' },
      { label: 'EXP',       value: e.exp,          icon: '✨', color: '#88ff88' },
      { label: 'ゴールド',  value: e.gold,         icon: '🪙', color: '#ffdd44' },
    ];

    statDefs.forEach((s, i) => {
      const sy = statY + i * 24;
      this.add.text(cx + 12, sy, `${s.icon} ${s.label}`, {
        fontSize: '13px', color: '#aabbcc',
      }).setOrigin(0, 0);
      this.add.text(cx + w - 12, sy, `${s.value}`, {
        fontSize: '13px', fontStyle: 'bold', color: s.color,
      }).setOrigin(1, 0);
      if (i < statDefs.length - 1) {
        const div = this.add.graphics();
        div.lineStyle(1, 0x223355, 0.8);
        div.lineBetween(cx + 10, sy + 20, cx + w - 10, sy + 20);
      }
    });

    // Spawn timing
    const timingY = cy + h - 100;
    const timingBg = this.add.graphics();
    timingBg.fillStyle(0x1a3a5a, 0.8);
    timingBg.fillRoundedRect(cx + 8, timingY, w - 16, 22, 4);
    this.add.text(cx + w / 2, timingY + 3, `⏱ ${e.spawnTiming}`, {
      fontSize: '11px', color: '#88ccff',
    }).setOrigin(0.5, 0);

    // Description
    this.add.text(cx + w / 2, timingY + 30, e.desc, {
      fontSize: '12px', color: '#99aacc',
      align: 'center',
      wordWrap: { width: w - 20 },
      lineSpacing: 3,
    }).setOrigin(0.5, 0);
  }

  _drawEnemyPreview(gx, gy, e) {
    const scale = 2.0;
    const s = e.size * scale;
    const g = this.add.graphics();

    if (e.id === 'slime') {
      g.fillStyle(e.color, 1);
      g.fillCircle(gx, gy, s);
      g.fillStyle(0xaaffaa, 0.3);
      g.fillCircle(gx - s * 0.3, gy - s * 0.3, s * 0.35);
      g.lineStyle(2, 0x44aa22, 1);
      g.strokeCircle(gx, gy, s);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(gx - s * 0.35, gy - s * 0.25, s * 0.22);
      g.fillCircle(gx + s * 0.35, gy - s * 0.25, s * 0.22);
      g.fillStyle(0x000000, 1);
      g.fillCircle(gx - s * 0.28, gy - s * 0.25, s * 0.12);
      g.fillCircle(gx + s * 0.42, gy - s * 0.25, s * 0.12);
      g.lineStyle(2, 0x224411, 1);
      g.beginPath();
      g.arc(gx, gy + s * 0.15, s * 0.25, 0.2, Math.PI - 0.2);
      g.strokePath();

    } else if (e.id === 'bat') {
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(gx - s * 1.2, gy, gx - s * 1.8, gy - s * 0.8, gx - s * 0.3, gy - s * 0.4);
      g.fillTriangle(gx - s * 0.6, gy, gx - s * 1.2, gy - s * 0.6, gx - s * 0.2, gy - s * 0.2);
      g.fillTriangle(gx + s * 1.2, gy, gx + s * 1.8, gy - s * 0.8, gx + s * 0.3, gy - s * 0.4);
      g.fillTriangle(gx + s * 0.6, gy, gx + s * 1.2, gy - s * 0.6, gx + s * 0.2, gy - s * 0.2);
      g.fillStyle(e.color, 1);
      g.fillEllipse(gx, gy, s * 2, s * 1.2);
      g.lineStyle(2, 0x6622aa, 1);
      g.strokeEllipse(gx, gy, s * 2, s * 1.2);
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(gx - s * 0.4, gy - s * 0.5, gx - s * 0.6, gy - s * 1.1, gx - s * 0.1, gy - s * 0.6);
      g.fillTriangle(gx + s * 0.4, gy - s * 0.5, gx + s * 0.6, gy - s * 1.1, gx + s * 0.1, gy - s * 0.6);
      g.fillStyle(0xff2222, 1);
      g.fillCircle(gx - s * 0.3, gy - s * 0.1, s * 0.18);
      g.fillCircle(gx + s * 0.3, gy - s * 0.1, s * 0.18);
      g.fillStyle(0x000000, 1);
      g.fillCircle(gx - s * 0.25, gy - s * 0.1, s * 0.09);
      g.fillCircle(gx + s * 0.35, gy - s * 0.1, s * 0.09);

    } else if (e.id === 'golem') {
      g.fillStyle(0x333333, 0.4);
      g.fillEllipse(gx, gy + s + 4, s * 2.2, s * 0.5);
      g.fillStyle(e.color, 1);
      g.fillRect(gx - s, gy - s, s * 2, s * 2);
      g.fillStyle(0x555555, 1);
      g.fillRect(gx - s + 3, gy - s + 3, s * 2 - 6, s * 2 - 6);
      g.lineStyle(2, 0x444444, 0.8);
      g.lineBetween(gx - s + 6, gy - s * 0.2, gx + s - 6, gy - s * 0.2);
      g.lineBetween(gx - s * 0.3, gy - s + 6, gx - s * 0.3, gy + s - 6);
      g.lineBetween(gx + s * 0.4, gy - s * 0.5, gx + s * 0.4, gy + s - 6);
      g.lineStyle(3, 0x444444, 1);
      g.strokeRect(gx - s, gy - s, s * 2, s * 2);
      g.fillStyle(0xff2222, 1);
      g.fillCircle(gx - s * 0.35, gy - s * 0.2, s * 0.22);
      g.fillCircle(gx + s * 0.35, gy - s * 0.2, s * 0.22);
      g.fillStyle(0xff6600, 0.8);
      g.fillCircle(gx - s * 0.35, gy - s * 0.2, s * 0.12);
      g.fillCircle(gx + s * 0.35, gy - s * 0.2, s * 0.12);
      g.fillStyle(0x222222, 1);
      g.fillRect(gx - s * 0.4, gy + s * 0.25, s * 0.8, s * 0.22);
      g.fillStyle(0xffffff, 0.6);
      g.fillRect(gx - s * 0.3, gy + s * 0.28, s * 0.15, s * 0.14);
      g.fillRect(gx + s * 0.12, gy + s * 0.28, s * 0.15, s * 0.14);

    } else if (e.id === 'archer') {
      // Diamond body
      g.fillStyle(e.color, 1);
      g.fillTriangle(gx, gy - s, gx + s, gy, gx, gy + s);
      g.fillTriangle(gx, gy - s, gx - s, gy, gx, gy + s);
      g.lineStyle(3, 0xff9944, 1);
      g.beginPath();
      g.moveTo(gx, gy - s);
      g.lineTo(gx + s, gy);
      g.lineTo(gx, gy + s);
      g.lineTo(gx - s, gy);
      g.closePath();
      g.strokePath();
      // Glowing eye
      g.fillStyle(0xffee88, 1);
      g.fillCircle(gx, gy - 4, s * 0.22);
      g.fillStyle(0x000000, 1);
      g.fillCircle(gx + 2, gy - 4, s * 0.11);
      // Arrow showing it shoots
      g.lineStyle(2, 0xffffff, 0.8);
      g.lineBetween(gx + s, gy, gx + s + 22, gy);
      g.fillStyle(0xff9933, 1);
      g.fillCircle(gx + s + 24, gy, 5);

    } else if (e.id === 'spinner') {
      // Bullets radiating out
      const bulletCount = 8;
      for (let i = 0; i < bulletCount; i++) {
        const angle = (i / bulletCount) * Math.PI * 2;
        const bx = gx + Math.cos(angle) * (s + 22);
        const by = gy + Math.sin(angle) * (s + 22);
        g.fillStyle(0xff44ff, 0.7);
        g.fillCircle(bx, by, 5);
      }
      // Spikes
      g.fillStyle(0xdd66dd, 0.9);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const tx  = gx + Math.cos(angle) * (s + 9);
        const ty  = gy + Math.sin(angle) * (s + 9);
        const p1x = gx + Math.cos(angle + 0.38) * (s - 1);
        const p1y = gy + Math.sin(angle + 0.38) * (s - 1);
        const p2x = gx + Math.cos(angle - 0.38) * (s - 1);
        const p2y = gy + Math.sin(angle - 0.38) * (s - 1);
        g.fillTriangle(tx, ty, p1x, p1y, p2x, p2y);
      }
      // Body
      g.fillStyle(e.color, 1);
      g.fillCircle(gx, gy, s);
      g.lineStyle(2, 0xee88ee, 1);
      g.strokeCircle(gx, gy, s);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(gx, gy, s * 0.22);
    }
  }
}
