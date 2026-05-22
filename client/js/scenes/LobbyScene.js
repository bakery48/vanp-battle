class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
    this.uiContainer = null;
    this.playerListText = null;
    this.roundsText = null;
    this.cpuText = null;
    this.cpuSection = null;
    this.errorText = null;
    this._handlers = [];
    this._domInputs = [];
    this._cpuCount = 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
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
      // Rebuild room UI so CPU section visibility updates
      if (window.network.roomCode) this._showLobbyRoom();
    });

    this._addHandler('player_leave', (data) => {
      window.network.players = data.players;
      window.network.hostId = data.hostId;
      if (window.network.roomCode) this._showLobbyRoom();
    });

    this._addHandler('rounds_updated', (data) => {
      window.network.totalRounds = data.totalRounds;
      if (this.roundsText) this.roundsText.setText(`${data.totalRounds}`);
    });

    this._addHandler('cpu_count_updated', (data) => {
      this._cpuCount = data.cpuCount;
      if (this.cpuText) this.cpuText.setText(`${this._cpuCount}`);
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

    this._addHandler('disconnected', () => {
      this._showError('サーバーとの接続が切れました');
    });
  }

  // --- Canvas offset helper for DOM element positioning ---
  _canvasOffset() {
    const canvas = this.sys.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }

  _addDomInput(el) {
    document.body.appendChild(el);
    this._domInputs.push(el);
  }

  _removeDomInputs() {
    this._domInputs.forEach(el => { try { el.remove(); } catch(e) {} });
    this._domInputs = [];
  }

  _addHandler(event, fn) {
    window.network.on(event, fn);
    this._handlers.push({ event, fn });
  }

  _cleanup() {
    this._handlers.forEach(({ event, fn }) => window.network.off(event, fn));
    this._handlers = [];
    this._removeDomInputs();
    if (this.uiContainer) { this.uiContainer.destroy(true); this.uiContainer = null; }
  }

  _clearUI() {
    this._removeDomInputs();
    if (this.uiContainer) { this.uiContainer.destroy(true); }
    this.uiContainer = this.add.container(0, 0);
    this.playerListText = null;
    this.roundsText = null;
    this.errorText = null;
  }

  _panel(graphics, x, y, w, h) {
    graphics.fillStyle(0x0f3460, 0.95);
    graphics.fillRoundedRect(x, y, w, h, 12);
    graphics.lineStyle(2, 0x4488ff, 1);
    graphics.strokeRoundedRect(x, y, w, h, 12);
  }

  _showNameEntry() {
    this._clearUI();
    const W = this.scale.width;
    const offset = this._canvasOffset();

    const panel = this.add.graphics();
    this._panel(panel, W / 2 - 280, 155, 560, 390);
    this.uiContainer.add(panel);

    const nameLbl = this.add.text(W / 2, 195, 'プレイヤー名', {
      fontSize: '20px', color: '#aabbcc',
    }).setOrigin(0.5);
    this.uiContainer.add(nameLbl);

    // DOM: name input
    const nameEl = document.createElement('input');
    nameEl.type = 'text';
    nameEl.placeholder = 'Player1';
    nameEl.maxLength = 12;
    nameEl.value = localStorage.getItem('vanp_name') || '';
    Object.assign(nameEl.style, {
      position: 'fixed',
      left: `${offset.left + W / 2 - 150}px`,
      top:  `${offset.top + 220}px`,
      width: '300px',
      padding: '8px 12px',
      fontSize: '18px',
      background: '#1a2a4a',
      color: '#ffffff',
      border: '2px solid #4488ff',
      borderRadius: '6px',
      outline: 'none',
      zIndex: '10',
    });
    this._addDomInput(nameEl);

    const codeLbl = this.add.text(W / 2, 290, 'ルームコード（参加する場合）', {
      fontSize: '16px', color: '#aabbcc',
    }).setOrigin(0.5);
    this.uiContainer.add(codeLbl);

    // DOM: room code input
    const codeEl = document.createElement('input');
    codeEl.type = 'text';
    codeEl.placeholder = 'XXXX';
    codeEl.maxLength = 4;
    Object.assign(codeEl.style, {
      position: 'fixed',
      left:  `${offset.left + W / 2 - 80}px`,
      top:   `${offset.top + 312}px`,
      width: '160px',
      padding: '8px 12px',
      fontSize: '20px',
      background: '#1a2a4a',
      color: '#ffff88',
      border: '2px solid #aabbcc',
      borderRadius: '6px',
      outline: 'none',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: '6px',
      zIndex: '10',
    });
    this._addDomInput(codeEl);

    const createBtn = this._makeButton(W / 2 - 110, 400, 190, 48, 'ルームを作成', 0x2255aa, () => {
      const name = nameEl.value.trim() || 'Player';
      localStorage.setItem('vanp_name', name);
      window.network.createRoom(name, window.network.totalRounds || 3);
    });
    this.uiContainer.add(createBtn);

    const joinBtn = this._makeButton(W / 2 + 110, 400, 170, 48, '参加する', 0x22aa55, () => {
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

    const errTxt = this.add.text(W / 2, 468, '', {
      fontSize: '15px', color: '#ff6666',
    }).setOrigin(0.5);
    this.uiContainer.add(errTxt);
    this.errorText = errTxt;
  }

  _showLobbyRoom() {
    this._clearUI();
    const W = this.scale.width;

    const panel = this.add.graphics();
    this._panel(panel, W / 2 - 320, 140, 640, 500);
    this.uiContainer.add(panel);

    const codeDisplay = this.add.text(W / 2, 175, `ルームコード: ${window.network.roomCode}`, {
      fontSize: '28px', fontStyle: 'bold', color: '#f0c040',
    }).setOrigin(0.5);
    this.uiContainer.add(codeDisplay);

    this.add.text(W / 2, 215, 'プレイヤー', {
      fontSize: '18px', color: '#aabbcc',
    }).setOrigin(0.5);

    const playerList = this.add.text(W / 2, 340, '', {
      fontSize: '18px', color: '#ffffff', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    this.uiContainer.add(playerList);
    this.playerListText = playerList;
    this._updatePlayerList();

    if (window.network.isHost()) {
      // ── ラウンド数 ──
      const roundsLbl = this.add.text(W / 2 - 110, 420, 'ラウンド数:', {
        fontSize: '18px', color: '#aabbcc',
      }).setOrigin(0, 0.5);
      this.uiContainer.add(roundsLbl);

      const roundsTxt = this.add.text(W / 2 + 30, 420, `${window.network.totalRounds}`, {
        fontSize: '24px', fontStyle: 'bold', color: '#f0c040',
      }).setOrigin(0.5);
      this.uiContainer.add(roundsTxt);
      this.roundsText = roundsTxt;

      const minusRounds = this._makeButton(W / 2 - 30, 420, 44, 34, '-', 0x553322, () => {
        const r = Math.max(1, window.network.totalRounds - 1);
        window.network.setRounds(r);
        window.network.totalRounds = r;
        roundsTxt.setText(`${r}`);
      });
      this.uiContainer.add(minusRounds);

      const plusRounds = this._makeButton(W / 2 + 80, 420, 44, 34, '+', 0x335522, () => {
        const r = Math.min(5, window.network.totalRounds + 1);
        window.network.setRounds(r);
        window.network.totalRounds = r;
        roundsTxt.setText(`${r}`);
      });
      this.uiContainer.add(plusRounds);

      // ── CPU人数（1人プレイ時のみ表示）──
      const players = window.network.players || [];
      if (players.length === 1) {
        const cpuLbl = this.add.text(W / 2 - 110, 465, 'CPU人数:', {
          fontSize: '18px', color: '#ffaa44',
        }).setOrigin(0, 0.5);
        this.uiContainer.add(cpuLbl);

        const cpuTxt = this.add.text(W / 2 + 30, 465, `${this._cpuCount}`, {
          fontSize: '24px', fontStyle: 'bold', color: '#ffaa44',
        }).setOrigin(0.5);
        this.uiContainer.add(cpuTxt);
        this.cpuText = cpuTxt;

        const minusCpu = this._makeButton(W / 2 - 30, 465, 44, 34, '-', 0x553322, () => {
          const c = Math.max(0, this._cpuCount - 1);
          window.network.setCpuCount(c);
          this._cpuCount = c;
          cpuTxt.setText(`${c}`);
        });
        this.uiContainer.add(minusCpu);

        const plusCpu = this._makeButton(W / 2 + 80, 465, 44, 34, '+', 0x335522, () => {
          const c = Math.min(7, this._cpuCount + 1);
          window.network.setCpuCount(c);
          this._cpuCount = c;
          cpuTxt.setText(`${c}`);
        });
        this.uiContainer.add(plusCpu);
      }

      const startBtn = this._makeButton(W / 2, 530, 240, 54, 'ゲームスタート', 0xcc3300, () => {
        window.network.startGame();
      });
      this.uiContainer.add(startBtn);
    } else {
      const roundsTxt = this.add.text(W / 2, 450, `ラウンド数: ${window.network.totalRounds}`, {
        fontSize: '18px', color: '#aabbcc',
      }).setOrigin(0.5);
      this.uiContainer.add(roundsTxt);
      this.roundsText = roundsTxt;

      const waitTxt = this.add.text(W / 2, 500, 'ホストのゲーム開始を待っています...', {
        fontSize: '17px', color: '#aabbcc',
      }).setOrigin(0.5);
      this.uiContainer.add(waitTxt);
    }

    const errTxt = this.add.text(W / 2, 575, '', {
      fontSize: '15px', color: '#ff6666',
    }).setOrigin(0.5);
    this.uiContainer.add(errTxt);
    this.errorText = errTxt;
  }

  _updatePlayerList() {
    if (!this.playerListText) return;
    const colorNames = ['■(赤)', '■(青)', '■(緑)', '■(黄)', '■(紫)', '■(橙)', '■(水)', '■(桃)'];
    const lines = (window.network.players || []).map((p, i) => {
      const marker = colorNames[p.colorIndex % colorNames.length] || '■';
      const hostMark = p.id === window.network.hostId ? ' [HOST]' : '';
      const meMark   = p.id === window.network.myId   ? ' ←'     : '';
      return `${marker} ${p.name}${hostMark}${meMark}`;
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
      fontSize: Math.min(20, Math.floor(h * 0.48)) + 'px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    const redraw = (hover) => {
      bg.clear();
      bg.fillStyle(hover ? bgColor + 0x202020 : bgColor, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, 0xffffff, hover ? 0.7 : 0.3);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    };

    hit.on('pointerover',  () => redraw(true));
    hit.on('pointerout',   () => redraw(false));
    hit.on('pointerdown',  onClick);

    container.add([bg, txt, hit]);
    return container;
  }

  shutdown() {
    this._cleanup();
  }
}
