// TouchControls.js - Dual virtual joystick for mobile play
// Left half of screen = movement, right half = aim direction
class TouchControls {
  constructor(scene) {
    this.scene  = scene;
    this.W      = scene.scale.width;
    this.H      = scene.scale.height;
    this.RADIUS = 72;   // max displacement from base
    this.DEAD   = 14;   // dead zone radius
    this.HUD_H  = 80;   // ignore touches in top HUD strip

    // Outputs
    this.moveVec    = { x: 0, y: 0 };
    this.aimAngle   = null;
    this.moveActive = false;
    this.aimActive  = false;

    // Internal
    this._movePtr  = null;
    this._aimPtr   = null;
    this._moveBase = { x: 0, y: 0 };
    this._aimBase  = { x: 0, y: 0 };

    // Graphics (scrollFactor 0 = fixed to camera)
    this._moveBg  = scene.add.graphics().setScrollFactor(0).setDepth(990).setAlpha(0);
    this._moveKnob = scene.add.graphics().setScrollFactor(0).setDepth(991).setAlpha(0);
    this._aimBg   = scene.add.graphics().setScrollFactor(0).setDepth(990).setAlpha(0);
    this._aimKnob  = scene.add.graphics().setScrollFactor(0).setDepth(991).setAlpha(0);

    scene.input.addPointer(2); // support up to 3 simultaneous touches

    this._onDown   = (p) => this._down(p);
    this._onMove   = (p) => this._move(p);
    this._onUp     = (p) => this._up(p);
    this._onCancel = (p) => this._up(p);

    scene.input.on('pointerdown',   this._onDown);
    scene.input.on('pointermove',   this._onMove);
    scene.input.on('pointerup',     this._onUp);
    scene.input.on('pointercancel', this._onCancel);
  }

  _down(ptr) {
    if (ptr.y < this.HUD_H) return;

    if (ptr.x < this.W / 2) {
      if (this._movePtr) return;
      this._movePtr   = ptr;
      this._moveBase  = { x: ptr.x, y: ptr.y };
      this.moveActive = true;
      this._drawBg(this._moveBg, ptr.x, ptr.y, 0x4499ff);
      this._drawKnob(this._moveKnob, ptr.x, ptr.y, 0x88bbff);
      this._moveBg.setAlpha(0.65);
      this._moveKnob.setAlpha(0.85);
    } else {
      if (this._aimPtr) return;
      this._aimPtr   = ptr;
      this._aimBase  = { x: ptr.x, y: ptr.y };
      this.aimActive = true;
      this._drawBg(this._aimBg, ptr.x, ptr.y, 0xff8844);
      this._drawKnob(this._aimKnob, ptr.x, ptr.y, 0xffaa66);
      this._aimBg.setAlpha(0.65);
      this._aimKnob.setAlpha(0.85);
    }
  }

  _move(ptr) {
    if (this._movePtr && ptr === this._movePtr) {
      const dx = ptr.x - this._moveBase.x;
      const dy = ptr.y - this._moveBase.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamp = Math.min(dist, this.RADIUS);
      const knobX = this._moveBase.x + (dist > 0 ? (dx / dist) * clamp : 0);
      const knobY = this._moveBase.y + (dist > 0 ? (dy / dist) * clamp : 0);
      this.moveVec = dist > this.DEAD ? { x: dx / dist, y: dy / dist } : { x: 0, y: 0 };
      this._drawKnob(this._moveKnob, knobX, knobY, 0x88bbff);
    }

    if (this._aimPtr && ptr === this._aimPtr) {
      const dx = ptr.x - this._aimBase.x;
      const dy = ptr.y - this._aimBase.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamp = Math.min(dist, this.RADIUS);
      const knobX = this._aimBase.x + (dist > 0 ? (dx / dist) * clamp : 0);
      const knobY = this._aimBase.y + (dist > 0 ? (dy / dist) * clamp : 0);
      if (dist > this.DEAD) this.aimAngle = Math.atan2(dy, dx);
      this._drawKnob(this._aimKnob, knobX, knobY, 0xffaa66);
    }
  }

  _up(ptr) {
    if (this._movePtr && ptr === this._movePtr) {
      this._movePtr   = null;
      this.moveActive = false;
      this.moveVec    = { x: 0, y: 0 };
      this._moveBg.setAlpha(0);
      this._moveKnob.setAlpha(0);
    }
    if (this._aimPtr && ptr === this._aimPtr) {
      this._aimPtr   = null;
      this.aimActive = false;
      this.aimAngle  = null;
      this._aimBg.setAlpha(0);
      this._aimKnob.setAlpha(0);
    }
  }

  _drawBg(g, cx, cy, color) {
    g.clear();
    g.fillStyle(color, 0.12);
    g.fillCircle(cx, cy, this.RADIUS);
    g.lineStyle(2, color, 0.55);
    g.strokeCircle(cx, cy, this.RADIUS);
    g.lineStyle(1, color, 0.2);
    g.strokeCircle(cx, cy, this.RADIUS * 0.5);
  }

  _drawKnob(g, cx, cy, color) {
    g.clear();
    g.fillStyle(color, 0.65);
    g.fillCircle(cx, cy, 30);
    g.lineStyle(2, 0xffffff, 0.35);
    g.strokeCircle(cx, cy, 30);
  }

  destroy() {
    this.scene.input.off('pointerdown',   this._onDown);
    this.scene.input.off('pointermove',   this._onMove);
    this.scene.input.off('pointerup',     this._onUp);
    this.scene.input.off('pointercancel', this._onCancel);
    this._moveBg.destroy();
    this._moveKnob.destroy();
    this._aimBg.destroy();
    this._aimKnob.destroy();
  }
}
