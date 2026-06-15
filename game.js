// ── Constants ─────────────────────────────────────────────────────────────────
const BALL_R     = 10;
const TARG_R     = 13;
const NUM_T      = 22;
const MAX_SHOTS  = 3;
const MARGIN     = 32;
const ELASTICITY = 0.78;
const FRICTION   = 0.9875;
const MAX_DRAG   = 90;
const MAX_SPEED  = 25.5;

const TIERS = {
  1: { fill: '#fbbf24', glow: 'rgba(251,191,36,.55)'  },
  2: { fill: '#f97316', glow: 'rgba(249,115,22,.55)'  },
  3: { fill: '#ef4444', glow: 'rgba(239,68,68,.55)'   },
};

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Day number since launch epoch (2026-06-15)
export function dayNumber() {
  const epoch = new Date('2026-06-15');
  const now   = new Date();
  return Math.floor((now - epoch) / 86400000) + 1;
}

// ── Game class ────────────────────────────────────────────────────────────────
export class Game {
  constructor(canvas, { onScoreChange, onShotEnd, onGameEnd }) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.onScoreChange = onScoreChange;
    this.onShotEnd     = onShotEnd;
    this.onGameEnd     = onGameEnd;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();

    this.frameCount   = 0;
    this.targets      = [];
    this.maxScore     = 0;
    this.totalScore   = 0;
    this.shotNum      = 0;
    this.ballMoving   = false;
    this.hasShot      = false;
    this.transitioning = false;
    this.isDragging   = false;
    this.dragStart    = null;
    this.dragCurrent  = null;
    this.ball         = { x: 0, y: 0, vx: 0, vy: 0 };
  }

  // ── Setup ──────────────────────────────────────────────────────────────────
  _resize() {
    const W = Math.min(560, window.innerWidth - 32);
    const H = Math.round(W * 0.68);
    this.canvas.width  = W;
    this.canvas.height = H;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this.W = W;
    this.H = H;
  }

  init() {
    const seed = dailySeed();
    const rand = mulberry32(seed);
    const { W, H } = this;

    const maxDist      = Math.hypot(W / 2 - MARGIN, H / 2 - MARGIN);
    const tierThresh   = [maxDist * 0.42, maxDist * 0.70];

    const getTier = (tx, ty) => {
      const d = Math.hypot(tx - W / 2, ty - H / 2);
      if (d < tierThresh[0]) return 1;
      if (d < tierThresh[1]) return 2;
      return 3;
    };

    this.targets   = [];
    this.maxScore  = 0;
    this.totalScore = 0;
    this.shotNum   = 0;

    for (let i = 0; i < NUM_T; i++) {
      let best = null, bestMin = -1;
      for (let a = 0; a < 16; a++) {
        const tx = MARGIN + rand() * (W - MARGIN * 2);
        const ty = MARGIN + rand() * (H - MARGIN * 2);
        if (Math.hypot(tx - W / 2, ty - H / 2) < 65) continue;
        let minD = 9999;
        for (const t of this.targets) minD = Math.min(minD, Math.hypot(tx - t.x, ty - t.y));
        minD = Math.min(minD, Math.hypot(tx - W / 2, ty - H / 2));
        if (minD > bestMin) { bestMin = minD; best = { x: tx, y: ty }; }
      }
      if (best) {
        const tier = getTier(best.x, best.y);
        this.maxScore += tier;
        const a1 = ((best.x * 73 + best.y * 31) % 628) / 100;
        this.targets.push({
          x: best.x, y: best.y, r: TARG_R, tier,
          hit: false, flash: 0,
          pulse: rand() * Math.PI * 2,
          cracks: [a1, a1 + 2.1 + ((best.x * 17) % 10) / 10, a1 - 1.4 - ((best.y * 11) % 8) / 10],
        });
      }
    }

    this._resetShot();
    this._loop();
  }

  _resetShot() {
    const { W, H } = this;
    this.ball        = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.ballMoving  = false;
    this.hasShot     = false;
    this.transitioning = false;
    this.isDragging  = false;
    this.dragStart   = null;
    this.dragCurrent = null;
  }

  remaining() {
    return this.targets.filter(t => !t.hit).length;
  }

  // ── Physics ────────────────────────────────────────────────────────────────
  _update() {
    if (!this.ballMoving) return;
    const { W, H } = this;

    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;
    this.ball.vx *= FRICTION;
    this.ball.vy *= FRICTION;

    if (this.ball.x - BALL_R < 0)  { this.ball.x = BALL_R;   this.ball.vx =  Math.abs(this.ball.vx) * ELASTICITY; }
    if (this.ball.x + BALL_R > W)  { this.ball.x = W - BALL_R; this.ball.vx = -Math.abs(this.ball.vx) * ELASTICITY; }
    if (this.ball.y - BALL_R < 0)  { this.ball.y = BALL_R;   this.ball.vy =  Math.abs(this.ball.vy) * ELASTICITY; }
    if (this.ball.y + BALL_R > H)  { this.ball.y = H - BALL_R; this.ball.vy = -Math.abs(this.ball.vy) * ELASTICITY; }

    for (const t of this.targets) {
      const dx   = this.ball.x - t.x;
      const dy   = this.ball.y - t.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_R + t.r && dist > 0) {
        if (!t.hit) {
          t.hit   = true;
          t.flash = 1;
          this.totalScore += t.tier;
          this.onScoreChange(this.totalScore, this.remaining());
        }
        const nx = dx / dist, ny = dy / dist;
        this.ball.x += nx * (BALL_R + t.r - dist);
        this.ball.y += ny * (BALL_R + t.r - dist);
        const dot = this.ball.vx * nx + this.ball.vy * ny;
        if (dot < 0) {
          this.ball.vx -= (1 + ELASTICITY) * dot * nx;
          this.ball.vy -= (1 + ELASTICITY) * dot * ny;
        }
      }
    }

    if (Math.hypot(this.ball.vx, this.ball.vy) < 0.22) {
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ballMoving = false;
      this._endShot();
    }
  }

  _endShot() {
    const isLast = this.shotNum >= MAX_SHOTS - 1 || this.remaining() === 0;
    if (isLast) {
      this.onGameEnd(this.totalScore, this.maxScore);
    } else {
      this.transitioning = true;
      this.onShotEnd(this.shotNum + 1, this.remaining());
      setTimeout(() => {
        this.shotNum++;
        this._resetShot();
      }, 1600);
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const { ctx, W, H, ball, targets, frameCount, isDragging, hasShot, transitioning } = this;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let gx = 40; gx < W; gx += 40)
      for (let gy = 30; gy < H; gy += 30) {
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill();
      }
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Aim arrow
    if (isDragging && !hasShot) {
      const aim = this._getAim();
      if (aim) {
        const ex    = ball.x + aim.vx / MAX_SPEED * MAX_DRAG;
        const ey    = ball.y + aim.vy / MAX_SPEED * MAX_DRAG;
        const angle = Math.atan2(ey - ball.y, ex - ball.x);
        const r     = Math.round(aim.pct * 240);
        const g     = Math.round((1 - aim.pct) * 200 + 40);
        ctx.save();
        ctx.strokeStyle = `rgba(${r},${g},40,.85)`;
        ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = `rgba(${r},${g},40,.9)`;
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 11 * Math.cos(angle - .38), ey - 11 * Math.sin(angle - .38));
        ctx.lineTo(ex - 11 * Math.cos(angle + .38), ey - 11 * Math.sin(angle + .38));
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }

    // Targets
    for (const t of targets) {
      if (t.flash > 0) t.flash -= 0.045;
      const tc = TIERS[t.tier];

      if (!t.hit) {
        const p = 0.5 + 0.5 * Math.sin(frameCount * 0.04 + t.pulse);
        ctx.save();
        ctx.shadowBlur = 6 + p * 8; ctx.shadowColor = tc.glow;
        ctx.fillStyle  = tc.fill;
        ctx.globalAlpha = 0.75 + p * 0.25;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(t.x - t.r * .28, t.y - t.r * .3, t.r * .38, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(t.tier, t.x, t.y + .5);
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(t.tier, t.x, t.y);
        ctx.restore();
      } else if (t.flash > 0) {
        const extra = t.flash * 10;
        ctx.save();
        ctx.shadowBlur = 18 + t.flash * 20; ctx.shadowColor = tc.fill;
        ctx.fillStyle  = tc.fill; ctx.globalAlpha = t.flash * 0.9;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r + extra, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 1 - t.flash;
        this._drawStone(t); ctx.restore();
      } else {
        this._drawStone(t);
      }
    }

    // Ball
    ctx.save();
    ctx.shadowBlur   = this.ballMoving ? 20 : (isDragging ? 14 : 8);
    ctx.shadowColor  = 'rgba(255,255,255,.7)';
    const gr = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#c7d2fe');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (hasShot && !this.ballMoving && !transitioning) {
      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,.3)';
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R + 6 + 3 * Math.sin(frameCount * .08), 0, Math.PI * 2);
      ctx.stroke(); ctx.restore();
    }
  }

  _drawStone(t) {
    const { ctx } = this;
    ctx.save();
    const sg = ctx.createRadialGradient(t.x - 3, t.y - 4, 1, t.x, t.y, t.r);
    sg.addColorStop(0, '#78909c'); sg.addColorStop(1, '#2d3e50');
    ctx.fillStyle   = sg;
    ctx.shadowBlur  = 4; ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#546e7a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (const angle of t.cracks) {
      const len = t.r * (0.5 + Math.abs(Math.sin(angle)) * 0.4);
      ctx.beginPath();
      ctx.moveTo(t.x + Math.cos(angle) * 2, t.y + Math.sin(angle) * 2);
      ctx.lineTo(t.x + Math.cos(angle) * len, t.y + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  _bindInput() {
    const c = this.canvas;
    c.addEventListener('mousedown',  e => this._onStart(e));
    c.addEventListener('mousemove',  e => this._onMove(e));
    c.addEventListener('mouseup',    e => this._onEnd(e));
    c.addEventListener('touchstart', e => this._onStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._onMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._onEnd(e),   { passive: false });
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx   = this.W / rect.width;
    const sy   = this.H / rect.height;
    const src  = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  _onStart(e) {
    e.preventDefault();
    if (this.hasShot || this.ballMoving || this.transitioning) return;
    const pos = this._pos(e);
    if (Math.hypot(pos.x - this.ball.x, pos.y - this.ball.y) < 48) {
      this.isDragging  = true;
      this.dragStart   = { x: this.ball.x, y: this.ball.y };
      this.dragCurrent = { ...pos };
    }
  }

  _onMove(e) {
    e.preventDefault();
    if (this.isDragging) this.dragCurrent = this._pos(e);
  }

  _onEnd(e) {
    e.preventDefault();
    if (!this.isDragging) return;
    this.isDragging = false;
    const aim = this._getAim();
    if (aim && !this.hasShot) {
      this.ball.vx  = aim.vx;
      this.ball.vy  = aim.vy;
      this.ballMoving = true;
      this.hasShot    = true;
    }
    this.dragStart   = null;
    this.dragCurrent = null;
  }

  _getAim() {
    if (!this.dragStart || !this.dragCurrent) return null;
    const dx   = this.dragCurrent.x - this.dragStart.x;
    const dy   = this.dragCurrent.y - this.dragStart.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return null;
    const pct = Math.min(dist, MAX_DRAG) / MAX_DRAG;
    return { vx: dx / dist * pct * MAX_SPEED, vy: dy / dist * pct * MAX_SPEED, pct };
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  _loop() {
    this.frameCount++;
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  get shotIndex() { return this.shotNum; }
}
