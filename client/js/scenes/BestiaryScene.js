// BestiaryScene.js - Enemy bestiary overlay (launched on top of LobbyScene)
class BestiaryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BestiaryScene' });
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── 敵データ定義 ──────────────────────────────────────────────
    const enemies = [
      {
        id: 'slime',
        name: 'スライム',
        color: 0x66cc44,
        hp: 30, speed: 60, damage: 5, exp: 5, gold: 3, size: 14,
        spawnTiming: '序盤から大量出現',
        desc: '最も基本的な敵。動きは遅いが群れで迫ってくる。\n数が多いのでまとめて倒してEXPを稼ごう。',
        rarity: '★★★★★',
        rarityColor: '#66cc44',
      },
      {
        id: 'bat',
        name: 'コウモリ',
        color: 0x8844cc,
        hp: 15, speed: 100, damage: 3, exp: 8, gold: 2, size: 10,
        spawnTiming: '序盤から出現、後半も継続',
        desc: '素早く追いかけてくる小型の敵。HPは低いが\n速度が速いので油断すると囲まれる。',
        rarity: '★★★★☆',
        rarityColor: '#aa66ff',
      },
      {
        id: 'golem',
        name: 'ゴーレム',
        color: 0x888888,
        hp: 100, speed: 30, damage: 15, exp: 20, gold: 10, size: 20,
        spawnTiming: '中盤（30秒〜）から出現増加',
        desc: '岩でできた重装甲の敵。動きは鈍いが高いHPと\n強力な攻撃を持つ。倒せれば大量のEXPとゴールドが手に入る。',
        rarity: '★★☆☆☆',
        rarityColor: '#ff8844',
      },
    ];

    // ── 背景オーバーレイ ──────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.88);
    bg.fillRect(0, 0, W, H);

    // ── パネル ────────────────────────────────────────────────────
    const panelW = 1100;
    const panelH = 560;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x0d1f3c, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 16);
    panel.lineStyle(2, 0x4488ff, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 16);

    // タイトル
    this.add.text(W / 2, panelY + 28, '敵キャラ図鑑', {
      fontSize: '30px', fontStyle: 'bold', color: '#f0c040',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, panelY + 66, '※ HP・ダメージはラウンドと経過時間で増加します', {
      fontSize: '14px', color: '#888888',
    }).setOrigin(0.5, 0);

    // ── 敵カード ──────────────────────────────────────────────────
    const cardW   = 310;
    const cardH   = 400;
    const cardGap = 30;
    const totalW  = cardW * 3 + cardGap * 2;
    const cardStartX = (W - totalW) / 2;
    const cardY   = panelY + 100;

    enemies.forEach((e, idx) => {
      const cx = cardStartX + idx * (cardW + cardGap);
      this._drawEnemyCard(cx, cardY, cardW, cardH, e);
    });

    // ── 閉じるボタン ──────────────────────────────────────────────
    const closeX = panelX + panelW - 20;
    const closeY = panelY + 20;

    const closeBg = this.add.graphics();
    closeBg.fillStyle(0x882222, 1);
    closeBg.fillCircle(closeX, closeY, 18);
    closeBg.lineStyle(2, 0xff6666, 1);
    closeBg.strokeCircle(closeX, closeY, 18);

    const closeTxt = this.add.text(closeX, closeY, '✕', {
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
    closeHit.on('pointerdown', () => {
      this.scene.stop();
    });

    // ESCキーでも閉じる
    this.input.keyboard.once('keydown-ESC', () => this.scene.stop());
  }

  _drawEnemyCard(cx, cy, w, h, e) {
    // カード背景
    const card = this.add.graphics();
    card.fillStyle(0x112244, 1);
    card.fillRoundedRect(cx, cy, w, h, 10);
    card.lineStyle(2, 0x336699, 1);
    card.strokeRoundedRect(cx, cy, w, h, 10);

    // ── 敵のイラスト エリア ───────────────────────────────────────
    const previewBg = this.add.graphics();
    previewBg.fillStyle(0x0a1a2a, 1);
    previewBg.fillRoundedRect(cx + 8, cy + 8, w - 16, 130, 8);

    // 敵グラフィック（中央に描画）
    const gx = cx + w / 2;
    const gy = cy + 73;
    this._drawEnemyPreview(gx, gy, e);

    // ── 名前 ──────────────────────────────────────────────────────
    this.add.text(cx + w / 2, cy + 148, e.name, {
      fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5, 0);

    // レアリティ（出現頻度）
    this.add.text(cx + w / 2, cy + 176, e.rarity, {
      fontSize: '16px', color: e.rarityColor,
    }).setOrigin(0.5, 0);

    // ── ステータス ────────────────────────────────────────────────
    const statY = cy + 204;
    const statDefs = [
      { label: 'HP',     value: e.hp,     icon: '❤️', color: '#ff6666' },
      { label: '速度',   value: e.speed,  icon: '💨', color: '#88ddff' },
      { label: 'ダメージ', value: e.damage, icon: '⚔️', color: '#ffaa44' },
      { label: 'EXP',   value: e.exp,    icon: '✨', color: '#88ff88' },
      { label: 'ゴールド', value: e.gold,   icon: '🪙', color: '#ffdd44' },
    ];

    statDefs.forEach((s, i) => {
      const sy = statY + i * 26;
      // ラベル
      this.add.text(cx + 18, sy, `${s.icon} ${s.label}`, {
        fontSize: '14px', color: '#aabbcc',
      }).setOrigin(0, 0);
      // 値
      this.add.text(cx + w - 18, sy, `${s.value}`, {
        fontSize: '14px', fontStyle: 'bold', color: s.color,
      }).setOrigin(1, 0);
      // 区切り線
      if (i < statDefs.length - 1) {
        const div = this.add.graphics();
        div.lineStyle(1, 0x223355, 0.8);
        div.lineBetween(cx + 12, sy + 22, cx + w - 12, sy + 22);
      }
    });

    // ── 出現タイミング ────────────────────────────────────────────
    const timingY = cy + h - 112;
    const timingBg = this.add.graphics();
    timingBg.fillStyle(0x1a3a5a, 0.8);
    timingBg.fillRoundedRect(cx + 8, timingY, w - 16, 24, 4);

    this.add.text(cx + w / 2, timingY + 4, `⏱ ${e.spawnTiming}`, {
      fontSize: '12px', color: '#88ccff',
    }).setOrigin(0.5, 0);

    // ── 説明文 ────────────────────────────────────────────────────
    this.add.text(cx + w / 2, timingY + 34, e.desc, {
      fontSize: '13px', color: '#99aacc',
      align: 'center',
      wordWrap: { width: w - 24 },
      lineSpacing: 4,
    }).setOrigin(0.5, 0);
  }

  _drawEnemyPreview(gx, gy, e) {
    const scale = 2.2; // 拡大して見やすく
    const s = e.size * scale;
    const g = this.add.graphics();

    if (e.id === 'slime') {
      // ボディ
      g.fillStyle(e.color, 1);
      g.fillCircle(gx, gy, s);
      // ハイライト
      g.fillStyle(0xaaffaa, 0.3);
      g.fillCircle(gx - s * 0.3, gy - s * 0.3, s * 0.35);
      // アウトライン
      g.lineStyle(2, 0x44aa22, 1);
      g.strokeCircle(gx, gy, s);
      // 目
      g.fillStyle(0xffffff, 1);
      g.fillCircle(gx - s * 0.35, gy - s * 0.25, s * 0.22);
      g.fillCircle(gx + s * 0.35, gy - s * 0.25, s * 0.22);
      g.fillStyle(0x000000, 1);
      g.fillCircle(gx - s * 0.28, gy - s * 0.25, s * 0.12);
      g.fillCircle(gx + s * 0.42, gy - s * 0.25, s * 0.12);
      // 口
      g.lineStyle(2, 0x224411, 1);
      g.beginPath();
      g.arc(gx, gy + s * 0.15, s * 0.25, 0.2, Math.PI - 0.2);
      g.strokePath();

    } else if (e.id === 'bat') {
      // 翼（左）
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(gx - s * 1.2, gy, gx - s * 1.8, gy - s * 0.8, gx - s * 0.3, gy - s * 0.4);
      g.fillTriangle(gx - s * 0.6, gy, gx - s * 1.2, gy - s * 0.6, gx - s * 0.2, gy - s * 0.2);
      // 翼（右）
      g.fillTriangle(gx + s * 1.2, gy, gx + s * 1.8, gy - s * 0.8, gx + s * 0.3, gy - s * 0.4);
      g.fillTriangle(gx + s * 0.6, gy, gx + s * 1.2, gy - s * 0.6, gx + s * 0.2, gy - s * 0.2);
      // ボディ
      g.fillStyle(e.color, 1);
      g.fillEllipse(gx, gy, s * 2, s * 1.2);
      g.lineStyle(2, 0x6622aa, 1);
      g.strokeEllipse(gx, gy, s * 2, s * 1.2);
      // 耳
      g.fillStyle(0xaa44aa, 1);
      g.fillTriangle(gx - s * 0.4, gy - s * 0.5, gx - s * 0.6, gy - s * 1.1, gx - s * 0.1, gy - s * 0.6);
      g.fillTriangle(gx + s * 0.4, gy - s * 0.5, gx + s * 0.6, gy - s * 1.1, gx + s * 0.1, gy - s * 0.6);
      // 目
      g.fillStyle(0xff2222, 1);
      g.fillCircle(gx - s * 0.3, gy - s * 0.1, s * 0.18);
      g.fillCircle(gx + s * 0.3, gy - s * 0.1, s * 0.18);
      g.fillStyle(0x000000, 1);
      g.fillCircle(gx - s * 0.25, gy - s * 0.1, s * 0.09);
      g.fillCircle(gx + s * 0.35, gy - s * 0.1, s * 0.09);

    } else if (e.id === 'golem') {
      // 影
      g.fillStyle(0x333333, 0.4);
      g.fillEllipse(gx, gy + s + 4, s * 2.2, s * 0.5);
      // ボディ
      g.fillStyle(e.color, 1);
      g.fillRect(gx - s, gy - s, s * 2, s * 2);
      // テクスチャ（石のひび）
      g.fillStyle(0x555555, 1);
      g.fillRect(gx - s + 3, gy - s + 3, s * 2 - 6, s * 2 - 6);
      g.lineStyle(2, 0x444444, 0.8);
      g.lineBetween(gx - s + 6, gy - s * 0.2, gx + s - 6, gy - s * 0.2);
      g.lineBetween(gx - s * 0.3, gy - s + 6, gx - s * 0.3, gy + s - 6);
      g.lineBetween(gx + s * 0.4, gy - s * 0.5, gx + s * 0.4, gy + s - 6);
      // アウトライン
      g.lineStyle(3, 0x444444, 1);
      g.strokeRect(gx - s, gy - s, s * 2, s * 2);
      // 目
      g.fillStyle(0xff2222, 1);
      g.fillCircle(gx - s * 0.35, gy - s * 0.2, s * 0.22);
      g.fillCircle(gx + s * 0.35, gy - s * 0.2, s * 0.22);
      g.fillStyle(0xff6600, 0.8);
      g.fillCircle(gx - s * 0.35, gy - s * 0.2, s * 0.12);
      g.fillCircle(gx + s * 0.35, gy - s * 0.2, s * 0.12);
      // 口
      g.fillStyle(0x222222, 1);
      g.fillRect(gx - s * 0.4, gy + s * 0.25, s * 0.8, s * 0.22);
      g.fillStyle(0xffffff, 0.6);
      g.fillRect(gx - s * 0.3, gy + s * 0.28, s * 0.15, s * 0.14);
      g.fillRect(gx + s * 0.12, gy + s * 0.28, s * 0.15, s * 0.14);
    }
  }
}
