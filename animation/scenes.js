/*
 * The explainer, scene by scene. Every cue is keyed to the voiceover: Wd('l05', 'verified')
 * is the moment the narrator says "verified", read from content/words.json.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const { C, clamp, lerp, ease, p, inOut, kf, text, chip, card, rr, token, badge } = E;

  let D = null;          // timeline, words, subtitles, script
  let IMG = {};          // logos
  let STATIC = {};       // cached static layers

  // ------------------------------------------------------------ timing helpers
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
  function S(id) { return D.scenes[id]; }
  function L(id) { return D.lines[id]; }
  /** Start time of the nth occurrence of `word` in line `id`. */
  function Wd(id, word, n = 0) {
    const list = D.words[id];
    const want = norm(word);
    let seen = 0;
    for (const w of list) {
      if (norm(w.w) === want) {
        if (seen === n) return w.start;
        seen++;
      }
    }
    throw new Error(`word "${word}" not found in ${id}`);
  }
  function WdEnd(id, word, n = 0) {
    const list = D.words[id];
    const want = norm(word);
    let seen = 0;
    for (const w of list) {
      if (norm(w.w) === want) {
        if (seen === n) return w.end;
        seen++;
      }
    }
    throw new Error(`word "${word}" not found in ${id}`);
  }

  // ------------------------------------------------------------ layout
  const WIN = { x: 760, y: 150, w: 1064, h: 500 };
  const CONTENT = { x: 792, y: 232, w: 1000, h: 390 };
  const BAND_TOP = 690;
  const SLOT = [942, 1292, 1642];          // investor A, B, C columns
  const STEPS = ['Set up', 'Investors', 'Issue', 'Transfer'];

  function bandY(t) {
    const t0 = Wd('l04', 'underneath') - 0.15;
    const up = p(t, t0, 1.1, ease.inOutCubic);
    return lerp(1080, BAND_TOP, up);
  }

  // ------------------------------------------------------------ static layers
  function buildStatic() {
    const paper = document.createElement('canvas');
    paper.width = E.W;
    paper.height = E.H;
    const g = paper.getContext('2d');
    g.fillStyle = C.paper;
    g.fillRect(0, 0, E.W, E.H);
    g.fillStyle = E.hexA(C.ink, 0.07);
    for (let y = 24; y < E.H; y += 32) for (let x = 24; x < E.W; x += 32) g.fillRect(x - 1, y - 1, 2, 2);
    const vg = g.createRadialGradient(960, 420, 200, 960, 540, 1200);
    vg.addColorStop(0, 'rgba(255,255,255,0.55)');
    vg.addColorStop(1, 'rgba(236,234,230,0.35)');
    g.fillStyle = vg;
    g.fillRect(0, 0, E.W, E.H);
    STATIC.paper = paper;

    const dark = document.createElement('canvas');
    dark.width = E.W;
    dark.height = E.H;
    const d = dark.getContext('2d');
    const dg = d.createRadialGradient(960, 420, 100, 960, 540, 1250);
    dg.addColorStop(0, C.slate2);
    dg.addColorStop(0.55, C.slate);
    dg.addColorStop(1, '#0A1014');
    d.fillStyle = dg;
    d.fillRect(0, 0, E.W, E.H);
    d.strokeStyle = 'rgba(241,245,248,0.035)';
    d.lineWidth = 1;
    for (let x = 0; x <= E.W; x += 96) { d.beginPath(); d.moveTo(x + 0.5, 0); d.lineTo(x + 0.5, E.H); d.stroke(); }
    for (let y = 0; y <= E.H; y += 96) { d.beginPath(); d.moveTo(0, y + 0.5); d.lineTo(E.W, y + 0.5); d.stroke(); }
    STATIC.dark = dark;

    const band = document.createElement('canvas');
    band.width = E.W;
    band.height = E.H - BAND_TOP;
    const b = band.getContext('2d');
    const bg = b.createLinearGradient(0, 0, 0, band.height);
    bg.addColorStop(0, C.slate);
    bg.addColorStop(1, '#0B151C');
    b.fillStyle = bg;
    b.fillRect(0, 0, band.width, band.height);
    b.strokeStyle = 'rgba(241,245,248,0.04)';
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 44; c++) {
        const x = c * 46 + (r % 2) * 23;
        const y = r * 40 + 20;
        E.hexPath(b, x, y, 22, 0);
        b.stroke();
      }
    }
    b.fillStyle = C.slateLine;
    b.fillRect(0, 0, band.width, 1);
    STATIC.band = band;
  }

  // ------------------------------------------------------------ shared pieces
  function logo(ctx, img, x, y, h, alpha = 1) {
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    const w = (img.width / img.height) * h;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return w;
  }

  function eyebrow(ctx, str, x, y, a, color = C.teal) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 15, 22, 3);
    text(ctx, str.toUpperCase(), x + 34, y - 6, { size: 20, weight: 500, mono: true, color, tracking: 0.14 });
    ctx.restore();
  }

  function header(ctx, t, o) {
    const a = inOut(t, o.t0, o.t1, 0.55, 0.35);
    if (a <= 0) return;
    const slide = (1 - p(t, o.t0, 0.7, ease.outQuint)) * 26;
    ctx.save();
    ctx.globalAlpha *= a;
    eyebrow(ctx, o.eyebrow, 96, 160 + slide * 0.6, 1);
    const lines = o.title.split('\n');
    lines.forEach((ln, i) => {
      text(ctx, ln, 96, 232 + i * 70 + slide, { size: o.size || 60, weight: 500, color: C.ink, tracking: -0.01 });
    });
    ctx.restore();
  }

  /** Left column list item: a badge then a line of text, revealed at time `at`. */
  function bullet(ctx, t, at, until, label, y, kind = 'check', o = {}) {
    const a = inOut(t, at, until, 0.4, 0.35);
    if (a <= 0) return;
    const k = p(t, at, 0.6, ease.outCubic);
    ctx.save();
    ctx.globalAlpha *= a;
    const x = 96 + (1 - k) * -18;
    if (kind === 'check' || kind === 'cross') badge(ctx, x + 18, y - 10, 18, kind, p(t, at, 0.7, ease.linear));
    else {
      ctx.beginPath();
      ctx.arc(x + 18, y - 10, 7, 0, Math.PI * 2);
      ctx.fillStyle = o.dot || C.ink;
      ctx.fill();
    }
    text(ctx, label, x + 54, y, { size: o.size || 30, weight: o.weight || 400, color: o.color || C.ink2 });
    ctx.restore();
  }

  // ------------------------------------------------------------ farmland
  /** Isometric farmland. k: build progress 0..1, s: scale. */
  function farm(ctx, cx, cy, s, k, alpha = 1) {
    if (alpha <= 0 || k <= 0) return;
    const a = 64 * s;                          // parcel size
    const cols = 4, rows = 3;
    const iso = (u, v) => [cx + (u - v) * a * 0.866, cy + (u + v) * a * 0.5 - (cols + rows) * a * 0.25];
    ctx.save();
    ctx.globalAlpha *= alpha;

    // ground slab
    const slab = p(k, 0, 0.25, ease.outCubic);
    const depth = 22 * s * slab;
    const c0 = iso(-0.25, -0.25), c1 = iso(cols + 0.25, -0.25), c2 = iso(cols + 0.25, rows + 0.25), c3 = iso(-0.25, rows + 0.25);
    ctx.globalAlpha *= slab;
    ctx.beginPath();
    ctx.moveTo(c3[0], c3[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c2[0], c2[1] + depth); ctx.lineTo(c3[0], c3[1] + depth); ctx.closePath();
    ctx.fillStyle = C.sand2; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c2[0], c2[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c1[0], c1[1] + depth); ctx.lineTo(c2[0], c2[1] + depth); ctx.closePath();
    ctx.fillStyle = '#CFC4AA'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(c3[0], c3[1]); ctx.closePath();
    ctx.fillStyle = C.sand; ctx.fill();
    ctx.lineWidth = 1.5 * s; ctx.strokeStyle = E.hexA(C.ink, 0.25); ctx.stroke();
    ctx.globalAlpha /= slab || 1;

    // parcels
    const fills = [C.field1, C.field3, C.field2, C.field4, C.field3, C.field1, C.field4, C.field2, C.field1, C.field2, C.field3, C.field4];
    let n = 0;
    for (let v = 0; v < rows; v++) {
      for (let u = 0; u < cols; u++) {
        const kk = p(k, 0.18 + n * 0.035, 0.22, ease.outBack);
        n++;
        if (kk <= 0) continue;
        const inset = 0.06;
        const q = [iso(u + inset, v + inset), iso(u + 1 - inset, v + inset), iso(u + 1 - inset, v + 1 - inset), iso(u + inset, v + 1 - inset)];
        const mid = iso(u + 0.5, v + 0.5);
        ctx.save();
        ctx.translate(mid[0], mid[1]);
        ctx.scale(kk, kk);
        ctx.translate(-mid[0], -mid[1] - (1 - kk) * 16);
        ctx.beginPath();
        q.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
        ctx.closePath();
        ctx.fillStyle = fills[(u + v * cols) % fills.length];
        ctx.fill();
        // crop rows
        const rowsK = p(k, 0.45 + n * 0.02, 0.3);
        if (rowsK > 0 && !(u === 3 && v === 0)) {
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = E.hexA(C.ink, 0.18);
          ctx.lineWidth = 1.4 * s;
          const along = (u + v) % 2 === 0;
          for (let i = 1; i < 6; i++) {
            const f = i / 6;
            const A = along ? iso(u + f, v) : iso(u, v + f);
            const B = along ? iso(u + f, v + 1) : iso(u + 1, v + f);
            ctx.beginPath();
            ctx.moveTo(A[0], A[1]);
            ctx.lineTo(lerp(A[0], B[0], rowsK), lerp(A[1], B[1], rowsK));
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // farmhouse and silo on the far parcel
    const bk = p(k, 0.72, 0.25, ease.outBack);
    if (bk > 0) {
      const base = iso(3.5, 0.5);
      ctx.save();
      ctx.translate(base[0], base[1]);
      ctx.scale(bk, bk);
      const bw = a * 0.32, bh = a * 0.42;
      // house walls
      ctx.beginPath(); ctx.moveTo(-bw * 0.866, 0); ctx.lineTo(0, bw * 0.5); ctx.lineTo(0, bw * 0.5 - bh); ctx.lineTo(-bw * 0.866, -bh); ctx.closePath();
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = E.hexA(C.ink, 0.5); ctx.lineWidth = 1.2 * s; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, bw * 0.5); ctx.lineTo(bw * 0.866, 0); ctx.lineTo(bw * 0.866, -bh); ctx.lineTo(0, bw * 0.5 - bh); ctx.closePath();
      ctx.fillStyle = C.paper2; ctx.fill(); ctx.stroke();
      // roof
      ctx.beginPath(); ctx.moveTo(-bw * 0.866, -bh); ctx.lineTo(0, bw * 0.5 - bh); ctx.lineTo(0, -bh - bw * 0.55); ctx.lineTo(-bw * 0.866, -bh - bw); ctx.closePath();
      ctx.fillStyle = C.ink2; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, bw * 0.5 - bh); ctx.lineTo(bw * 0.866, -bh); ctx.lineTo(bw * 0.866, -bh - bw); ctx.lineTo(0, -bh - bw * 0.55); ctx.closePath();
      ctx.fillStyle = C.ink; ctx.fill();
      // silo
      const sx = -bw * 1.9, sy = -bw * 0.2, sr = bw * 0.42, sh = bh * 1.7;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr * 0.5, 0, 0, Math.PI); ctx.lineTo(sx - sr, sy - sh); ctx.ellipse(sx, sy - sh, sr, sr * 0.5, 0, Math.PI, 0, true); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = E.hexA(C.ink, 0.5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx, sy - sh, sr, sr * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = C.ink2; ctx.fill();
      ctx.restore();
    }
    // tree line along the near edge
    const tk = p(k, 0.6, 0.35);
    if (tk > 0) {
      for (let i = 0; i < 6; i++) {
        const kk = p(tk, i * 0.1, 0.5, ease.outBack);
        if (kk <= 0) continue;
        const pt = iso(-0.45, 0.25 + i * 0.5);
        ctx.save();
        ctx.translate(pt[0], pt[1]);
        ctx.scale(kk, kk);
        ctx.strokeStyle = E.hexA(C.ink, 0.45); ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14 * s); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -22 * s, 11 * s, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#9FD9B4' : '#B9E6C8'; ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function fundFrame(ctx, x, y, w, h, k, alpha = 1) {
    if (k <= 0 || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha * k;
    rr(ctx, x, y, w, h, 26);
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = E.hexA(C.ink, 0.35);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------ platform window
  function platformWindow(ctx, alpha, lift = 0) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(0, lift);
    card(ctx, WIN.x, WIN.y, WIN.w, WIN.h, { r: 18, blur: 60, sy: 22, sa: 0.1 });
    // top bar
    ctx.save();
    rr(ctx, WIN.x, WIN.y, WIN.w, 58, 18);
    ctx.clip();
    ctx.fillStyle = '#FBFAF8';
    ctx.fillRect(WIN.x, WIN.y, WIN.w, 58);
    ctx.restore();
    ctx.fillStyle = C.line2;
    ctx.fillRect(WIN.x, WIN.y + 58, WIN.w, 1.5);
    logo(ctx, IMG.tokeniser, WIN.x + 28, WIN.y + 19, 21);
    for (let i = 0; i < 3; i++) {
      rr(ctx, WIN.x + WIN.w - 300 + i * 84, WIN.y + 24, 64, 10, 5);
      ctx.fillStyle = i === 0 ? C.ink2 : C.line;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(WIN.x + WIN.w - 36, WIN.y + 29, 13, 0, Math.PI * 2);
    ctx.fillStyle = C.mint;
    ctx.fill();
    ctx.restore();
  }

  function panelTitle(ctx, str, x, y, a = 1, extra) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    text(ctx, str, x, y, { size: 26, weight: 500, color: C.ink });
    if (extra) extra();
    ctx.restore();
  }

  // ------------------------------------------------------------ band (Redbelly Network)
  function chainBlocks(ctx, t, by, highlights) {
    const y = by + 190;
    const step = 66;
    const speed = 14;
    const off = (t * speed) % step;
    ctx.save();
    for (let i = -1; i < 20; i++) {
      const x = 700 + i * step - off;
      if (x < 660 || x > 1900) continue;
      const fadeL = clamp((x - 660) / 80);
      ctx.globalAlpha = fadeL;
      ctx.strokeStyle = C.slateLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 24, y);
      ctx.lineTo(x + step - 24, y);
      ctx.stroke();
      rr(ctx, x - 22, y - 22, 44, 44, 8);
      ctx.fillStyle = C.slate2;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    for (const h of highlights) {
      if (h.k <= 0) continue;
      ctx.save();
      ctx.globalAlpha = h.k;
      const g = ctx.createRadialGradient(h.x, y, 10, h.x, y, 90);
      g.addColorStop(0, E.hexA(h.color, 0.4));
      g.addColorStop(1, E.hexA(h.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, y, 90, 0, Math.PI * 2);
      ctx.fill();
      rr(ctx, h.x - 26, y - 26, 52, 52, 10);
      ctx.fillStyle = h.fill || C.slate2;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = h.color;
      ctx.stroke();
      if (h.lock) E.iconLock(ctx, h.x, y + 1, 30, h.color, h.lock);
      ctx.restore();
    }
    return y;
  }

  function walletCard(ctx, x, y, o) {
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const w = 236, h = 84;
    rr(ctx, x - w / 2, y - h / 2, w, h, 14);
    ctx.fillStyle = C.slate2;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = o.highlight ? E.mix(C.slateLine, C.mint, o.highlight) : C.slateLine;
    ctx.stroke();
    E.iconUser(ctx, x - w / 2 + 34, y, 40, C.slate, o.tint || C.mint);
    E.iconWallet(ctx, x - w / 2 + 84, y + 2, 32, C.onDark2);
    // verified dot
    ctx.beginPath();
    ctx.arc(x - w / 2 + 50, y + 15, 7, 0, Math.PI * 2);
    ctx.fillStyle = C.mint;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.slate2;
    ctx.stroke();
    // token stack
    const n = o.tokens || 0;
    for (let i = 0; i < Math.ceil(n); i++) {
      const k = clamp(n - i);
      token(ctx, x - w / 2 + 132 + i * 24, y, 17 * ease.outBack(k), { fill: C.mint, ring: C.slate, mark: C.slate, shadow: false });
    }
    if (o.cash > 0) {
      E.iconCash(ctx, x + w / 2 - 36, y, 34 * ease.outBack(clamp(o.cash)), C.slate, '#FFFFFF');
    }
    ctx.restore();
  }

  function band(ctx, t) {
    const by = bandY(t);
    if (by >= 1079) return by;
    ctx.save();
    const outA = 1 - p(t, S('s12').start - 0.1, 0.6);
    ctx.drawImage(STATIC.band, 0, by);
    ctx.globalAlpha = outA;
    const la = p(t, Wd('l04', 'redbelly') - 0.1, 0.6);
    logo(ctx, IMG.rbDark, 96 - (1 - la) * 20, by + 26, 50, la);
    const sa = p(t, Wd('l04', 'public') - 0.1, 0.6);
    text(ctx, 'PUBLIC DIGITAL TOKEN INFRASTRUCTURE', 96, by + 112, { size: 17, weight: 500, mono: true, color: C.onDark3, tracking: 0.12, alpha: sa });
    text(ctx, 'Redbelly Network', 96, by + 152, { size: 22, weight: 400, color: C.onDark2, alpha: sa * (1 - p(t, S('s05').start, 0.5)) });
    ctx.restore();
    return by;
  }

  // ------------------------------------------------------------ journey rail
  function rail(ctx, t) {
    const appear = p(t, Wd('l01', 'follow') - 0.2, 0.9);
    const out = 1 - p(t, S('s12').start - 0.1, 0.5);
    if (appear <= 0 || out <= 0) return;
    const m = p(t, S('s02').start - 0.55, 1.0, ease.inOutCubic);
    const x0 = lerp(560, 1250, m), x1 = lerp(1360, 1824, m), y = lerp(880, 76, m);
    const r = lerp(17, 12, m);
    const ls = lerp(25, 17, m);
    const colLine = E.mix('#3A4B57', C.line, m);
    const colLabel = E.mix(C.onDark2, C.muted, m);
    const steps = [S('s05').start, S('s06').start, S('s07').start, S('s08').start];
    const doneAt = [S('s06').start, S('s07').start, S('s08').start, S('s10').start];
    ctx.save();
    ctx.globalAlpha *= appear * out;
    const draw = p(t, Wd('l01', 'follow') - 0.2, 1.4, ease.inOutCubic);
    E.seg(ctx, x0, y, x1, y, draw, { color: colLine, lw: 2 });
    for (let i = 0; i < 4; i++) {
      const x = lerp(x0, x1, i / 3);
      const k = p(t, Wd('l01', 'follow') + i * 0.18, 0.5, ease.outBack);
      if (k <= 0) continue;
      const active = t >= steps[i] - 0.2 && t < doneAt[i];
      const done = t >= doneAt[i];
      const actK = p(t, steps[i] - 0.2, 0.5);
      const doneK = p(t, doneAt[i], 0.5);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      // progress fill on the rail between completed steps
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = done ? C.mint : active ? E.mix(m < 0.5 ? C.slate : C.paper, C.ink, actK) : (m < 0.5 ? C.slate : C.paper);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = done ? C.ink : active ? C.ink : colLine;
      ctx.stroke();
      if (active) {
        const pulse = (t - steps[i]) % 1.6 / 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4 + pulse * 12, 0, Math.PI * 2);
        ctx.strokeStyle = E.hexA(C.teal, 0.5 * (1 - pulse));
        ctx.stroke();
      }
      if (done) E.iconCheck(ctx, 0, 0, r * 1.5, C.ink, doneK);
      else text(ctx, String(i + 1), 0, r * 0.36, { size: r * 1.0, weight: 500, align: 'center', color: active ? '#FFFFFF' : colLabel, mono: true, audit: false });
      ctx.restore();
      text(ctx, STEPS[i], x, y + r + ls * 1.35, {
        size: ls, weight: active ? 500 : 400, align: 'center',
        color: active ? (m < 0.5 ? '#FFFFFF' : C.ink) : colLabel, alpha: k,
      });
    }
    // completed segments turn mint
    for (let i = 0; i < 3; i++) {
      const k = p(t, doneAt[i], 0.6);
      if (k > 0) E.seg(ctx, lerp(x0, x1, i / 3) + r, y, lerp(x0, x1, (i + 1) / 3) - r, y, k, { color: C.mintDeep, lw: 3 });
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ scene 1: opening
  function opening(ctx, t) {
    const s2 = S('s02').start;
    const wipe = p(t, s2 - 0.45, 0.95, ease.inOutCubic);
    if (wipe >= 1) return;
    ctx.save();
    ctx.translate(0, -wipe * E.H);
    ctx.drawImage(STATIC.dark, 0, 0);
    // token emblem drawing itself
    const cx = 960, cy = 330;
    const ring = p(t, 0.15, 1.3, ease.inOutCubic);
    ctx.save();
    ctx.strokeStyle = C.onDark2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, -Math.PI / 2, -Math.PI / 2 + ring * Math.PI * 2);
    ctx.stroke();
    const fillK = p(t, 1.1, 0.8, ease.outBack);
    if (fillK > 0) token(ctx, cx, cy, 92 * fillK, { fill: C.mint, ring: C.onDark, glow: fillK * 0.9, dark: true });
    // orbit dots
    const rnd = E.rng(7);
    for (let i = 0; i < 18; i++) {
      const ang = rnd() * Math.PI * 2 + t * (0.15 + rnd() * 0.2);
      const rad = 140 + rnd() * 90;
      const a = p(t, 0.6 + rnd() * 1.2, 0.8) * 0.5;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.55, 2 + rnd() * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = E.hexA(C.mint, a);
      ctx.fill();
    }
    ctx.restore();
    // title
    const ta = p(t, 1.0, 0.9);
    const ty = (1 - ta) * 24;
    text(ctx, 'From real-world asset', 960, 560 + ty, { size: 78, weight: 500, color: C.onDark, align: 'center', alpha: ta, tracking: -0.015 });
    const tb = p(t, 1.35, 0.9);
    text(ctx, 'to compliant token', 960, 652 + (1 - tb) * 24, { size: 78, weight: 500, color: C.mint, align: 'center', alpha: tb, tracking: -0.015 });
    const tc = p(t, 2.0, 0.8);
    text(ctx, 'TOKENISER ON REDBELLY NETWORK', 960, 728, { size: 20, weight: 500, color: C.onDark3, align: 'center', mono: true, tracking: 0.16, alpha: tc });
    ctx.restore();
  }

  // ------------------------------------------------------------ scene 2 and 3: the asset and the idea
  function assetScenes(ctx, t) {
    const s2 = S('s02'), s3 = S('s03'), s4 = S('s04');
    const s11 = S('s11');
    if (t < s2.start - 0.5 || (t > S('s05').start + 0.6 && t < s11.start - 1)) return;

    // farmland: builds in s02, moves left in s03, leaves in s04, returns in s11
    const build = p(t, s2.start - 0.1, 2.2, ease.linear);
    const pos = kf(t, [
      [s3.start - 0.1, { x: 560, y: 500, s: 1.0, a: 1 }],
      [s3.start + 0.9, { x: 420, y: 530, s: 0.78, a: 1 }],
      [s4.start + 0.2, { x: 420, y: 530, s: 0.78, a: 1 }],
      [s4.start + 0.9, { x: 300, y: 580, s: 0.7, a: 0 }],
    ]);
    const back = p(t, s11.start - 0.4, 1.2, ease.inOutCubic);
    let fx = pos.x, fy = pos.y, fs = pos.s, fa = pos.a;
    if (t > s11.start - 1) { fx = 1290; fy = lerp(480, 395, back); fs = 0.86; fa = back; }
    const frameK = t > s11.start - 1 ? back : p(t, Wd('l02', 'fund') - 0.1, 0.7);
    const fw = 640 * fs, fh = 420 * fs;
    fundFrame(ctx, fx - fw / 2, fy - fh / 2 - 30 * fs, fw, fh, frameK, fa);
    farm(ctx, fx, fy, fs, t > s11.start - 1 ? 1 : build, fa);

    if (t > s11.start - 1) return;

    // investors and units, s02
    const invA = inOut(t, Wd('l02', 'investors') - 0.1, s3.start + 0.6, 0.5, 0.5);
    const unitsAt = Wd('l02', 'units') - 0.15;
    const inv = [[360, 845, C.mint], [560, 845, C.sand], [760, 845, C.paper2]];
    if (invA > 0) {
      ctx.save();
      ctx.globalAlpha *= invA;
      text(ctx, 'Units', 272, 744, { size: 22, weight: 500, color: C.muted, align: 'right', alpha: p(t, unitsAt, 0.5) });
      inv.forEach(([x, y, tint], i) => {
        const k = p(t, Wd('l02', 'investors') + i * 0.12, 0.5, ease.outBack);
        for (let j = 0; j < 3; j++) {
          const ux = 300 + (i * 3 + j + (i === 2 ? 1 : 0)) * 52;
          E.seg(ctx, x, y - 34, ux, 757, p(t, unitsAt + 0.3 + j * 0.05, 0.5), { color: E.hexA(C.ink, 0.22), lw: 1.5, dash: [4, 6] });
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        E.iconUser(ctx, 0, 0, 62, C.ink2, tint);
        ctx.restore();
      });
      text(ctx, 'Investors', 860, 855, { size: 22, weight: 500, color: C.muted, alpha: p(t, Wd('l02', 'investors'), 0.5) });
      ctx.restore();
    }

    // the register today: separate systems, updated after the fact
    const regA = inOut(t, Wd('l02', 'register') - 0.1, s3.start + 0.5, 0.5, 0.45);
    if (regA > 0) {
      ctx.save();
      ctx.globalAlpha *= regA;
      eyebrow(ctx, 'Register today', 1180, 330, p(t, Wd('l02', 'register') - 0.1, 0.5), C.muted);
      const docs = [
        ['Spreadsheet', 'sheet', 1180, 380, -2.5],
        ['Email', 'mail', 1470, 420, 2],
        ['Admin system', 'app', 1260, 590, 1.5],
      ];
      const sepAt = Wd('l02', 'separate') - 0.2;
      docs.forEach(([label, kind, x, y, rot], i) => {
        const k = p(t, sepAt + i * 0.16, 0.55, ease.outBack);
        if (k <= 0) return;
        const jitter = Math.sin(t * 2.1 + i * 2) * 1.2;
        ctx.save();
        ctx.translate(x + 120, y + 70);
        ctx.rotate(((rot + jitter * 0.3) * Math.PI) / 180);
        ctx.scale(k, k);
        card(ctx, -120, -70, 240, 140, { r: 12 });
        E.iconDoc(ctx, -66, -14, 46, C.muted, kind);
        text(ctx, label, -30, -6, { size: 22, weight: 500, color: C.ink });
        for (let j = 0; j < 2; j++) {
          rr(ctx, -96, 26 + j * 18, 150 - j * 50, 8, 4);
          ctx.fillStyle = C.line2;
          ctx.fill();
        }
        ctx.restore();
      });
      // broken links between the systems
      const linkK = p(t, sepAt + 0.6, 0.6);
      const links = [[1420, 450, 1480, 470], [1330, 525, 1340, 590], [1560, 565, 1500, 610]];
      links.forEach(([x1, y1, x2, y2], i) => {
        E.seg(ctx, x1, y1, x2, y2, linkK, { color: C.faint, lw: 2, dash: [5, 7] });
        if (linkK > 0.9) {
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          E.iconCross(ctx, mx, my, 16, C.red, p(t, sepAt + 1.0 + i * 0.1, 0.4));
        }
      });
      // after the fact
      const late = p(t, Wd('l02', 'updated') - 0.15, 0.6, ease.outBack);
      if (late > 0) {
        ctx.save();
        ctx.translate(1570, 690);
        ctx.scale(late, late);
        card(ctx, -40, -40, 80, 80, { r: 40, fill: C.paper2, stroke: C.line });
        E.iconClock(ctx, 0, 0, 52, C.ink2, t * 2.2);
        ctx.restore();
        text(ctx, 'Updated after the fact', 1525, 765, { size: 22, weight: 500, color: C.ink2, alpha: late, align: 'center' });
      }
      ctx.restore();
    }

    // s03: rules programmed in
    const rA = inOut(t, Wd('l03', 'rules') - 0.2, s4.start + 0.3, 0.5, 0.4);
    if (rA > 0) {
      ctx.save();
      ctx.globalAlpha *= rA;
      chip(ctx, 'Rules, programmed in', 980, 790, { size: 26, fill: C.ink, color: '#FFFFFF', icon: E.iconRules, iconColor: '#FFFFFF' });
      ctx.restore();
    }
  }

  /** Units of the fund: tiles in s02, tokens in s03, settled into the platform window in s04. */
  function unitTokens(ctx, t) {
    const s2 = S('s02'), s4 = S('s04'), s5 = S('s05');
    if (t < s2.start || t > s5.start + 0.6) return;
    const unitsAt = Wd('l02', 'units') - 0.15;
    const morph = p(t, Wd('l03', 'digital') - 0.25, 1.1, ease.inOutCubic);
    const intoAt = Wd('l04', 'tokeniser') + 0.1;
    const into = p(t, intoAt, 1.1, ease.inOutCubic);
    const fade = 1 - p(t, s5.start - 0.25, 0.5);
    for (let i = 0; i < 10; i++) {
      const k = p(t, unitsAt + i * 0.06, 0.45, ease.outBack);
      if (k <= 0) continue;
      const ux = 300 + i * 52, uy = 735;
      const col = i % 5, row = Math.floor(i / 5);
      const tx = 980 + col * 150, ty = 470 + row * 150;
      const wx = CONTENT.x + 70 + col * 112, wy = CONTENT.y + 120 + row * 112;
      let x = lerp(ux, tx, morph), y = lerp(uy, ty, morph) - Math.sin(morph * Math.PI) * 120;
      let r = lerp(20, 52, morph);
      x = lerp(x, wx, into); y = lerp(y, wy, into) - Math.sin(into * Math.PI) * 40; r = lerp(r, 40, into);
      ctx.save();
      ctx.globalAlpha *= fade;
      token(ctx, x, y, r * k, {
        fill: E.mix(C.sand, C.mint, morph), square: 1 - morph,
        rules: p(t, Wd('l03', 'rules') + i * 0.05, 0.5), shadow: morph > 0.5,
      });
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ window contents per step
  function setupView(ctx, t, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    panelTitle(ctx, 'Fund setup', CONTENT.x, CONTENT.y + 10);
    // fund card
    const fx = CONTENT.x, fy = CONTENT.y + 40;
    card(ctx, fx, fy, 440, 140, { r: 14, shadow: false, fill: '#FBFAF8' });
    farm(ctx, fx + 70, fy + 82, 0.26, 1);
    text(ctx, 'Australian farmland fund', fx + 136, fy + 58, { size: 24, weight: 500 });
    const ver = p(t, Wd('l05', 'verified') - 0.1, 0.5);
    if (ver > 0) chip(ctx, 'Fund verified', fx + 136, fy + 98, { size: 20, fill: C.mint, icon: (c, x, y, s, col) => E.iconCheck(c, x, y, s, col, ver), alpha: ver });
    else chip(ctx, 'Pending', fx + 136, fy + 98, { size: 20, fill: C.paper2, color: C.muted, audit: false });

    // rules flying into the token
    const tx = CONTENT.x + 790, ty = CONTENT.y + 190;
    const encodeAt = Wd('l05', 'encoded') - 0.1;
    const enc = p(t, encodeAt, 0.9, ease.inOutCubic);
    const rules = [['Wholesale investors only', Wd('l05', 'wholesale') - 0.1], ['Transfer restrictions', Wd('l05', 'wholesale') + 0.7]];
    text(ctx, 'Rules', fx, fy + 196, { size: 20, weight: 500, color: C.muted, mono: true, alpha: p(t, rules[0][1], 0.4) * (1 - enc) });
    rules.forEach(([label, at], i) => {
      const k = p(t, at, 0.6, ease.outBack);
      if (k <= 0) return;
      const x0 = fx, y0 = fy + 238 + i * 58;
      ctx.save();
      ctx.globalAlpha *= clamp(k);
      const fly = enc;
      const [px, py] = E.arcPoint(x0 + 170, y0, tx - 60, ty + 120 + i * 50, 40, fly);
      const ox = lerp(x0, px - 170, fly) - lerp(x0, x0, 0);
      chip(ctx, label, lerp(x0, px - 160, fly), lerp(y0, py, fly), {
        size: 21, fill: E.mix(C.paper2, C.ink, fly), color: fly > 0.5 ? '#FFFFFF' : C.ink,
        icon: (c, x, y, s, col) => E.iconLock(c, x, y, s * 0.9, col, fly),
      });
      void ox;
      ctx.restore();
    });
    // the token
    const tk = p(t, Wd('l05', 'rules') - 0.2, 0.7, ease.outBack);
    if (tk > 0) {
      token(ctx, tx, ty, 92 * tk, { fill: C.mint, glow: 0.4 + enc * 0.6, rules: p(t, encodeAt + 0.7, 0.5), lock: p(t, encodeAt + 0.9, 0.5) });
      ctx.save();
      ctx.strokeStyle = E.hexA(C.ink, 0.8 * enc);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(tx, ty, 120, -Math.PI / 2, -Math.PI / 2 + enc * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function investorCard(ctx, cx, y, tint, checks, o = {}) {
    const w = 300, h = 316;
    card(ctx, cx - w / 2, y, w, h, { r: 16, shadow: false, fill: '#FBFAF8' });
    E.iconUser(ctx, cx, y + 70, 84, C.ink2, tint);
    const rows = ['Identity verified', 'Investor classified'];
    rows.forEach((label, i) => {
      const yy = y + 160 + i * 52;
      const st = checks[i];
      rr(ctx, cx - w / 2 + 20, yy - 22, w - 40, 44, 10);
      ctx.fillStyle = st.kind === 'check' && st.k > 0.5 ? E.hexA(C.mint, 0.45) : '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = C.line2;
      ctx.stroke();
      if (st.k > 0) badge(ctx, cx - w / 2 + 44, yy, 12, st.kind, st.k);
      else {
        ctx.beginPath();
        ctx.arc(cx - w / 2 + 44, yy, 11, 0, Math.PI * 2);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, label, cx - w / 2 + 66, yy + 7, { size: 20, weight: 400, color: st.kind === 'cross' && st.k > 0 ? C.faint : C.ink });
    });
    if (o.footer) text(ctx, o.footer, cx, y + h - 22, { size: 20, weight: 500, color: o.footerColor || C.muted, align: 'center', alpha: o.footerA });
  }

  function investorsView(ctx, t, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const y = CONTENT.y - 8;
    const scanStart = Wd('l06', 'verified') - 0.2;
    const scanEnd = WdEnd('l06', 'averer') + 0.5;
    const scan = p(t, scanStart, scanEnd - scanStart, ease.inOutSine);
    const scanX = lerp(CONTENT.x - 20, CONTENT.x + CONTENT.w + 20, scan);
    const tints = [C.mint, C.sand, C.paper2];
    SLOT.forEach((cx, i) => {
      const k = p(t, S('s06').start + 0.1 + i * 0.12, 0.6, ease.outBack);
      if (k <= 0) return;
      const passed = scanX > cx - 60;
      const at = scanStart + (scanEnd - scanStart) * clamp((cx - 60 - CONTENT.x + 20) / (CONTENT.w + 40));
      const checks = [0, 1].map((j) => ({ kind: i === 2 ? 'cross' : 'check', k: passed ? p(t, at + j * 0.18, 0.5, ease.linear) : 0 }));
      const footerA = i === 2 ? p(t, at + 0.4, 0.5) : 0;
      ctx.save();
      ctx.translate(cx, y + 160);
      ctx.scale(k, k);
      ctx.translate(-cx, -(y + 160));
      investorCard(ctx, cx, y, tints[i], checks, i === 2 ? { footer: 'Not verified', footerColor: C.red, footerA } : {});
      if (i === 2) {
        const nt = p(t, Wd('l06', 'wallet') + 0.2, 0.5);
        text(ctx, 'No tokens', cx, y + 352, { size: 20, weight: 500, color: C.muted, align: 'center', alpha: nt });
      }
      ctx.restore();
    });
    // scanner, labelled with the verifier's name
    const sa = inOut(t, scanStart, scanEnd + 0.1, 0.25, 0.3);
    if (sa > 0) {
      ctx.save();
      ctx.globalAlpha *= sa;
      const g = ctx.createLinearGradient(scanX - 60, 0, scanX, 0);
      g.addColorStop(0, E.hexA(C.mint, 0));
      g.addColorStop(1, E.hexA(C.mint, 0.55));
      ctx.fillStyle = g;
      ctx.fillRect(scanX - 60, y - 6, 60, 330);
      ctx.fillStyle = C.mintDeep;
      ctx.fillRect(scanX - 1.5, y - 6, 3, 330);
      chip(ctx, 'Averer', scanX, y + 340, { size: 18, mono: true, fill: C.ink, color: '#FFFFFF', align: 'center', weight: 500 });
      ctx.restore();
    }
    ctx.restore();
  }

  function registerView(ctx, t, a, counts) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    panelTitle(ctx, 'Register', CONTENT.x, CONTENT.y + 10);
    const live = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.beginPath();
    ctx.arc(CONTENT.x + 132, CONTENT.y + 1, 7, 0, Math.PI * 2);
    ctx.fillStyle = E.hexA(C.mintDeep, live);
    ctx.fill();
    text(ctx, 'Live', CONTENT.x + 146, CONTENT.y + 9, { size: 20, weight: 500, color: C.mintDeep });
    const rows = [[C.mint, counts[0], counts.at0], [C.sand, counts[1], counts.at1]];
    rows.forEach(([tint, n, at], i) => {
      const y = CONTENT.y + 70 + i * 110;
      card(ctx, CONTENT.x, y, CONTENT.w, 90, { r: 14, shadow: false, fill: '#FBFAF8' });
      E.iconUser(ctx, CONTENT.x + 50, y + 45, 52, C.ink2, tint);
      E.iconWallet(ctx, CONTENT.x + 112, y + 47, 34, C.muted);
      for (let j = 0; j < 3; j++) {
        const k = clamp(n - j);
        ctx.beginPath();
        ctx.arc(CONTENT.x + 190 + j * 50, y + 45, 18, 0, Math.PI * 2);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (k > 0) token(ctx, CONTENT.x + 190 + j * 50, y + 45, 18 * ease.outBack(k), { fill: C.mint, shadow: false });
      }
      const up = p(t, at, 0.5, ease.outBack);
      if (up > 0) chip(ctx, 'Updated', CONTENT.x + CONTENT.w - 24, y + 45, { size: 20, fill: C.mint, align: 'right', icon: (c, x, yy, s, col) => E.iconCheck(c, x, yy, s, col, up), alpha: clamp(up) });
    });
    ctx.restore();
  }

  function rulesCheckView(ctx, t, a, o) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    panelTitle(ctx, 'Rules check', CONTENT.x, CONTENT.y + 10);
    const px = CONTENT.x, py = CONTENT.y + 44;
    card(ctx, px, py, 560, 300, { r: 16, shadow: false, fill: '#FBFAF8' });
    E.iconShield(ctx, px + 70, py + 150, 82, C.ink, o.passed > 0 ? E.hexA(C.mint, o.passed) : o.failed > 0 ? E.hexA(C.red, 0.12 * o.failed) : null);
    const rows = ['Wholesale investors only', 'Transfer restrictions'];
    rows.forEach((label, i) => {
      const y = py + 100 + i * 70;
      const st = o.rows[i];
      if (st.k > 0) badge(ctx, px + 158, y, 15, st.kind, st.k);
      else {
        ctx.beginPath();
        ctx.arc(px + 158, y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(ctx, label, px + 188, y + 8, { size: 23, weight: 400, color: C.ink });
    });
    // the target investor
    const tx = CONTENT.x + 820, ty = CONTENT.y + 170;
    card(ctx, tx - 150, py, 300, 300, { r: 16, shadow: false, fill: '#FBFAF8' });
    const swap = o.targetSwap;
    E.iconUser(ctx, tx, ty - 20, 96, C.ink2, swap > 0.5 ? C.sand : C.paper2);
    const lab = swap > 0.5 ? 'Eligible investor' : 'Ineligible investor';
    const labA = swap > 0.5 ? (swap - 0.5) * 2 : 1 - swap * 2;
    text(ctx, lab, tx, ty + 70, { size: 22, weight: 500, align: 'center', color: C.ink, alpha: labA * o.targetA });
    if (swap > 0.5) badge(ctx, tx + 36, ty + 16, 15, 'check', (swap - 0.5) * 2);
    else if (o.targetA > 0) badge(ctx, tx + 36, ty + 16, 15, 'cross', o.targetA * (1 - swap * 2));
    // dotted path between check and target
    E.seg(ctx, px + 560, py + 150, tx - 150, py + 150, 1, { color: E.hexA(C.ink, 0.25), lw: 2, dash: [3, 7], dashOffset: -t * 30 });
    // outcome stamp
    if (o.rejected > 0) {
      ctx.save();
      const k = ease.outBack(clamp(o.rejected));
      ctx.translate(px + 380, py + 262);
      ctx.scale(k, k);
      chip(ctx, 'Rejected', 0, 0, { size: 22, fill: C.red, color: '#FFFFFF', align: 'center', icon: (c, x, y, s, col) => E.iconCross(c, x, y, s, col, 1) });
      ctx.restore();
    }
    if (o.passed > 0) {
      ctx.save();
      const k = ease.outBack(clamp(o.passed));
      ctx.translate(px + 380, py + 262);
      ctx.scale(k, k);
      chip(ctx, 'Checks passed', 0, 0, { size: 22, fill: C.mint, align: 'center', icon: (c, x, y, s, col) => E.iconCheck(c, x, y, s, col, 1) });
      ctx.restore();
    }
    ctx.restore();
  }

  function logView(ctx, t, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    panelTitle(ctx, 'Audit log', CONTENT.x, CONTENT.y + 10);
    const rows = [
      ['Check', 'check', Wd('l10', 'check'), '10:42:05'],
      ['Transfer', 'check', Wd('l10', 'transfer'), '10:42:06'],
      ['Rejection', 'cross', Wd('l10', 'rejection'), '10:41:52'],
    ];
    rows.forEach(([label, kind, at, time], i) => {
      const k = p(t, at - 0.1, 0.5, ease.outCubic);
      if (k <= 0) return;
      const y = CONTENT.y + 50 + i * 86;
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.translate((1 - k) * -30, 0);
      card(ctx, CONTENT.x, y, 600, 70, { r: 12, shadow: false, fill: '#FBFAF8' });
      badge(ctx, CONTENT.x + 36, y + 35, 15, kind, p(t, at, 0.6, ease.linear));
      text(ctx, label, CONTENT.x + 66, y + 43, { size: 24, weight: 500 });
      text(ctx, time, CONTENT.x + 300, y + 42, { size: 19, mono: true, color: C.muted });
      E.iconLock(ctx, CONTENT.x + 470, y + 36, 20, C.teal, 1);
      text(ctx, 'Recorded', CONTENT.x + 486, y + 42, { size: 19, mono: true, color: C.teal, weight: 500 });
      ctx.restore();
    });
    // readers
    const readers = [['Auditors', Wd('l10', 'auditors')], ['Regulators', Wd('l10', 'regulators')]];
    readers.forEach(([label, at], i) => {
      const k = p(t, at - 0.15, 0.6, ease.outBack);
      if (k <= 0) return;
      const x = CONTENT.x + 820, y = CONTENT.y + 110 + i * 150;
      E.seg(ctx, CONTENT.x + 610, CONTENT.y + 170, x - 120, y, p(t, at - 0.15, 0.5), { color: C.teal, lw: 2, dash: [4, 6] });
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      card(ctx, -120, -50, 240, 100, { r: 14, shadow: false, fill: '#FBFAF8' });
      E.iconEye(ctx, -66, 0, 44, C.ink);
      text(ctx, label, -30, 8, { size: 23, weight: 500 });
      ctx.restore();
    });
    ctx.restore();
  }

  // ------------------------------------------------------------ steps 1 to 4 and the record
  function stepScenes(ctx, t) {
    const s4 = S('s04'), s5 = S('s05'), s6 = S('s06'), s7 = S('s07'), s8 = S('s08'), s9 = S('s09'), s10 = S('s10'), s11 = S('s11');
    if (t < s4.start - 0.2 || t > S('s12').start + 1.0) return;
    const by = bandY(t);

    // window
    const winIn = p(t, Wd('l04', 'tokeniser') - 0.4, 0.9, ease.outCubic);
    const winOut = 1 - p(t, s11.start - 0.2, 0.7, ease.inOutCubic);
    const winA = winIn * winOut;
    const lift = (1 - winIn) * 60 + (1 - winOut) * -30;
    platformWindow(ctx, winA, lift);
    if (winA > 0) {
      ctx.save();
      ctx.globalAlpha *= winA;
      ctx.translate(0, lift);
      // s04: familiar platform label inside the window, where the tokens settle
      const famA = inOut(t, Wd('l04', 'tokeniser') - 0.1, s5.start + 0.2, 0.5, 0.4);
      if (famA > 0) {
        panelTitle(ctx, 'Australian farmland fund', CONTENT.x, CONTENT.y + 10, famA);
        text(ctx, 'Units, as tokens', CONTENT.x + 640, CONTENT.y + 180, { size: 22, weight: 400, color: C.muted, alpha: famA * p(t, Wd('l04', 'tokeniser') + 1.0, 0.5) });
      }
      setupView(ctx, t, inOut(t, s5.start - 0.1, s6.start + 0.1, 0.5, 0.35));
      investorsView(ctx, t, inOut(t, s6.start - 0.1, s7.start + 0.1, 0.5, 0.35));
      registerView(ctx, t, inOut(t, s7.start - 0.1, s8.start + 0.1, 0.5, 0.35), mintCounts(t));
      const rc = rulesState(t);
      rulesCheckView(ctx, t, inOut(t, s8.start - 0.1, s10.start + 0.1, 0.5, 0.35), rc);
      logView(ctx, t, inOut(t, s10.start - 0.1, s11.start + 0.2, 0.5, 0.35));
      ctx.restore();
    }

    // band contents: wallets, chain, mint, transfer, settlement
    if (by < 1079) {
      const chainY = by + 190;
      const hl = [];
      // mint flash
      const mintAt = Wd('l07', 'minted') - 0.1;
      hl.push({ x: 1117, k: inOut(t, mintAt, mintAt + 2.4, 0.3, 0.6), color: C.red });
      // settlement block
      const meetAt = Wd('l09', 'together') - 0.25;
      const finalAt = Wd('l09', 'final') - 0.15;
      hl.push({ x: 1117, k: inOut(t, meetAt - 0.2, s10.start + 1.0, 0.3, 0.6), color: t > finalAt ? C.red : C.mint, lock: p(t, finalAt, 0.6) });
      // records in s10
      ['check', 'transfer', 'rejection'].forEach((w, i) => {
        const at = Wd('l10', w);
        hl.push({ x: 1380 + i * 130, k: inOut(t, at, s11.start + 0.6, 0.3, 0.5), color: C.teal, lock: p(t, at + 0.2, 0.5) });
      });
      chainBlocks(ctx, t, by, hl);

      // wallets arrive in s06
      const walletAt = Wd('l06', 'wallet') - 0.1;
      const counts = mintCounts(t);
      const settle = settleState(t);
      [0, 1].forEach((i) => {
        const k = p(t, walletAt + i * 0.15, 0.9, ease.outCubic);
        if (k <= 0) return;
        const [x, y] = E.arcPoint(SLOT[i], WIN.y + 420, SLOT[i], by + 95, -80, k);
        const tokens = counts[i] + (i === 0 ? -settle.tokenOut : settle.tokenIn);
        walletCard(ctx, x, y, {
          alpha: clamp(k * 1.5) * (1 - p(t, S('s12').start - 0.1, 0.5)),
          tint: i === 0 ? C.mint : C.sand,
          tokens: Math.max(0, tokens),
          cash: i === 0 ? settle.cashIn : 0,
          highlight: i === 1 ? settle.glowB : settle.glowA,
        });
      });
      // empty slot for the investor who was not verified
      const emptyA = inOut(t, walletAt + 0.3, s8.start + 0.2, 0.5, 0.5);
      if (emptyA > 0) {
        ctx.save();
        ctx.globalAlpha *= emptyA;
        rr(ctx, SLOT[2] - 118, by + 95 - 42, 236, 84, 14);
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = C.slateLine;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // minted tokens fly up from the block into the wallets
      for (let j = 0; j < 6; j++) {
        const at = mintAt + 0.25 + j * 0.16;
        const k = p(t, at, 0.75, ease.inOutCubic);
        if (k <= 0 || k >= 1) continue;
        const w = j % 2;
        const [x, y] = E.arcPoint(1117, chainY, SLOT[w] - 118 + 132 + Math.floor(j / 2) * 24, by + 95, 120, k);
        token(ctx, x, y, 17 + Math.sin(k * Math.PI) * 6, { fill: C.mint, ring: C.slate, mark: C.slate, glow: 0.6, dark: true });
      }

      // transfer attempts: token travels up to the rules check and back (s08), then settles (s09)
      const fl = flightState(t, by);
      if (fl) token(ctx, fl.x, fl.y, fl.r, { fill: C.mint, ring: C.ink, mark: C.ink, glow: fl.glow, glowColor: fl.glowColor, dark: true });
      // payment and token crossing on the network
      if (settle.cross > 0 && settle.cross < 1) {
        const k = settle.cross;
        const tx = lerp(SLOT[0], SLOT[1], k), cxp = lerp(SLOT[1], SLOT[0], k);
        const yy = chainY - 50 - Math.sin(k * Math.PI) * 26;
        token(ctx, tx, yy, 20, { fill: C.mint, ring: C.slate, mark: C.slate, glow: 0.7, dark: true });
        E.iconCash(ctx, cxp, chainY - 50 + Math.sin(k * Math.PI) * 26, 46, C.slate, '#FFFFFF');
      }
      // settlement labels on the band
      const finalA = inOut(t, finalAt + 0.2, s10.start + 0.6, 0.5, 0.4);
      if (finalA > 0) chip(ctx, 'Final', 1117, chainY - 62, { size: 20, fill: C.red, color: '#FFFFFF', align: 'center', alpha: finalA, icon: (c, x, y, s, col) => E.iconLock(c, x, y, s * 0.9, col, 1) });
    }

    // the result: lines from the farmland to the tokens on the network
    if (t > s11.start - 0.5) {
      const k = p(t, Wd('l11', 'compliant') - 0.2, 0.9);
      [0, 1].forEach((i) => {
        E.seg(ctx, 1290 + (i ? 60 : -60), 610, SLOT[i] + 40, by + 52, k, { color: C.mintDeep, lw: 2.5, dash: [6, 8], dashOffset: -t * 24 });
      });
    }
  }

  function mintCounts(t) {
    const mintAt = Wd('l07', 'minted') - 0.1;
    const c = [0, 0];
    for (let j = 0; j < 6; j++) {
      const at = mintAt + 0.25 + j * 0.16 + 0.75;
      c[j % 2] += p(t, at, 0.2, ease.linear);
    }
    c.at0 = mintAt + 0.25 + 4 * 0.16 + 0.8;
    c.at1 = mintAt + 0.25 + 5 * 0.16 + 0.8;
    return c;
  }

  function rulesState(t) {
    const failAt = Wd('l08', 'ineligible') + 0.2;
    const rejAt = Wd('l08', 'rejected') - 0.1;
    const passAt = Wd('l09', 'compliant');
    const reset = S('s09').start - 0.15;
    const before = t < reset;
    return {
      rows: before
        ? [{ kind: 'cross', k: p(t, failAt, 0.5, ease.linear) }, { kind: 'none', k: 0 }]
        : [{ kind: 'check', k: p(t, passAt + 0.1, 0.5, ease.linear) }, { kind: 'check', k: p(t, passAt + 0.45, 0.5, ease.linear) }],
      failed: before ? p(t, failAt, 0.4) : 0,
      rejected: before ? p(t, rejAt, 0.6) * (1 - p(t, reset - 0.35, 0.3)) : 0,
      passed: before ? 0 : p(t, passAt + 0.85, 0.6),
      targetA: p(t, Wd('l08', 'ineligible') - 0.3, 0.5),
      targetSwap: p(t, reset, 0.6, ease.inOutCubic),
    };
  }

  /** The token on its way to the rules check and back, or on to settlement. */
  function flightState(t, by) {
    const up1 = Wd('l08', 'checked') - 0.3;
    const down1 = Wd('l08', 'rejected') + 0.35;
    const up2 = S('s09').start - 0.05;
    const down2 = Wd('l09', 'settles') - 0.2;
    const wallet = [SLOT[0] - 118 + 132 + 2 * 24, by + 95];
    const check = [CONTENT.x + 615 - 110, CONTENT.y + 44 + 150];
    if (t > up1 && t < down1 + 1.0) {
      const k1 = p(t, up1, 0.9, ease.inOutCubic);
      const k2 = p(t, down1, 0.9, ease.inOutCubic);
      if (k2 <= 0) {
        const [x, y] = E.arcPoint(wallet[0], wallet[1], check[0] + 110, check[1], 60, k1);
        return { x, y, r: lerp(17, 30, k1), glow: 0.5, glowColor: k1 >= 1 && t > Wd('l08', 'ineligible') + 0.2 ? C.red : C.mint };
      }
      const [x, y] = E.arcPoint(check[0] + 110, check[1], wallet[0], wallet[1], -40, k2);
      if (k2 >= 1) return null;
      return { x, y, r: lerp(30, 17, k2), glow: 0.4, glowColor: C.red };
    }
    if (t > up2 && t < down2 + 0.9) {
      const k1 = p(t, up2, 0.8, ease.inOutCubic);
      const k2 = p(t, down2, 0.8, ease.inOutCubic);
      if (k2 <= 0) {
        const [x, y] = E.arcPoint(wallet[0], wallet[1], check[0] + 110, check[1], 60, k1);
        return { x, y, r: lerp(17, 30, k1), glow: 0.5, glowColor: C.mint };
      }
      if (k2 >= 1) return null;
      const [x, y] = E.arcPoint(check[0] + 110, check[1], SLOT[0] + 40, by + 140, -30, k2);
      return { x, y, r: lerp(30, 20, k2), glow: 0.6, glowColor: C.mint };
    }
    return null;
  }

  function settleState(t) {
    const start = Wd('l09', 'settles') + 0.6;
    const meet = Wd('l09', 'together') + 0.4;
    const cross = p(t, start, meet - start + 0.6, ease.inOutCubic);
    return {
      cross,
      tokenOut: t > Wd('l08', 'checked') - 0.3 && t < Wd('l08', 'rejected') + 1.25 ? 1 : t > S('s09').start - 0.05 ? 1 : 0,
      tokenIn: p(t, start + (meet - start + 0.6), 0.3, ease.linear),
      cashIn: p(t, start + (meet - start + 0.6), 0.4),
      glowA: inOut(t, start + (meet - start + 0.5), start + (meet - start) + 2.2, 0.3, 0.6),
      glowB: inOut(t, start + (meet - start + 0.5), start + (meet - start) + 2.2, 0.3, 0.6),
    };
  }

  // ------------------------------------------------------------ headers and left column
  function textLayer(ctx, t) {
    const s = (id) => S(id);
    header(ctx, t, { eyebrow: 'Illustrative example', title: 'Australian farmland fund', t0: Wd('l02', 'australian') - 0.3, t1: s('s03').start + 0.2 });
    header(ctx, t, { eyebrow: 'The idea', title: 'Ownership, recorded\nas digital tokens', t0: s('s03').start + 0.15, t1: s('s04').start + 0.2 });
    header(ctx, t, { eyebrow: 'Platform and network', title: 'Tokeniser', t0: Wd('l04', 'manager') - 0.2, t1: s('s05').start + 0.15 });
    const steps = [['s05', 'Step 1', 'Set up', 's06'], ['s06', 'Step 2', 'Investors', 's07'], ['s07', 'Step 3', 'Issue', 's08'], ['s08', 'Step 4', 'Transfer', 's10']];
    steps.forEach(([id, eb, title, next]) => header(ctx, t, { eyebrow: eb, title, t0: s(id).start + 0.05, t1: s(next).start + 0.15, size: 76 }));
    header(ctx, t, { eyebrow: 'Audit trail', title: 'Recorded', t0: s('s10').start + 0.05, t1: s('s11').start + 0.15, size: 76 });
    header(ctx, t, { eyebrow: 'The result', title: 'Same farmland,\nsame fund.', t0: s('s11').start + 0.1, t1: s('s12').start + 0.2, size: 68 });

    // s04 left column
    bullet(ctx, t, Wd('l04', 'familiar') - 0.1, s('s05').start + 0.15, 'Familiar platform', 330, 'check');
    // step bullets
    bullet(ctx, t, Wd('l05', 'verified') - 0.05, s('s06').start + 0.15, 'Fund verified', 350, 'check');
    bullet(ctx, t, Wd('l05', 'encoded') - 0.05, s('s06').start + 0.15, 'Rules encoded into the token', 420, 'check');
    bullet(ctx, t, Wd('l06', 'averer') - 0.1, s('s07').start + 0.15, 'Verified through Averer', 350, 'check');
    bullet(ctx, t, Wd('l06', 'wallet') - 0.1, s('s07').start + 0.15, 'Wallet on Redbelly Network', 420, 'check');
    bullet(ctx, t, Wd('l07', 'minted') - 0.1, s('s08').start + 0.15, 'Minted on Redbelly Network', 350, 'check');
    bullet(ctx, t, Wd('l07', 'register') - 0.1, s('s08').start + 0.15, 'Register updated', 420, 'check');
    bullet(ctx, t, Wd('l08', 'checked') - 0.1, s('s09').start + 0.15, 'Checked against the rules', 350, 'check');
    bullet(ctx, t, Wd('l08', 'rejected') - 0.1, s('s09').start + 0.15, 'Ineligible investor: rejected', 420, 'cross');
    bullet(ctx, t, Wd('l09', 'settles') - 0.1, s('s10').start + 0.15, 'Settles in seconds', 350, 'check');
    bullet(ctx, t, Wd('l09', 'transfer') - 0.1, s('s10').start + 0.15, 'Transfer and payment, together', 420, 'check');
    bullet(ctx, t, Wd('l09', 'final') - 0.1, s('s10').start + 0.15, 'Final once confirmed', 490, 'check');
    bullet(ctx, t, Wd('l10', 'auditors') - 0.1, s('s11').start + 0.15, 'Ready for auditors and regulators', 350, 'check');
    bullet(ctx, t, Wd('l11', 'compliant') - 0.15, s('s12').start + 0.2, 'Now compliant tokens on Redbelly Network', 420, 'check', { size: 28 });
    bullet(ctx, t, Wd('l11', 'issued') - 0.15, s('s12').start + 0.2, 'Issued through Tokeniser', 482, 'check', { size: 28 });
  }

  // ------------------------------------------------------------ closing card
  function closing(ctx, t) {
    const s12 = S('s12').start;
    const k = p(t, s12 - 0.25, 0.9, ease.inOutCubic);
    if (k <= 0) return;
    ctx.save();
    ctx.translate(0, (1 - k) * -E.H);
    ctx.drawImage(STATIC.dark, 0, 0);
    const a1 = p(t, s12 + 0.35, 0.8);
    const lw = (IMG.tokeniserDark.width / IMG.tokeniserDark.height) * 84;
    logo(ctx, IMG.tokeniserDark, 960 - lw / 2, 330 + (1 - a1) * 20, 84, a1);
    const a2 = p(t, s12 + 0.75, 0.8);
    text(ctx, 'Built on Redbelly Network', 960, 520, { size: 30, weight: 400, color: C.onDark2, align: 'center', alpha: a2 });
    const rw = (IMG.rbDark.width / IMG.rbDark.height) * 54;
    logo(ctx, IMG.rbDark, 960 - rw / 2, 556, 54, a2);
    const a3 = p(t, s12 + 1.15, 0.8);
    text(ctx, 'tokeniser.com', 960, 720, { size: 30, weight: 500, color: C.mint, align: 'center', mono: true, alpha: a3 });
    const a4 = p(t, s12 + 1.4, 0.8);
    text(ctx, 'Illustrative example. General information only, not financial advice.', 960, 990, { size: 21, color: C.onDark3, align: 'center', alpha: a4 });
    ctx.restore();
  }

  // ------------------------------------------------------------ subtitles
  function subtitles(ctx, t) {
    const cue = D.subs.find((c) => t >= c.start - 0.12 && t <= c.end + 0.12);
    if (!cue) return;
    const a = Math.min(clamp((t - cue.start + 0.12) / 0.12), clamp((cue.end + 0.12 - t) / 0.12));
    const size = 38, lh = 50;
    const lines = cue.lines;
    const w = Math.max(...lines.map((l) => E.measure(ctx, l, size, 400))) + 56;
    const h = lines.length * lh + 26;
    const y = 1048 - h;
    ctx.save();
    ctx.globalAlpha = a;
    rr(ctx, 960 - w / 2, y, w, h, 12);
    ctx.fillStyle = 'rgba(12,19,23,0.86)';
    ctx.fill();
    lines.forEach((l, i) => text(ctx, l, 960, y + 13 + lh * (i + 1) - 13, { size, color: '#FFFFFF', align: 'center', audit: false }));
    ctx.restore();
  }

  // ------------------------------------------------------------ frame
  function renderAt(ctx, t, opts = {}) {
    ctx.save();
    ctx.clearRect(0, 0, E.W, E.H);
    ctx.drawImage(STATIC.paper, 0, 0);
    // Tokeniser logo, top left
    const la = p(t, S('s02').start + 0.1, 0.6) * (1 - p(t, S('s12').start - 0.2, 0.4));
    logo(ctx, IMG.tokeniser, 96, 58, 30, la);
    assetScenes(ctx, t);
    band(ctx, t);
    stepScenes(ctx, t);
    unitTokens(ctx, t);
    textLayer(ctx, t);
    opening(ctx, t);
    rail(ctx, t);
    closing(ctx, t);
    if (opts.subs) subtitles(ctx, t);
    ctx.restore();
  }

  /** Sound cues, read by the audio build so effects land on the same frames as the picture. */
  function sfxCues() {
    const c = [];
    const add = (t, kind, gain = 1) => c.push({ t: +t.toFixed(3), kind, gain });
    add(0.15, 'swell', 0.8);
    add(1.1, 'chime', 0.7);
    add(S('s02').start - 0.45, 'whoosh', 0.7);
    add(Wd('l02', 'investors'), 'pop', 0.5);
    add(Wd('l02', 'units') - 0.15, 'tick-run', 0.5);
    add(Wd('l02', 'separate') - 0.2, 'pop', 0.5);
    add(Wd('l02', 'updated') - 0.15, 'tick', 0.5);
    add(Wd('l03', 'digital') - 0.25, 'shimmer', 0.8);
    add(Wd('l03', 'rules'), 'tick-run', 0.45);
    add(Wd('l04', 'tokeniser') - 0.4, 'whoosh', 0.5);
    add(Wd('l04', 'underneath') - 0.15, 'deep', 0.9);
    add(S('s05').start, 'step', 0.7);
    add(Wd('l05', 'verified') - 0.1, 'check', 0.8);
    add(Wd('l05', 'wholesale') - 0.1, 'pop', 0.5);
    add(Wd('l05', 'wholesale') + 0.7, 'pop', 0.5);
    add(Wd('l05', 'encoded') - 0.1, 'shimmer', 0.6);
    add(Wd('l05', 'encoded') + 0.8, 'lock', 0.8);
    add(S('s06').start, 'step', 0.7);
    add(Wd('l06', 'verified') - 0.2, 'scan', 0.6);
    add(Wd('l06', 'wallet') - 0.1, 'drop', 0.8);
    add(S('s07').start, 'step', 0.7);
    add(Wd('l07', 'minted') - 0.1, 'mint', 1.0);
    add(Wd('l07', 'register'), 'check', 0.6);
    add(S('s08').start, 'step', 0.7);
    add(Wd('l08', 'checked') - 0.3, 'whoosh', 0.45);
    add(Wd('l08', 'ineligible') + 0.2, 'deny', 0.8);
    add(Wd('l08', 'rejected') - 0.1, 'deny-soft', 0.5);
    add(S('s09').start - 0.05, 'whoosh', 0.45);
    add(Wd('l09', 'compliant') + 0.1, 'check', 0.7);
    add(Wd('l09', 'compliant') + 0.45, 'check', 0.7);
    add(Wd('l09', 'settles') + 0.6, 'whoosh', 0.5);
    add(Wd('l09', 'together') + 0.4, 'mint', 0.8);
    add(Wd('l09', 'final') - 0.15, 'lock', 1.0);
    add(Wd('l10', 'check'), 'tick', 0.6);
    add(Wd('l10', 'transfer'), 'tick', 0.6);
    add(Wd('l10', 'rejection'), 'tick', 0.6);
    add(Wd('l10', 'auditors') - 0.15, 'pop', 0.5);
    add(S('s11').start - 0.4, 'swell', 0.6);
    add(S('s12').start - 0.25, 'whoosh', 0.6);
    add(S('s12').start + 0.35, 'chime', 0.9);
    return c.sort((a, b) => a.t - b.t);
  }

  // ------------------------------------------------------------ loading
  async function loadImage(src, recolor) {
    let url = src;
    if (recolor) {
      let svg = await (await fetch(src)).text();
      for (const [from, to] of recolor) svg = svg.split(from).join(to);
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    const img = new Image();
    img.src = url;
    await img.decode();
    // Rasterise once at a large size so logos stay sharp when scaled.
    const c = document.createElement('canvas');
    const scale = 1200 / img.width;
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  async function load(base = '..') {
    const get = async (p) => (await fetch(`${base}/${p}`)).json();
    const [timeline, words, subs, script] = await Promise.all([
      get('content/timeline.json'), get('content/words.json'), get('content/subtitles.json'), get('content/script.json'),
    ]);
    const scenes = {};
    const lines = {};
    for (const s of timeline.scenes) {
      scenes[s.id] = s;
      for (const l of s.lines) lines[l.id] = l;
    }
    D = { timeline, words, subs: subs.cues, script, scenes, lines, duration: timeline.duration };
    const fonts = [
      new FontFace('Readex Pro', `url(${base}/assets/fonts/ReadexPro-VF.woff2)`, { weight: '160 700' }),
      new FontFace('JetBrains Mono', `url(${base}/assets/fonts/JetBrainsMono-VF.woff2)`, { weight: '100 800' }),
    ];
    for (const f of fonts) document.fonts.add(await f.load());
    IMG = {
      tokeniser: await loadImage(`${base}/assets/brand/tokeniser-logo.svg`, [['width="100%"', 'width="1090"'], ['height="100%"', 'height="180"']]),
      tokeniserDark: await loadImage(`${base}/assets/brand/tokeniser-logo-on-dark.png`),
      rbDark: await loadImage(`${base}/assets/brand/redbelly-horizontal-negative.svg`, [['viewBox="0 0 1080 300"', 'width="1080" height="300" viewBox="0 0 1080 300"']]),
    };
    buildStatic();
    return D;
  }

  window.Scenes = { load, renderAt, sfxCues, get data() { return D; } };
})();
