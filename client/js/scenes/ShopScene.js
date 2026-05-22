// ShopScene.js - Shop between rounds
class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ShopScene' });
    this._handlers = [];
    this.stats = null;
    this.round = 1;
    this.totalRounds = 3;
    this.remainingMs = 30000;
    this.isReady = false;
    this.readyCount = 0;
    this.totalPlayers = 0;
    this.timerEvent = null;
    this.goldText = null;
    this.timerText = null;
    this.readyText = null;
    this.itemCards = [];
  }

  init(data) {
    this.stats = data.stats ? new PlayerStats(data.stats) : new PlayerStats();
    this.round = data.round || 1;
    this.totalRounds = data.totalRounds || 3;
    this.remainingMs = 30000;
    this.isReady = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x2a1a0e, 0x2a1a0e, 1);
    bg.fillRect(0, 0, W, H);

    // Title
    this.add.text(W / 2, 30, 'ショップ', {
      fontSize: '36px', fontStyle: 'bold', color: '#f0c040',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 75, `Round ${this.round} / ${this.totalRounds}`, {
      fontSize: '18px', color: '#aabbcc',
    }).setOrigin(0.5, 0);

    // Gold display
    this.goldText = this.add.text(W / 2, 105, `Gold: ${Math.floor(this.stats.gold)}`, {
      fontSize: '24px', fontStyle: 'bold', color: '#ffdd44',
    }).setOrigin(0.5, 0);

    // Timer
    this.timerText = this.add.text(W - 20, 20, '30s', {
      fontSize: '24px', color: '#ff8844',
    }).setOrigin(1, 0);

    // Shop items grid
    this._buildShopItems();

    // Ready button
    this.readyBtn = this._makeButton(W / 2, H - 60, 200, 50, '準備完了', 0x228833, () => {
      if (!this.isReady) {
        this.isReady = true;
        window.network.shopReady();
        this._refreshReadyButton();
      }
    });

    // Ready status text
    this.readyText = this.add.text(W / 2, H - 100, '', {
      fontSize: '16px', color: '#aabbcc',
    }).setOrigin(0.5);

    // Stats panel on right
    this._buildStatsPanel();

    // Timer
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this._onTick,
      callbackScope: this,
      repeat: 30,
    });

    // Network events
    this._addHandler('shop_buy_result', (data) => {
      if (data.success) {
        // Update local stats from server response
        const s = data.stats;
        this.stats.hp = s.hp;
        this.stats.maxHp = s.maxHp;
        this.stats.speed = s.speed;
        this.stats.power = s.power;
        this.stats.fireRate = s.fireRate;
        this.stats.bulletCount = s.bulletCount;
        this.stats.bulletSpeed = s.bulletSpeed;
        this.stats.collectRange = s.collectRange;
        this.stats.pierce = s.pierce;
        this.stats.shield = s.shield;
        this.stats.gold = s.gold;
        this.goldText.setText(`Gold: ${Math.floor(this.stats.gold)}`);
        this._refreshItems();
        this._refreshStatsPanel();
      }
    });

    this._addHandler('shop_player_ready', (data) => {
      this.readyCount = data.readyCount;
      this.totalPlayers = data.totalCount;
      this.readyText.setText(`準備完了: ${this.readyCount} / ${this.totalPlayers}`);
    });

    this._addHandler('phase_change', (data) => {
      if (data.phase === 'solo') {
        this._cleanup();
        this.scene.start('SoloScene', {
          round: data.round,
          totalRounds: data.totalRounds,
          duration: data.duration,
        });
      } else if (data.phase === 'battle') {
        this._cleanup();
        this.scene.start('BattleScene', {
          battleState: data.battleState,
          myStats: this.stats.toJSON(),
        });
      }
    });

    this._addHandler('disconnected', () => {
      this._cleanup();
      this.scene.start('LobbyScene');
    });
  }

  _buildShopItems() {
    const W = this.scale.width;
    const shopItems = [
      { id: 'atk_up',    name: '攻撃力強化',  desc: '攻撃力 +25%',      cost: 50, icon: '⚔️' },
      { id: 'fire_up',   name: '連射強化',    desc: '攻撃速度 +20%',    cost: 40, icon: '⚡' },
      { id: 'speed_up',  name: 'スピードブーツ', desc: '移動速度 +15%',   cost: 30, icon: '👟' },
      { id: 'hp_potion', name: 'HP回復薬',    desc: 'HP +50',          cost: 20, icon: '🧪' },
      { id: 'maxhp_up',  name: '最大HP強化',  desc: '最大HP +100',      cost: 60, icon: '💪' },
      { id: 'shield',    name: 'シールド',    desc: 'バトルで一度だけ\nダメージ無効', cost: 80, icon: '🛡️' },
    ];

    const cols = 3;
    const cardW = 200;
    const cardH = 160;
    const padX = 30;
    const padY = 20;
    const startX = W / 2 - 300 - 100;
    const startY = 150;

    this.itemCards = [];

    shopItems.forEach((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = startX + col * (cardW + padX) + cardW / 2;
      const cy = startY + row * (cardH + padY) + cardH / 2;

      const canAfford = this.stats.gold >= item.cost;

      const cardBg = this.add.graphics();
      this._drawItemCard(cardBg, cx, cy, cardW, cardH, canAfford);

      const iconTxt = this.add.text(cx, cy - 40, item.icon, { fontSize: '28px' }).setOrigin(0.5);
      const nameTxt = this.add.text(cx, cy - 5, item.name, {
        fontSize: '16px', fontStyle: 'bold',
        color: canAfford ? '#ffffff' : '#888888',
        align: 'center',
      }).setOrigin(0.5);
      const descTxt = this.add.text(cx, cy + 20, item.desc, {
        fontSize: '13px', color: canAfford ? '#aabbcc' : '#666666',
        align: 'center', wordWrap: { width: cardW - 16 },
      }).setOrigin(0.5);
      const costTxt = this.add.text(cx, cy + 55, `${item.cost}G`, {
        fontSize: '18px', fontStyle: 'bold',
        color: canAfford ? '#ffdd44' : '#888855',
      }).setOrigin(0.5);

      const hitZone = this.add.rectangle(cx, cy, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: canAfford });

      hitZone.on('pointerdown', () => {
        if (this.stats.gold < item.cost) return;
        window.network.shopBuy(item.id);
      });
      hitZone.on('pointerover', () => {
        if (this.stats.gold >= item.cost) {
          cardBg.clear();
          this._drawItemCard(cardBg, cx, cy, cardW, cardH, true, true);
        }
      });
      hitZone.on('pointerout', () => {
        cardBg.clear();
        this._drawItemCard(cardBg, cx, cy, cardW, cardH, this.stats.gold >= item.cost);
      });

      this.itemCards.push({
        item, cardBg, iconTxt, nameTxt, descTxt, costTxt, hitZone, cx, cy, cardW, cardH,
      });
    });
  }

  _drawItemCard(g, cx, cy, w, h, canAfford, hover = false) {
    const fillColor = canAfford ? (hover ? 0x2a4a7a : 0x1a3a5a) : 0x1a1a2a;
    const strokeColor = canAfford ? (hover ? 0xffdd00 : 0x4488ff) : 0x333355;
    g.fillStyle(fillColor, 1);
    g.lineStyle(2, strokeColor, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 8);
  }

  _refreshItems() {
    for (const card of this.itemCards) {
      const canAfford = this.stats.gold >= card.item.cost;
      card.cardBg.clear();
      this._drawItemCard(card.cardBg, card.cx, card.cy, card.cardW, card.cardH, canAfford);
      card.nameTxt.setColor(canAfford ? '#ffffff' : '#888888');
      card.descTxt.setColor(canAfford ? '#aabbcc' : '#666666');
      card.costTxt.setColor(canAfford ? '#ffdd44' : '#888855');
      card.hitZone.setInteractive({ useHandCursor: canAfford });
    }
  }

  _buildStatsPanel() {
    const W = this.scale.width;
    const panelX = W - 220;
    const panelY = 140;
    const panelW = 200;
    const panelH = 380;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a1a2a, 0.9);
    bg.lineStyle(1, 0x336688, 1);
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);

    this.add.text(panelX + panelW / 2, panelY + 14, 'ステータス', {
      fontSize: '16px', fontStyle: 'bold', color: '#aabbcc',
    }).setOrigin(0.5, 0);

    this.statLines = [];
    const statDefs = [
      { key: 'hp',           label: 'HP' },
      { key: 'maxHp',        label: '最大HP' },
      { key: 'power',        label: '攻撃力' },
      { key: 'fireRate',     label: '攻撃速度(ms)' },
      { key: 'speed',        label: '移動速度' },
      { key: 'bulletCount',  label: '弾数' },
      { key: 'bulletSpeed',  label: '弾速' },
      { key: 'collectRange', label: '吸収範囲' },
      { key: 'pierce',       label: '貫通' },
      { key: 'shield',       label: 'シールド' },
    ];

    statDefs.forEach((def, i) => {
      const txt = this.add.text(panelX + 10, panelY + 40 + i * 32, '', {
        fontSize: '13px', color: '#ccddee',
      });
      this.statLines.push({ txt, key: def.key, label: def.label });
    });

    this._refreshStatsPanel();
  }

  _refreshStatsPanel() {
    for (const line of this.statLines) {
      let val = this.stats[line.key];
      if (typeof val === 'number') val = Math.round(val * 10) / 10;
      if (typeof val === 'boolean') val = val ? 'YES' : 'NO';
      line.txt.setText(`${line.label}: ${val}`);
    }
  }

  _makeButton(cx, cy, w, h, label, bgColor, onClick) {
    const container = this.add.container(cx, cy);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xffffff, 0.4);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

    const txt = this.add.text(0, 0, label, {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const hitZone = this.add.rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hitZone.on('pointerdown', onClick);
    hitZone.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(bgColor + 0x303030, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, 0xffffff, 0.7);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });
    hitZone.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, 0xffffff, 0.4);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });

    container.add([bg, txt, hitZone]);
    this.readyBtnContainer = container;
    return container;
  }

  _refreshReadyButton() {
    // Gray out ready button
    if (this.readyBtnContainer) {
      const bg = this.readyBtnContainer.getAt(0);
      bg.clear();
      bg.fillStyle(0x446644, 1);
      bg.fillRoundedRect(-100, -25, 200, 50, 8);
      const txt = this.readyBtnContainer.getAt(1);
      txt.setText('待機中...');
    }
  }

  _onTick() {
    this.remainingMs -= 1000;
    const sec = Math.max(0, Math.ceil(this.remainingMs / 1000));
    this.timerText.setText(`${sec}s`);
    if (sec <= 10) {
      this.timerText.setColor('#ff2222');
    }
    if (sec <= 0) {
      if (this.timerEvent) this.timerEvent.remove();
    }
  }

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];
    if (this.timerEvent) this.timerEvent.remove();
  }

  shutdown() {
    this._cleanup();
  }
}
