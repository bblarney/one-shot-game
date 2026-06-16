const TARG_R         = 13;
const SPARK_R        = 9;
const NUM_T          = 22;
const MAX_SPARKS     = 3;
const MARGIN         = 32;
const SPARK_CHAIN_R  = 88;
const TARGET_CHAIN_R = 74;
const CHAIN_DELAY    = 680; // ms between BFS levels

const TIERS = {
  1: { fill: '#fbbf24', glow: 'rgba(251,191,36,.55)' },
  2: { fill: '#f97316', glow: 'rgba(249,115,22,.55)' },
  3: { fill: '#ef4444', glow: 'rgba(239,68,68,.55)'  },
};

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

export function dayNumber() {
  const epoch = new Date('2026-06-15');
  const now   = new Date();
  return Math.floor((now - epoch) / 86400000) + 1;
}

export class Game {
  constructor(canvas, { onScoreChange, onSparksChanged, onGameEnd }) {
    this.canvas          = canvas;
    this.ctx             = canvas.getContext('2d');
    this.onScoreChange   = onScoreChange;
    this.onSparksChanged = onSparksChanged;
    this.onGameEnd       = onGameEnd;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();

    this.frameCount  = 0;
    this.targets     = [];
    this.maxScore    = 0;
    this.totalScore  = 0;
    this.sparks      = [];        // { x, y, flash }
    this.phase       = 'placing'; // 'placing' | 'firing' | 'done'
    this.dragIndex   = null;
    this.dragOffset  = { x: 0, y: 0 };
    this.rings       = [];        // expanding chain-radius rings
    this.floaters    = [];        // score pop-ups
  }

  _resize() {
    const W = Math.min(560, window.innerWidth - 32);
    const H = Math.round(W * 0.68);
    this.canvas.width        = W;
    this.canvas.height       = H;
    this.canvas.style.width  = W + 'px';
    this.canvas.style.height = H + 'px';
    this.W = W;
    this.H = H;
  }

  init() {
    const seed = dailySeed();
    const rand = mulberry32(seed);
    const { W, H } = this;

    const maxDist    = Math.hypot(W / 2 - MARGIN, H / 2 - MARGIN);
    const tierThresh = [maxDist * 0.42, maxDist * 0.70];

    const getTier = (tx, ty) => {
      const d = Math.hypot(tx - W / 2, ty - H / 2);
      if (d < tierThresh[0]) return 1;
      if (d < tierThresh[1]) return 2;
      return 3;
    };

    this.targets     = [];
    this.maxScore    = 0;
    this.totalScore  = 0;
    this.sparks      = [];
    this.phase       = 'placing';
    this.rings       = [];
    this.floaters    = [];

    for (let i = 0; i < NUM_T; i++) {
      let best = null, bestMin = -1;
      for (let a = 0; a < 16; a++) {
        const tx = MARGIN + rand() * (W - MARGIN * 2);
        const ty = MARGIN + rand() * (H - MARGIN * 2);
        let minD = 9999;
        for (const t of this.targets) minD = Math.min(minD, Math.hypot(tx - t.x, ty - t.y));
        if (minD > bestMin) { bestMin = minD; best = { x: tx, y: ty }; }
      }
      if (best) {
        const tier = getTier(best.x, best.y);
        this.maxScore += tier;
        const a1 = ((best.x * 73 + best.y * 31) % 628) / 100;
        this.targets.push({
          x: best.x, y: best.y, r: TARG_R, tier,
          hit: false, flash: 0, popScale: 1,
          pulse: rand() * Math.PI * 2,
          cracks: [a1, a1 + 2.1 + ((best.x * 17) % 10) / 10, a1 - 1.4 - ((best.y * 11) % 8) / 10],
        });
      }
    }

    this._loop();
  }

  resetSparks() {
    if (this.phase !== 'placing') return;
    this.sparks = [];
    this.onSparksChanged(0, MAX_SPARKS);
  }

  canFire() {
    return this.phase === 'placing' && this.sparks.length === MAX_SPARKS;
  }

  fire() {
    if (!this.canFire()) return;
    this.phase = 'firing';

    for (const s of this.sparks) s.flash = 1;

    const firstLevel = this.sparks.map(s => ({
      x: s.x, y: s.y,
      chainR: SPARK_CHAIN_R,
      ringColor: 'rgba(253,230,138,0.65)',
    }));

    setTimeout(() => this._processLevel(firstLevel), 180);
  }

  _processLevel(level) {
    if (level.length === 0) {
      this.phase = 'done';
      setTimeout(() => this.onGameEnd(this.totalScore, this.maxScore), 700);
      return;
    }

    const nextLevel = [];

    for (const item of level) {
      this.rings.push({
        x: item.x, y: item.y,
        r: item.chainR * 0.08,
        maxR: item.chainR,
        alpha: 0.65,
        color: item.ringColor,
      });

      for (const t of this.targets) {
        if (t.hit) continue;
        if (Math.hypot(t.x - item.x, t.y - item.y) <= item.chainR) {
          t.hit      = true;
          t.flash    = 1;
          t.popScale = 2.4;
          this.totalScore += t.tier;
          this.onScoreChange(this.totalScore, this.remaining());
          this.floaters.push({
            x: t.x, y: t.y - TARG_R - 5,
            label: '+' + t.tier,
            color: TIERS[t.tier].fill,
            alpha: 1,
            vy: -0.85,
          });
          nextLevel.push({
            x: t.x, y: t.y,
            chainR: TARGET_CHAIN_R,
            ringColor: TIERS[t.tier].glow,
          });
        }
      }
    }

    setTimeout(() => this._processLevel(nextLevel), CHAIN_DELAY);
  }

  remaining() {
    return this.targets.filter(t => !t.hit).length;
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
    if (this.phase !== 'placing') return;
    const pos = this._pos(e);

    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (Math.hypot(pos.x - s.x, pos.y - s.y) < 26) {
        this.dragIndex  = i;
        this.dragOffset = { x: pos.x - s.x, y: pos.y - s.y };
        return;
      }
    }

    if (this.sparks.length < MAX_SPARKS) {
      this.sparks.push({ x: pos.x, y: pos.y, flash: 0 });
      this.onSparksChanged(this.sparks.length, MAX_SPARKS);
      this.dragIndex  = this.sparks.length - 1;
      this.dragOffset = { x: 0, y: 0 };
    }
  }

  _onMove(e) {
    e.preventDefault();
    if (this.dragIndex === null) return;
    const pos = this._pos(e);
    this.sparks[this.dragIndex].x = pos.x - this.dragOffset.x;
    this.sparks[this.dragIndex].y = pos.y - this.dragOffset.y;
  }

  _onEnd(e) {
    e.preventDefault();
    this.dragIndex  = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  _draw() {
    const { ctx, W, H, targets, sparks, rings, floaters, frameCount, phase } = this;

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

    // Spark radius preview (placing phase only)
    if (phase === 'placing') {
      for (const s of sparks) {
        ctx.save();
        ctx.strokeStyle = 'rgba(253,230,138,0.18)';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(s.x, s.y, SPARK_CHAIN_R, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    // Expanding chain rings
    for (const ring of rings) {
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.alpha;
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ring.r    += (ring.maxR - ring.r) * 0.09;
      ring.alpha -= 0.009;
    }
    this.rings = rings.filter(r => r.alpha > 0);

    // Targets
    for (const t of targets) {
      if (t.flash    > 0)    t.flash    -= 0.022;
      if (t.popScale > 1.01) t.popScale  = 1 + (t.popScale - 1) * 0.88;
      const tc = TIERS[t.tier];

      if (!t.hit) {
        const p = 0.5 + 0.5 * Math.sin(frameCount * 0.04 + t.pulse);
        ctx.save();
        ctx.shadowBlur  = 6 + p * 8; ctx.shadowColor = tc.glow;
        ctx.fillStyle   = tc.fill;
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
      } else if (t.flash > 0 || t.popScale > 1.01) {
        const sc    = t.popScale;
        const extra = t.flash * 14;
        ctx.save();
        ctx.shadowBlur = 20 + t.flash * 28; ctx.shadowColor = tc.fill;
        ctx.fillStyle  = tc.fill;
        ctx.globalAlpha = Math.max(t.flash * 0.9, 0.04);
        ctx.translate(t.x, t.y); ctx.scale(sc, sc);
        ctx.beginPath(); ctx.arc(0, 0, (t.r + extra) / sc, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = Math.min(1 - t.flash * 1.5, 1);
        this._drawStone(t); ctx.restore();
      } else {
        this._drawStone(t);
      }
    }

    // Sparks
    for (const s of sparks) {
      if (s.flash > 0) s.flash -= 0.035;
      const pulse = 0.5 + 0.5 * Math.sin(frameCount * 0.07);
      ctx.save();
      ctx.shadowBlur  = 12 + pulse * 14 + s.flash * 24;
      ctx.shadowColor = '#fde68a';
      ctx.fillStyle   = s.flash > 0.4 ? '#fff' : '#fde68a';
      this._drawStar(ctx, s.x, s.y, SPARK_R * (1 + s.flash * 0.5), SPARK_R * 0.42 * (1 + s.flash * 0.3));
      ctx.restore();
    }

    // Score floaters
    for (const f of floaters) {
      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.font        = 'bold 13px system-ui';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = f.color;
      ctx.shadowBlur  = 6; ctx.shadowColor = f.color;
      ctx.fillText(f.label, f.x, f.y);
      ctx.restore();
      f.y     += f.vy;
      f.alpha -= 0.02;
    }
    this.floaters = floaters.filter(f => f.alpha > 0);
  }

  _drawStar(ctx, cx, cy, outerR, innerR, points = 5) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI / points) - Math.PI / 2;
      const r     = i % 2 === 0 ? outerR : innerR;
      const x     = cx + r * Math.cos(angle);
      const y     = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
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

  _loop() {
    this.frameCount++;
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}
