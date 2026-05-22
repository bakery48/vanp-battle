// main.js - Phaser 3 game initialization
const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',
  parent: document.body,
  scene: [LobbyScene, SoloScene, ShopScene, BattleScene, BestiaryScene],
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
};

// Connect to server before creating game
window.network.connect();
const game = new Phaser.Game(config);
