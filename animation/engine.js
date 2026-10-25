/*
 * Drawing engine for the explainer.
 * Every frame is a pure function of time: renderAt(t) draws the whole picture from
 * scratch, so the browser preview, a scrubbed frame and the rendered MP4 always match.
 */
(function () {
  'use strict';

  const W = 1920;
  const H = 1080;

  // Palette. Tokeniser surfaces and ink, Redbelly Network layer and accent.
  const C = {
    paper: '#F6F5F2',      // Tokeniser warm white
    paper2: '#ECEAE6',     // Tokeniser warm grey band
    card: '#FFFFFF',
    line: '#D8D5CF',
    line2: '#E6E3DE',
    ink: '#343740',        // Tokeniser ink
    ink2: '#4B4F5D',
    muted: '#5E6270',
    faint: '#868382',
    mint: '#A2FFC8',       // Tokeniser mint
    mintDeep: '#1F8F5F',   // mint for icons and small text on light surfaces
    teal: '#009C9C',       // Tokeniser label teal
    slate: '#142530',      // Redbelly secondary
    slate2: '#1D3140',
    slate3: '#263641',
    slateLine: '#34444F',
    grey: '#283A46',       // Redbelly main grey
    red: '#FF5050',        // Redbelly main red
    redSoft: '#FFB3AE',
    onDark: '#F1F5F8',
    onDark2: '#C2CED6',
    onDark3: '#8FA1AD',
    sand: '#E9E2D2',
    sand2: '#DCD3BE',
    field1: '#CDEFD9',
    field2: '#E4F2D8',
    field3: '#EFE6CC',
    field4: '#D9EAD0',
  };

  const FONT = "'Readex Pro', system-ui, sans-serif";
  const MONO = "'JetBrains Mono', ui-monospace, monospace";

  // ---------------------------------------------------------------- maths
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    linear: (t) => t,
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutQuint: (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2),
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => {
      const c1 = 1.45;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  /** Eased progress of t through the window [t0, t0 + dur]. */
  function p(t, t0, dur, fn = ease.outCubic) {
    if (dur <= 0) return t >= t0 ? 1 : 0;
    return fn(clamp((t - t0) / dur));
  }

  /** In then out: rises over `inDur` from t0, falls over `outDur` ending at t1. */
  function inOut(t, t0, t1, inDur = 0.45, outDur = 0.45, fn = ease.outCubic) {
    return Math.min(p(t, t0, inDur, fn), 1 - p(t, t1 - outDur, outDur, ease.inOutSine));
  }

  /** Keyframes: [[time, value], ...]. Values may be numbers or flat objects of numbers. */
  function kf(t, frames, fn = ease.inOutCubic) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 0; i < frames.length - 1; i++) {
      const [t0, v0] = frames[i];
      const [t1, v1] = frames[i + 1];
      if (t <= t1) {
        const k = fn(clamp((t - t0) / (t1 - t0)));
        if (typeof v0 === 'number') return lerp(v0, v1, k);
        const out = {};
        for (const key of Object.keys(v0)) out[key] = lerp(v0[key], v1[key], k);
        return out;
      }
    }
    return frames[frames.length - 1][1];
  }

  /** Deterministic pseudo random numbers, so particles are the same on every render. */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function mix(h1, h2, k) {
    const a = parseInt(h1.slice(1), 16);
    const b = parseInt(h2.slice(1), 16);
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, k));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k));
    const bl = Math.round(lerp(a & 255, b & 255, k));
    return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
  }

  // ---------------------------------------------------------------- text audit
  // Every string drawn on screen is recorded, so tools/check can prove that all
  // on-screen text appears in the script document.
  const drawn = new Set();

  // ---------------------------------------------------------------- primitives
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function font(size, weight = 400, mono = false) {
    return `${weight} ${size}px ${mono ? MONO : FONT}`;
  }

  /**
   * Draw text. Options: size, weight, color, align, baseline, mono, tracking (em), alpha, audit.
   * Returns the drawn width.
   */
  function text(ctx, str, x, y, o = {}) {
    const size = o.size || 32;
    ctx.save();
    ctx.font = font(size, o.weight || 400, o.mono);
    ctx.fillStyle = o.color || C.ink;
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    const tracking = (o.tracking || 0) * size;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
    let w = ctx.measureText(str).width;
    if (tracking && 'letterSpacing' in ctx) w -= tracking; // no trailing space after the last letter
    let dx = x;
    if (o.align === 'center') dx = x - w / 2;
    else if (o.align === 'right') dx = x - w;
    if (ctx.globalAlpha > 0.001) {
      ctx.fillText(str, dx, y);
      if (o.audit !== false) drawn.add(str);
    }
    ctx.restore();
    return w;
  }

  function measure(ctx, str, size, weight = 400, mono = false, tracking = 0) {
    ctx.save();
    ctx.font = font(size, weight, mono);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking * size}px`;
    let w = ctx.measureText(str).width;
    if (tracking && 'letterSpacing' in ctx) w -= tracking * size;
    ctx.restore();
    return w;
  }

  function shadow(ctx, blur = 30, y = 10, a = 0.08) {
    ctx.shadowColor = `rgba(13,8,6,${a})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = y;
  }

  function noShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  /** A white card with a hairline border and a soft, low shadow. */
  function card(ctx, x, y, w, h, o = {}) {
    ctx.save();
    if (o.shadow !== false) shadow(ctx, o.blur || 40, o.sy || 14, o.sa || 0.07);
    rr(ctx, x, y, w, h, o.r === undefined ? 14 : o.r);
    ctx.fillStyle = o.fill || C.card;
    ctx.fill();
    noShadow(ctx);
    if (o.stroke !== false) {
      ctx.lineWidth = o.lw || 1.5;
      ctx.strokeStyle = o.stroke || C.line2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Pill shaped label. Returns its width. */
  function chip(ctx, label, x, y, o = {}) {
    const size = o.size || 24;
    const padX = o.padX || size * 0.75;
    const h = o.h || size * 1.75;
    const iconW = o.icon ? h * 0.62 + 10 : 0;
    const w = measure(ctx, label, size, o.weight || 500, o.mono, o.tracking || 0) + padX * 2 + iconW;
    let x0 = x;
    if (o.align === 'center') x0 = x - w / 2;
    if (o.align === 'right') x0 = x - w;
    ctx.save();
    ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    rr(ctx, x0, y - h / 2, w, h, o.r === undefined ? h / 2 : o.r);
    ctx.fillStyle = o.fill || C.mint;
    ctx.fill();
    if (o.stroke) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = o.stroke;
      ctx.stroke();
    }
    if (o.icon) {
      const s = h * 0.62;
      const ix = x0 + padX * 0.8 + s / 2;
      o.icon(ctx, ix, y, s, o.iconColor || o.color || C.ink);
    }
    text(ctx, label, x0 + padX + iconW, y + size * 0.36, {
      size, weight: o.weight || 500, color: o.color || C.ink, mono: o.mono, tracking: o.tracking,
    });
    ctx.restore();
    return w;
  }

  // ---------------------------------------------------------------- icons
  function iconCheck(ctx, x, y, s, color, prog = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = [[-0.32, 0.02], [-0.08, 0.26], [0.34, -0.22]];
    const segs = [Math.hypot(0.24, 0.24), Math.hypot(0.42, 0.48)];
    const total = segs[0] + segs[1];
    let left = prog * total;
    ctx.beginPath();
    ctx.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
    for (let i = 0; i < 2 && left > 0; i++) {
      const k = Math.min(1, left / segs[i]);
      ctx.lineTo(x + lerp(pts[i][0], pts[i + 1][0], k) * s, y + lerp(pts[i][1], pts[i + 1][1], k) * s);
      left -= segs[i];
    }
    ctx.stroke();
    ctx.restore();
  }

  function iconCross(ctx, x, y, s, color, prog = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.lineCap = 'round';
    const a = 0.26 * s;
    const k1 = clamp(prog * 2);
    const k2 = clamp(prog * 2 - 1);
    ctx.beginPath();
    ctx.moveTo(x - a, y - a);
    ctx.lineTo(x - a + 2 * a * k1, y - a + 2 * a * k1);
    if (k2 > 0) {
      ctx.moveTo(x + a, y - a);
      ctx.lineTo(x + a - 2 * a * k2, y - a + 2 * a * k2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Round status badge: filled circle with a check or cross. */
  function badge(ctx, x, y, r, kind, prog = 1, o = {}) {
    if (prog <= 0) return;
    ctx.save();
    const sc = ease.outBack(clamp(prog * 1.6));
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = o.fill || (kind === 'check' ? C.mint : kind === 'cross' ? C.red : C.line);
    ctx.fill();
    const draw = kind === 'check' ? iconCheck : iconCross;
    if (kind !== 'none') draw(ctx, 0, 0, r * 1.6, o.color || (kind === 'check' ? C.ink : '#FFFFFF'), clamp(prog * 1.6 - 0.4));
    ctx.restore();
  }

  function iconUser(ctx, x, y, s, color, bg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, s / 2, 0, Math.PI * 2);
    ctx.fillStyle = bg || C.paper2;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.1, s * 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.38, s * 0.33, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function iconWallet(ctx, x, y, s, color, fill) {
    ctx.save();
    ctx.translate(x - s / 2, y - s * 0.4);
    rr(ctx, 0, 0, s, s * 0.8, s * 0.14);
    ctx.fillStyle = fill || 'transparent';
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = color;
    ctx.stroke();
    rr(ctx, s * 0.56, s * 0.25, s * 0.44, s * 0.3, s * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.4, s * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function iconShield(ctx, x, y, s, color, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.bezierCurveTo(s * 0.22, -s * 0.36, s * 0.4, -s * 0.36, s * 0.42, -s * 0.36);
    ctx.bezierCurveTo(s * 0.44, s * 0.05, s * 0.3, s * 0.34, 0, s * 0.5);
    ctx.bezierCurveTo(-s * 0.3, s * 0.34, -s * 0.44, s * 0.05, -s * 0.42, -s * 0.36);
    ctx.bezierCurveTo(-s * 0.4, -s * 0.36, -s * 0.22, -s * 0.36, 0, -s * 0.5);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  function iconLock(ctx, x, y, s, color, prog = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    const lift = (1 - prog) * s * 0.18;
    ctx.beginPath();
    ctx.arc(0, -s * 0.1 - lift, s * 0.22, Math.PI, 0);
    ctx.lineTo(s * 0.22, s * 0.02 - lift * 0.4);
    ctx.moveTo(-s * 0.22, -s * 0.1 - lift);
    ctx.lineTo(-s * 0.22, s * 0.02);
    ctx.stroke();
    rr(ctx, -s * 0.34, -s * 0.02, s * 0.68, s * 0.52, s * 0.08);
    ctx.fill();
    ctx.restore();
  }

  function iconDoc(ctx, x, y, s, color, kind) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    if (kind === 'sheet') {
      rr(ctx, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8, 4);
      ctx.stroke();
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, -s * 0.4 + (i * s * 0.8) / 3);
        ctx.lineTo(s * 0.4, -s * 0.4 + (i * s * 0.8) / 3);
        ctx.moveTo(-s * 0.4 + (i * s * 0.8) / 3, -s * 0.4);
        ctx.lineTo(-s * 0.4 + (i * s * 0.8) / 3, s * 0.4);
        ctx.stroke();
      }
    } else if (kind === 'mail') {
      rr(ctx, -s * 0.44, -s * 0.3, s * 0.88, s * 0.6, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, -s * 0.28);
      ctx.lineTo(0, s * 0.06);
      ctx.lineTo(s * 0.44, -s * 0.28);
      ctx.stroke();
    } else {
      rr(ctx, -s * 0.44, -s * 0.36, s * 0.88, s * 0.72, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, -s * 0.16);
      ctx.lineTo(s * 0.44, -s * 0.16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-s * 0.32, -s * 0.26, 2, 0, Math.PI * 2);
      ctx.arc(-s * 0.22, -s * 0.26, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function iconClock(ctx, x, y, s, color, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(angle) * s * 0.3, -Math.cos(angle) * s * 0.3);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(angle / 12) * s * 0.2, -Math.cos(angle / 12) * s * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  function iconEye(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(-s * 0.46, 0);
    ctx.quadraticCurveTo(0, -s * 0.46, s * 0.46, 0);
    ctx.quadraticCurveTo(0, s * 0.46, -s * 0.46, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function iconCash(ctx, x, y, s, color, fill) {
    ctx.save();
    ctx.translate(x, y);
    rr(ctx, -s * 0.5, -s * 0.3, s, s * 0.6, s * 0.1);
    ctx.fillStyle = fill || 'transparent';
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.06);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.32, 0, s * 0.04, 0, Math.PI * 2);
    ctx.arc(s * 0.32, 0, s * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function iconRules(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.09);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * s * 0.28;
      ctx.beginPath();
      ctx.arc(-s * 0.3, yy, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, yy);
      ctx.lineTo(s * 0.36, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function hexPath(ctx, x, y, r, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * Math.PI) / 3;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /**
   * The token: a coin with a hexagon carrying three crop rows, the farmland fund's unit.
   * o: { fill, ring, mark, rules (0..1 badge), lock (0..1), glow (0..1), square (0..1 morph from a unit tile) }
   */
  function token(ctx, x, y, r, o = {}) {
    ctx.save();
    ctx.translate(x, y);
    const sq = o.square || 0;
    if (o.glow) {
      const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2.1);
      g.addColorStop(0, hexA(o.glowColor || C.mint, 0.45 * o.glow));
      g.addColorStop(1, hexA(o.glowColor || C.mint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.shadow !== false) shadow(ctx, r * 0.5, r * 0.16, o.dark ? 0.35 : 0.12);
    rr(ctx, -r, -r, r * 2, r * 2, lerp(r, r * 0.22, sq));
    ctx.fillStyle = o.fill || C.mint;
    ctx.fill();
    noShadow(ctx);
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.strokeStyle = o.ring || C.ink;
    ctx.stroke();
    const markA = 1 - sq;
    if (markA > 0.01) {
      ctx.globalAlpha *= markA;
      ctx.strokeStyle = o.mark || C.ink;
      ctx.lineWidth = Math.max(1.5, r * 0.07);
      hexPath(ctx, 0, 0, r * 0.56);
      ctx.stroke();
      ctx.save();
      hexPath(ctx, 0, 0, r * 0.56);
      ctx.clip();
      ctx.lineWidth = Math.max(1.2, r * 0.05);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, i * r * 0.2 + r * 0.35);
        ctx.lineTo(r * 0.7, i * r * 0.2 - r * 0.35);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    if (o.rules > 0) {
      ctx.save();
      const bx = x + r * 0.74;
      const by = y - r * 0.74;
      const s = ease.outBack(clamp(o.rules));
      ctx.translate(bx, by);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = C.ink;
      ctx.fill();
      iconRules(ctx, 0, 0, r * 0.42, '#FFFFFF');
      ctx.restore();
    }
    if (o.lock > 0) {
      ctx.save();
      const bx = x + r * 0.74;
      const by = y + r * 0.74;
      const s = ease.outBack(clamp(o.lock));
      ctx.translate(bx, by);
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = C.red;
      ctx.fill();
      iconLock(ctx, 0, r * 0.02, r * 0.42, '#FFFFFF', clamp(o.lock * 1.5 - 0.5));
      ctx.restore();
    }
  }

  /** Line drawn from a to b up to progress k, optionally dashed. */
  function seg(ctx, x1, y1, x2, y2, k, o = {}) {
    if (k <= 0) return;
    ctx.save();
    ctx.strokeStyle = o.color || C.line;
    ctx.lineWidth = o.lw || 2;
    ctx.lineCap = 'round';
    if (o.dash) ctx.setLineDash(o.dash);
    if (o.dashOffset) ctx.lineDashOffset = o.dashOffset;
    ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(lerp(x1, x2, k), lerp(y1, y2, k));
    ctx.stroke();
    ctx.restore();
  }

  /** Point on a quadratic arc from a to b that bows by `bow` pixels. */
  function arcPoint(x1, y1, x2, y2, bow, k) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - bow;
    const u = 1 - k;
    return [u * u * x1 + 2 * u * k * mx + k * k * x2, u * u * y1 + 2 * u * k * my + k * k * y2];
  }

  window.Engine = {
    W, H, C, FONT, MONO, clamp, lerp, ease, p, inOut, kf, rng, hexA, mix, drawn,
    rr, font, text, measure, shadow, noShadow, card, chip, seg, arcPoint, hexPath,
    iconCheck, iconCross, badge, iconUser, iconWallet, iconShield, iconLock, iconDoc,
    iconClock, iconEye, iconCash, iconRules, token,
  };
})();
