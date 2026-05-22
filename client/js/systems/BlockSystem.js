// BlockSystem.js - Random obstacle blocks that block movement and bullets
class BlockSystem {
  constructor(scene, worldW, worldH) {
    this.scene  = scene;
    this.worldW = worldW;
    this.worldH = worldH;
    this.blocks = [];
    this.gfx    = null;
    this._generate();
    this._draw();
  }

  _generate() {
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    const CLEAR_RADIUS = 270; // keep spawn area open
    const GRID = 40;
    const EDGE = 3; // cell margin from world border

    // [cellsWide, cellsTall] — biased toward singles
    const shapes = [
      [1,1],[1,1],[1,1],[1,1],
      [1,2],[2,1],
      [2,2],
      [1,3],[3,1],
      [3,2],[2,3],
    ];

    const gridW = Math.floor(this.worldW / GRID);
    const gridH = Math.floor(this.worldH / GRID);
    const occupied = new Set();

    const tryPlace = (shape) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const gx = EDGE + Math.floor(Math.random() * (gridW - EDGE * 2 - shape[0]));
        const gy = EDGE + Math.floor(Math.random() * (gridH - EDGE * 2 - shape[1]));

        // Clear zone around player spawn
        const bCx = gx * GRID + (shape[0] * GRID) / 2;
        const bCy = gy * GRID + (shape[1] * GRID) / 2;
        if (Math.hypot(bCx - cx, bCy - cy) < CLEAR_RADIUS) continue;

        // Require 1-cell gap between every block
        let ok = true;
        outer:
        for (let dx = -1; dx <= shape[0]; dx++) {
          for (let dy = -1; dy <= shape[1]; dy++) {
            if (occupied.has(`${gx + dx},${gy + dy}`)) { ok = false; break outer; }
          }
        }
        if (!ok) continue;

        for (let dx = 0; dx < shape[0]; dx++) {
          for (let dy = 0; dy < shape[1]; dy++) {
            occupied.add(`${gx + dx},${gy + dy}`);
          }
        }
        return { x: gx * GRID, y: gy * GRID, w: shape[0] * GRID, h: shape[1] * GRID };
      }
      return null;
    };

    for (let i = 0; this.blocks.length < 78 && i < 400; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const b = tryPlace(shape);
      if (b) this.blocks.push(b);
    }
  }

  _draw() {
    this.gfx = this.scene.add.graphics();
    this.gfx.setDepth(1);

    for (const { x, y, w, h } of this.blocks) {
      // Stone base
      this.gfx.fillStyle(0x38384e, 1);
      this.gfx.fillRect(x, y, w, h);

      // Inner face (slightly lighter)
      this.gfx.fillStyle(0x4c4c66, 1);
      this.gfx.fillRect(x + 3, y + 3, w - 6, h - 6);

      // Mortar joints between cells
      this.gfx.lineStyle(1, 0x28283c, 1);
      for (let mx = x + 40; mx < x + w; mx += 40) {
        this.gfx.lineBetween(mx, y + 3, mx, y + h - 3);
      }
      for (let my = y + 40; my < y + h; my += 40) {
        this.gfx.lineBetween(x + 3, my, x + w - 3, my);
      }

      // Top/left highlight
      this.gfx.lineStyle(2, 0x7878a8, 0.4);
      this.gfx.lineBetween(x + 1, y + 1, x + w - 2, y + 1);
      this.gfx.lineBetween(x + 1, y + 1, x + 1, y + h - 2);

      // Bottom/right shadow
      this.gfx.lineStyle(2, 0x181824, 0.9);
      this.gfx.lineBetween(x + 1, y + h - 1, x + w - 1, y + h - 1);
      this.gfx.lineBetween(x + w - 1, y + 1, x + w - 1, y + h - 1);
    }
  }

  // True if circle (cx,cy,r) overlaps any block
  circleBlocked(cx, cy, r) {
    for (const b of this.blocks) {
      const qx = Phaser.Math.Clamp(cx, b.x, b.x + b.w) - cx;
      const qy = Phaser.Math.Clamp(cy, b.y, b.y + b.h) - cy;
      if (qx * qx + qy * qy < r * r) return true;
    }
    return false;
  }

  bulletHits(bx, by, r) {
    return this.circleBlocked(bx, by, r);
  }

  destroy() {
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
}
