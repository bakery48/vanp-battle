// LobbyScene.js - Lobby UI for creating/joining rooms
class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
    this.uiContainer = null;
    this.playerListText = null;
    this.roundsText = null;
    this.statusText = null;
    this.startBtn = null;
    this.errorText = null;
    this._handlers = [];
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
    bg.fillRect(0, 0, W, H);

    // Title
    this.add.text(W / 2, 60, 'VANP BATTLE', {
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#f0c040',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, 110, 'Vampire Survivors × Battle Royale', {
      fontSize: '18px',
      color: '#aabbcc',
    }).setOrigin(0.5);

    // Show state
    if (window.network.roomCode) {
      this._showLobbyRoom();
    } else {
      this._showNameEntry();
    }

    // Network events
    this._addHandler('room_created', (data) => {
      window.network.myId = data.player.id;
      window.network.roomCode = data.roomCode;
      window.network.hostId = data.hostId;
      window.network.totalRounds = data.totalRounds;
      window.network.players = data.players;
      window.network.myPlayer = data.player;
      this._showLobbyRoom();
    });

    this._addHandler('room_joined', (data) => {
      window.network.myId = data.player.id;
      window.network.roomCode = data.roomCode;
      window.network.hostId = data.hostId;
      window.network.totalRounds = data.totalRounds;
      window.network.players = data.players;
      window.network.myPlayer = data.player;
      this._showLobbyRoom();
    });

    this._addHandler('join_error', (data) => {
      this._showError(data.message);
    });

    this._addHandler('player_join', (data) => {
      window.network.players = data.players;
      window.network.hostId = data.hostId;
      this._updatePlayerList();
    });

    this._addHandler('player_leave', (data) => {
      window.network.players = data.players;
      window.network.hostId = data.hostId;
      this._updatePlayerList();
    });

    this._addHandler('rounds_updated', (data) => {
      window.network.totalRounds = data.totalRounds;
      if (this.roundsText) {
        this.roundsText.setText(`ラウンド数: ${data.totalRounds}`);
      }
    });

    this._addHandler('phase_change', (data) => {
      if (data.phase === 'solo') {
        this._cleanup();
        this.scene.start('SoloScene', {
          round: data.round,
          totalRounds: data.totalRounds,
          duration: data.duration,
        });
      }
    });

    this._addHandler('connected', () => {});
    this._addHandler('disconnected', () => {
      this._showError('サーバーとの接続が切れました');
    });
  }

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];
    if (this.uiContainer) this.uiContainer.destroy(true);
  }

  _clearUI() {
    if (this.uiContainer) this.uiContainer.destroy(true);
    this.uiContainer = this.add.container(0, 0);
    this.playerListText = null;
    this.roundsText = null;
    this.startBtn = null;
    this.errorText = null;
  }

  _showNameEntry() {
    this._clearUI();
    const W = this.scale.width;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(0x0f3460, 0.9);
    panel.strokeStyle(0x4488ff, 1);
    panel.lineWidth = 2;
    panel.fillRoundedRect(W / 2 - 280, 160, 560, 380, 12);
    panel.strokeRoundedRect(W / 2 - 280, 160, 560, 380, 12);
    this.uiContainer.add(panel);

    // Name input label
    const nameLbl = this.add.text(W / 2, 200, 'プレイヤー名', {
      fontSize: '20px', color: '#aabbcc'
    }).setOrigin(0.5);
    this.uiContainer.add(nameLbl);

    // Name input DOM
    const nameEl = document.createElement('input');
    nameEl.type = 'text';
    nameEl.placeholder = 'Player1';
    nameEl.maxLength = 12;
    nameEl.value = localStorage.getItem('vanp_name') || '';
    Object.assign(nameEl.style, {
      position: 'absolute',
      left: `${W / 2 - 150}px`,
      top: '230px',
      width: '300px',
      padding: '8px 12px',
      fontSize: '18px',
      background: '#1a2a4a',
      color: '#ffffff',
      border: '2px solid #4488ff',
      borderRadius: '6px',
      outline: 'none',
    });
    document.body.appendChild(nameEl);
    this.uiContainer.once('destroy', () => nameEl.remove());

    // Room code input label
    const codeLbl = this.add.text(W / 2, 300, 'ルームコード（参加する場合）', {
      fontSize: '16px', color: '#aabbcc'
    }).setOrigin(0.5);
    this.uiContainer.add(codeLbl);

    const codeEl = document.createElement('input');
    codeEl.type = 'text';
    codeEl.placeholder = 'XXXX';
    codeEl.maxLength = 4;
    Object.assign(codeEl.style, {
      position: 'absolute',
      left: `${W / 2 - 100}px`,
      top: '325px',
      width: '200px',
      padding: '8px 12px',
      fontSize: '18px',
      background: '#1a2a4a',
      color: '#ffff88',
      border: '2px solid #aabbcc',
      borderRadius: '6px',
      outline: 'none',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: '4px',
    });
    document.body.appendChild(codeEl);
    this.uiContainer.once('destroy', () => codeEl.remove());

    // Create room button
    const createBtn = this._makeButton(W / 2 - 130, 400, 220, 50, 'ルームを作成', 0x2255aa, () => {
      const name = nameEl.value.trim() || 'Player';
      localStorage.setItem('vanp_name', name);
      window.network.createRoom(name, window.network.totalRounds || 3);
    });
    this.uiContainer.add(createBtn);

    // Join room button
    const joinBtn = this._makeButton(W / 2 + 110, 400, 180, 50, '参加する', 0x22aa55, () => {
      const code = codeEl.value.trim().toUpperCase();
      if (code.length !== 4) {
        this._showError('4文字のルームコードを入力してください');
        return;
      }
      const name = nameEl.value.trim() || 'Player';
      localStorage.setItem('vanp_name', name);
      window.network.joinRoom(code, name);
    });
    this.uiContainer.add(joinBtn);

    const errTxt = this.add.text(W / 2, 470, '', {
      fontSize: '16px', color: '#ff6666'
    }).setOrigin(0.5);
    this.uiContainer.add(errTxt);
    this.errorText = errTxt;
  }

  _showLobbyRoom() {
    this._clearUI();
    const W = this.scale.width;
    const H = this.scale.height;

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0x0f3460, 0.9);
    panel.strokeStyle(0x4488ff, 1);
    panel.lineWidth = 2;
    panel.fillRoundedRect(W / 2 - 320, 140, 640, 500, 12);
    panel.strokeRoundedRect(W / 2 - 320, 140, 640, 500, 12);
    this.uiContainer.add(panel);

    // Room code display
    const codeDisplay = this.add.text(W / 2, 175, `ルームコード: ${window.network.roomCode}`, {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#f0c040',
    }).setOrigin(0.5);
    this.uiContainer.add(codeDisplay);

    // Player list
    const listLbl = this.add.text(W / 2, 215, 'プレイヤー', {
      fontSize: '18px', color: '#aabbcc'
    }).setOrigin(0.5);
    this.uiContainer.add(listLbl);

    // Player list text (dynamic)
    const playerList = this.add.text(W / 2, 280, '', {
      fontSize: '18px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5);
    this.uiContainer.add(playerList);
    this.playerListText = playerList;
    this._updatePlayerList();

    // Rounds config (host only)
    if (window.network.isHost()) {
      const roundsLbl = this.add.text(W / 2 - 100, 440, 'ラウンド数:', {
        fontSize: '18px', color: '#aabbcc'
      }).setOrigin(0, 0.5);
      this.uiContainer.add(roundsLbl);

      const roundsTxt = this.add.text(W / 2 + 20, 440, `${window.network.totalRounds}`, {
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f0c040',
      }).setOrigin(0.5);
      this.uiContainer.add(roundsTxt);
      this.roundsText = roundsTxt;

      // Minus button
      const minusBtn = this._makeButton(W / 2 - 40, 440, 50, 36, '-', 0x553322, () => {
        const r = Math.max(1, window.network.totalRounds - 1);
        window.network.setRounds(r);
        window.network.totalRounds = r;
        roundsTxt.setText(`${r}`);
      });
      this.uiContainer.add(minusBtn);

      // Plus button
      const plusBtn = this._makeButton(W / 2 + 70, 440, 50, 36, '+', 0x335522, () => {
        const r = Math.min(5, window.network.totalRounds + 1);
        window.network.setRounds(r);
        window.network.totalRounds = r;
        roundsTxt.setText(`${r}`);
      });
      this.uiContainer.add(plusBtn);

      // Start button
      const startBtn = this._makeButton(W / 2, 510, 240, 56, 'ゲームスタート', 0xcc3300, () => {
        window.network.startGame();
      });
      this.uiContainer.add(startBtn);
    } else {
      const waitTxt = this.add.text(W / 2, 480, 'ホストのゲーム開始を待っています...', {
        fontSize: '18px', color: '#aabbcc'
      }).setOrigin(0.5);
      this.uiContainer.add(waitTxt);

      if (this.roundsText === null) {
        const roundsTxt = this.add.text(W / 2, 440, `ラウンド数: ${window.network.totalRounds}`, {
          fontSize: '18px', color: '#aabbcc'
        }).setOrigin(0.5);
        this.uiContainer.add(roundsTxt);
        this.roundsText = roundsTxt;
      }
    }

    const errTxt = this.add.text(W / 2, 570, '', {
      fontSize: '16px', color: '#ff6666'
    }).setOrigin(0.5);
    this.uiContainer.add(errTxt);
    this.errorText = errTxt;
  }

  _updatePlayerList() {
    if (!this.playerListText) return;
    const colors = ['#ff6666', '#6699ff', '#66cc66', '#ffee55', '#cc88ff', '#ff9944', '#55dddd', '#ff99cc'];
    const lines = (window.network.players || []).map(p => {
      const colorHex = colors[p.colorIndex % colors.length];
      const hostMark = p.id === window.network.hostId ? ' [HOST]' : '';
      const meMark = p.id === window.network.myId ? ' ←' : '';
      return `[color=${colorHex}]■[/color] ${p.name}${hostMark}${meMark}`;
    });
    this.playerListText.setText(lines.join('\n'));
  }

  _showError(msg) {
    if (this.errorText) {
      this.errorText.setText(msg);
      this.time.delayedCall(4000, () => {
        if (this.errorText) this.errorText.setText('');
      });
    }
  }

  _makeButton(cx, cy, w, h, label, bgColor, onClick) {
    const container = this.add.container(cx, cy);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xffffff, 0.3);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);

    const txt = this.add.text(0, 0, label, {
      fontSize: Math.min(20, Math.floor(h * 0.5)) + 'px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const hitArea = this.add.rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(bgColor + 0x303030, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, 0xffffff, 0.6);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });
    hitArea.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(bgColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, 0xffffff, 0.3);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    });
    hitArea.on('pointerdown', onClick);

    container.add([bg, txt, hitArea]);
    return container;
  }

  shutdown() {
    // Remove DOM inputs if any remain
    document.querySelectorAll('input').forEach(el => el.remove());
  }
}
