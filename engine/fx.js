/* Zarrebin engine — scene background layer (scene.bg), pinned framed pictures (scene.pins) and image-bound effects (item.fx / pin.fx).
   Loaded BEFORE v2.js; it only uses v2.js globals (ctx, W, H, B, FMT, EDIT, REC, IM, drawImg, rng, ramp, spr, ...) when called.
   Every function is a pure function of t (no wall clock), so parallel chunk rendering stays frame-exact. All randomness is seeded.

   scene.bg   = { src:'library/x__1.webp', motion:'down|up|left|right|zoom|pop|fill|fillin|scroll|cover', hold:false,
                  speed:1 (.2-3), size:1 (.2-3), count:3 (1-20, fill up to 40, scroll up to 12), opacity:.9, blur:0 (px), start:0 (s after scene start),
                  tilt:.25 (0-1: random angle range, 1 = any angle incl. upside down; cover default 1), seed:0 (change = new random layout),
                  dir:'down|up|left|right|dr|dl|ur|ul' (scroll only), sound:'whoosh|swipe|airy|low|riser|pop|thud|none', vol:60 (0-100),
                  lay:{ v:{ "<i>":{dx,dy,sz,rot} }, h:{...} } (owner's hand placement of copy i, fractions of the canvas, edited in the app preview) }
              Placement is random (seeded, evenly spread); `cover` fills the whole screen with random-angle pictures that arrive slowly, speed up, and
              slow down again until nothing of the scene is visible underneath (opacity / blur / count are ignored there; size and speed apply).
   scene.pins = [ { src, frame:'none|polaroid|plain|stamp|film|torn|burnt|wood|gold', attach:'none|pin-red|pin-blue|pin-brass|tape-corners|tape-top|tape-4|washi|clip|nail|magnet|putty|string',
                    card:'white|cream|kraft|black|rose', photo:'cream|sky|mint|rose|sand|night|kraft|white|#hex', curl:false (lifted corner), shadow:.6 (0-1), x,y (0-1, canvas fractions),
                    sz:1, rot (rad), start (0 = there from the first frame, no entrance), seed, fx:[...], lay:{ v:{dx,dy,sz,rot}, h:{...} } } ]
              A pin is part of the wall: no entrance animation, no float, no squash. (old frame values 'tape' / 'pin' still work: plain card + that fastener.)
   item.fx / pin.fx = [ { type, start:s after the picture appears, dur, anchor:[x,y] (fractions of the picture), vol:0-100, + per type:
        steam|smoke : intensity, height, speed            page-turn : mode:'in|out', hinge:'center|left|right'
        tea-ring    : size, tone:'tea|coffee|wine', amount, seed   aged : dur, amount           burn : dur, amount, ember:false
        sparkle     : count, size                         shine : dur, every, width            glow : color, radius, rate, dur
        wiggle      : amp (rad), freq (Hz), dur           pulse : amp, rate                    crack : size, rays, seed } ]
   The anchor defaults to the picture itself (steam/smoke: top-centre of the opaque shape; tea-ring: lower right; others: centre), measured from the alpha channel.
   library/anchors.json (optional) pins a point per picture id: { "coffee-cup": { "steam": [0.5, 0.2], "default": [0.5, 0.5] } }. */
window.FXL = (() => {
  const INFO = {}, SL = {}, PAT = {}, CV = {}, CH = {}, SCR = {}, FLD = {}; let ANCH = {};
  const mod = (a, b) => ((a % b) + b) % b, itemId = s => String(s || '').split('/').pop().split('__')[0];
  const num = (v, d, a, b) => { v = parseFloat(v); if (!isFinite(v)) v = d; return Math.max(a, Math.min(b, v)) };
  const hsh = (a, b = 0, c = 0) => { let x = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B) ^ Math.imul((c | 0) + 0x165667B1, 0xC2B2AE35); x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D); x ^= x >>> 12; x = Math.imul(x, 0x297A2D39); x ^= x >>> 15; return (x >>> 0) / 4294967296 };   // stateless seeded random in [0,1)
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c };
  const TYPES = ['steam', 'smoke', 'page-turn', 'tea-ring', 'aged', 'burn', 'sparkle', 'shine', 'glow', 'wiggle', 'pulse', 'crack', 'fold'];

  /* ---------- picture info: bounding box + top-centre + average colour + a coarse inside mask (fractions of the image) ---------- */
  function measure(im) {
    const w = im.width, h = im.height, k = Math.min(1, 160 / Math.max(w, h)), cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k)), d = { w, h, bb: [0, 0, 1, 1], topX: .5, avg: [128, 128, 128], mask: null };
    try {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data; let x0 = cw, y0 = ch, x1 = -1, y1 = -1, sr = 0, sg = 0, sb = 0, sn = 0; const mk = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = (y * cw + x) * 4, a = px[o + 3]; if (a > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y } if (a > 200) { sr += px[o]; sg += px[o + 1]; sb += px[o + 2]; sn++ } if (a > 128) mk[y * cw + x] = 1 }
      if (x1 >= 0) {
        d.bb = [x0 / cw, y0 / ch, (x1 + 1) / cw, (y1 + 1) / ch]; d.mask = { w: cw, h: ch, a: mk }; if (sn) d.avg = [sr / sn | 0, sg / sn | 0, sb / sn | 0];
        const band = Math.max(1, Math.round((y1 - y0 + 1) * .12)); let sx = 0, n = 0;
        for (let y = y0; y < y0 + band; y++) for (let x = x0; x <= x1; x++) if (px[(y * cw + x) * 4 + 3] > 40) { sx += x; n++ }
        if (n) d.topX = (sx / n + .5) / cw
      }
    } catch (e) { /* tainted canvas (image came from another origin): keep the whole-image defaults */ }
    return d
  }
  async function prepare(srcs) {
    try { const r = await fetch('../library/anchors.json?' + Date.now()); if (r.ok) ANCH = await r.json() } catch (e) { }
    (srcs || []).forEach(src => { const im = IM[src]; if (im && !INFO[src]) INFO[src] = measure(im) });
    buildPins()
  }
  function anchorOf(it, f, type, inf) {
    if (Array.isArray(f.anchor) && f.anchor.length === 2) return [num(f.anchor[0], .5, -.5, 1.5), num(f.anchor[1], .5, -.5, 1.5)];
    const a = ANCH[itemId(it.src)]; if (a) { if (Array.isArray(a[type])) return a[type]; if (Array.isArray(a.default)) return a.default }
    const [x0, y0, x1, y1] = inf.bb;
    if (type === 'steam' || type === 'smoke') return [inf.topX, y0 + (y1 - y0) * .04];
    if (type === 'tea-ring') return [x0 + (x1 - x0) * .7, y0 + (y1 - y0) * .72];
    return [(x0 + x1) / 2, (y0 + y1) / 2]
  }
  const T0 = (it, f, d) => it.t + (f.start == null || f.start === '' || isNaN(+f.start) ? d : +f.start);
  /* run fn in the picture's own pixel space (origin = image centre), following every move / zoom / squash the picture has */
  function local(st, inf, fn) { const s = st.size / Math.max(inf.w, inf.h); ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot); ctx.scale(s * st.sx, s * st.sy); ctx.globalAlpha = st.a; fn(s); ctx.restore() }
  const unitOf = inf => Math.min((inf.bb[2] - inf.bb[0]) * inf.w, (inf.bb[3] - inf.bb[1]) * inf.h);
  const envOf = (tau, dur, a = .25, b = .3) => ramp(tau, 0, a) * (dur > 0 ? 1 - ramp(tau, dur - b, dur) : 1);
  const shadowFor = s => { if (VOX) { ctx.shadowColor = 'rgba(20,25,45,.32)'; ctx.shadowOffsetX = 6 / s; ctx.shadowOffsetY = 22 / s; ctx.shadowBlur = 34 / s } else { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowOffsetX = 16 / s; ctx.shadowOffsetY = 20 / s; ctx.shadowBlur = 0 } };

  /* ---------- scratch / cached layers (image pixel space, at most 640 px) ---------- */
  function scratch(key, inf) {
    const k = Math.min(1, 640 / Math.max(inf.w, inf.h)), cw = Math.max(2, Math.round(inf.w * k)), ch = Math.max(2, Math.round(inf.h * k)); let s = SCR[key];
    if (!s || s.c.width !== cw || s.c.height !== ch) { const c = cnv(cw, ch); s = SCR[key] = { c, g: c.getContext('2d') } }
    const g = s.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none'; g.shadowColor = 'transparent'; g.clearRect(0, 0, s.c.width, s.c.height); s.k = s.c.width / inf.w; return s
  }
  const clipTo = (s, im) => { s.g.setTransform(1, 0, 0, 1, 0, 0); s.g.globalCompositeOperation = 'destination-in'; s.g.drawImage(im, 0, 0, s.c.width, s.c.height); s.g.globalCompositeOperation = 'source-over' };
  const putLayer = (c, inf, a) => { ctx.globalAlpha *= a; ctx.drawImage(c, -inf.w / 2, -inf.h / 2, inf.w, inf.h) };
  function stat(key, inf, draw) {   // a layer that never changes: drawn once, in image pixel space, then reused
    if (CH[key]) return CH[key]; const k = Math.min(1, 640 / Math.max(inf.w, inf.h)), c = cnv(inf.w * k, inf.h * k), g = c.getContext('2d'); g.scale(c.width / inf.w, c.height / inf.h); draw(g); return CH[key] = c
  }

  /* ---------- steam / smoke ---------- */
  function puff(x, y, r, a, dark) {
    if (a < .01) return; let g;
    if (dark) { g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(48,44,42,${a * .6})`); g.addColorStop(.6, `rgba(60,56,52,${a * .28})`); g.addColorStop(1, 'rgba(60,56,52,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); return }
    g = ctx.createRadialGradient(x, y + r * .12, 0, x, y + r * .12, r * 1.05); g.addColorStop(0, `rgba(70,60,50,${a * .2})`); g.addColorStop(1, 'rgba(70,60,50,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + r * .12, r * 1.05, 0, TAU); ctx.fill();   // soft grey under-layer: steam stays visible on light paper
    g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.55, `rgba(255,255,255,${a * .45})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  function steam(it, t, st, f, inf, dark) {
    const tau = t - T0(it, f, .3), dur = +f.dur > 0 ? +f.dur : null; if (tau < 0 || (dur && tau > dur)) return;
    let env = ramp(tau, 0, .9); if (dur) env *= 1 - ramp(tau, dur - .8, dur);
    const ik = num(f.intensity, 1, .2, 2.5), sp = num(f.speed, 1, .3, 3), [ax, ay] = anchorOf(it, f, dark ? 'smoke' : 'steam', inf), u = unitOf(inf), w = inf.w, h = inf.h;
    const n = Math.round(Math.max(2, Math.min(6, 1.5 + 1.5 * ik))), P = 11, rise = u * num(f.height, dark ? .5 : .34, .12, 1.4), spread = u * (dark ? .13 : .09), r0 = u * (dark ? .055 : .042);
    local(st, inf, () => {
      for (let wi = 0; wi < n; wi++) {
        const off = (n === 1 ? 0 : wi / (n - 1) - .5) * spread * 2;
        for (let k = 0; k < P; k++) {
          const life = mod(tau * .42 * sp + wi * .318 + k / P, 1), y = (ay - .5) * h - life * rise, sway = Math.sin(life * 6.2 + wi * 2.3 + tau * .9) * u * (dark ? .09 : .06) * (.25 + life);
          puff((ax - .5) * w + off + sway, y, r0 * (.5 + (dark ? 2.1 : 1.5) * life), (dark ? .5 : .36) * Math.pow(Math.sin(Math.PI * life), 1.3) * env * Math.min(ik, 1.2), dark)
        }
      }
    })
  }

  /* ---------- page turn: the picture itself flips like a sheet of paper (cream paper on its back).
     hinge 'center' (default) turns it like a card around its middle, 'left' / 'right' swings it from that side like a page ---------- */
  function pageTurn(it, t, st, f, inf) {
    const im = IM[it.src]; if (!im) return false;
    const dur = num(f.dur, 1.1, .3, 4), mode = f.mode === 'out' ? 'out' : 'in', tau = t - T0(it, f, 0), hinge = f.hinge === 'left' || f.hinge === 'right' ? f.hinge : 'center';
    if (mode === 'in' && tau >= dur) return false;               // finished: the picture is drawn the normal way
    if (mode === 'out') { if (tau < 0) return false; if (tau >= dur) return true }   // turned away: nothing left to draw
    const p = eio(clamp(tau / dur)), th0 = hinge === 'center' ? Math.PI : Math.PI * .84, th = mode === 'in' ? th0 * (1 - p) : th0 * p;   // 0 = flat front face, PI = flat back face
    const w = inf.w, h = inf.h, [bx0, by0, bx1, by1] = inf.bb, bw = (bx1 - bx0) * w, bh = (by1 - by0) * h, c = Math.cos(th), sn = Math.sin(th), N = 28, cy = ((by0 + by1) / 2 - .5) * h;
    const cx = ((bx0 + bx1) / 2 - .5) * w, hx = hinge === 'left' ? bx0 * w - w / 2 : hinge === 'right' ? bx1 * w - w / 2 : cx, dx = hinge === 'right' ? -1 : 1;
    const X = d => hinge === 'center' ? cx + (d - .5) * bw * c : hx + dx * d * bw * c;     // x of the slice at d (0..1 across the sheet, counted from the hinge side)
    const Vs = d => hinge === 'center' ? 1 + .16 * (2 * d - 1) * sn : 1 + .16 * d * sn;   // perspective: the edge nearer to the viewer is taller
    local(st, inf, () => {
      if (mode === 'out') ctx.globalAlpha *= 1 - ramp(p, .78, 1);
      if (c >= 0) {
        for (let i = 0; i < N; i++) {
          const d0 = i / N, d1 = (i + 1) / N, xa = X(d0), xb = X(d1), v = Vs((d0 + d1) / 2), sx = hinge === 'right' ? bx1 * w - d1 * bw : bx0 * w + d0 * bw;
          ctx.drawImage(im, sx, 0, bw / N, h, Math.min(xa, xb), cy + (-h / 2 - cy) * v, Math.abs(xb - xa) + .8, h * v)
        }
      } else {
        const g = ctx.createLinearGradient(X(0), 0, X(1) + (X(1) === X(0) ? 1 : 0), 0); g.addColorStop(0, '#f3e9d1'); g.addColorStop(1, '#d9ccab');
        ctx.beginPath(); for (let i = 0; i <= N; i++) { const d = i / N, v = Vs(d); i ? ctx.lineTo(X(d), cy - bh * v / 2) : ctx.moveTo(X(d), cy - bh * v / 2) }
        for (let i = N; i >= 0; i--) { const d = i / N; ctx.lineTo(X(d), cy + bh * Vs(d) / 2) }
        ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(2, h * .004); ctx.strokeStyle = 'rgba(80,55,25,.45)'; ctx.lineJoin = 'round'; ctx.stroke()
      }
    });
    return true
  }

  /* ---------- aged: the picture slowly turns yellow like old paper (sepia, dark rim, foxing spots, creases, scratches) ---------- */
  function agedLayer(src, inf) {
    return stat('aged|' + src, inf, g => {
      const im = IM[src], w = inf.w, h = inf.h, u = Math.min(w, h), r = rng(hsh(w, h, 7) * 1e6 | 0);
      g.filter = 'sepia(.9) saturate(1.5) contrast(.9) brightness(.98)'; g.drawImage(im, 0, 0, w, h); g.filter = 'none'; g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(222,176,58,.26)'; g.fillRect(0, 0, w, h);
      const v = g.createRadialGradient(w / 2, h / 2, u * .22, w / 2, h / 2, Math.hypot(w, h) * .55); v.addColorStop(0, 'rgba(90,50,8,0)'); v.addColorStop(1, 'rgba(90,50,8,.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, rad = u * (.008 + .028 * r()), f = g.createRadialGradient(x, y, 0, x, y, rad); f.addColorStop(0, `rgba(110,60,15,${.14 + .2 * r()})`); f.addColorStop(1, 'rgba(110,60,15,0)'); g.fillStyle = f; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill() }
      const cx = w * (.36 + .28 * r()), cy = h * (.36 + .28 * r()); g.lineWidth = Math.max(1, u * .003);
      [[cx, 0, cx + (r() - .5) * 20, h], [0, cy, w, cy + (r() - .5) * 20]].forEach(([x0, y0, x1, y1]) => { g.strokeStyle = 'rgba(70,40,10,.2)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = 'rgba(255,240,200,.22)'; g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x1 + 2, y1 + 2); g.stroke() });
      g.lineWidth = Math.max(.8, u * .0018); for (let i = 0; i < 16; i++) { const x = r() * w, y = r() * h, l = u * (.03 + .09 * r()), a = r() * TAU; g.strokeStyle = `rgba(255,245,215,${.16 + .22 * r()})`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke() }
    })
  }
  function agedOver(it, t, st, f, inf) {
    const tau = t - T0(it, f, 0); if (tau < 0) return; const q = eio(clamp(tau / num(f.dur, 1.2, .05, 8))) * num(f.amount, .85, .1, 1);
    local(st, inf, () => putLayer(agedLayer(it.src, inf), inf, q))
  }

  /* ---------- tea-ring: a cup left a stain on the picture (stamped on, clipped to the picture's own shape) ---------- */
  function ring(it, t, st, f, inf) {
    const tau = t - T0(it, f, .2); if (tau < 0) return;
    const [ax, ay] = anchorOf(it, f, 'tea-ring', inf), u = unitOf(inf), R = u * num(f.size, .22, .08, .7), tone = f.tone || 'tea', seed = f.seed | 0, im = IM[it.src];
    const lay = stat(['ring', it.src, ax.toFixed(3), ay.toFixed(3), R | 0, tone, seed].join('|'), inf, g => {
      const col = { tea: [150, 86, 28], coffee: [70, 38, 14], wine: [120, 18, 44] }[tone] || [150, 86, 28], c = a => `rgba(${col[0]},${col[1]},${col[2]},${a})`, cx = ax * inf.w, cy = ay * inf.h;
      const fg = g.createRadialGradient(cx, cy, 0, cx, cy, R); fg.addColorStop(0, c(.05)); fg.addColorStop(.85, c(.15)); fg.addColorStop(1, c(.2)); g.fillStyle = fg; g.beginPath(); g.ellipse(cx, cy, R, R * .93, 0, 0, TAU); g.fill();
      const gap = hsh(seed, 7) * TAU, gl = .4 + hsh(seed, 8) * .5; g.lineCap = 'round';
      for (let a = 0; a < TAU; a += .06) { if (mod(a - gap, TAU) < gl) continue; const n = hsh(seed, Math.round(a * 20), 3); g.strokeStyle = c(.3 + .34 * n); g.lineWidth = R * (.045 + .06 * n); g.beginPath(); g.ellipse(cx, cy, R * (1 + .012 * Math.sin(a * 3 + seed)), R * .93 * (1 + .012 * Math.cos(a * 2)), 0, a, a + .075); g.stroke() }
      g.strokeStyle = c(.3); g.lineWidth = R * .012; g.beginPath(); g.ellipse(cx, cy, R * .9, R * .93 * .9, 0, gap + gl, gap + TAU); g.stroke();
      g.strokeStyle = c(.12); g.lineWidth = R * .02; g.beginPath(); g.ellipse(cx, cy, R * 1.07, R * .93 * 1.07, 0, gap + gl * .5, gap + TAU - .3); g.stroke();
      for (let i = 0; i < 3; i++) { const a = hsh(seed, 20 + i) * TAU, r = R * (1.06 + .14 * hsh(seed, 30 + i)), sz = R * (.018 + .04 * hsh(seed, 40 + i)); g.fillStyle = c(.38); g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, sz, 0, TAU); g.fill() }
      g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0, inf.w, inf.h)
    });
    const q = eoc(tau / .28), px = (ax - .5) * inf.w, py = (ay - .5) * inf.h;
    local(st, inf, () => { ctx.translate(px, py); const k = 1.16 - .16 * q; ctx.scale(k, k); ctx.translate(-px, -py); putLayer(lay, inf, q * num(f.amount, .9, .1, 1)) })
  }

  /* ---------- burn: the edges of the picture char and glow, then crumble away (a ragged burning front moving inwards) ---------- */
  function vnoise(gw, gh, cell, seed) {
    const lw = Math.ceil(gw / cell) + 2, lh = Math.ceil(gh / cell) + 2, L = new Float32Array(lw * lh); for (let i = 0; i < L.length; i++) L[i] = hsh(seed, i, 99);
    const o = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, ux = fx - ix, uy = fy - iy, sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy), a = L[iy * lw + ix], b = L[iy * lw + ix + 1], c = L[(iy + 1) * lw + ix], d = L[(iy + 1) * lw + ix + 1]; o[y * gw + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy }
    return o
  }
  function fieldOf(key, im) {   // depth-from-the-edge field of a picture (low resolution) + a ragged noise field, built once
    if (FLD[key]) return FLD[key];
    const w = im.width, h = im.height, n = 168, pad = .14 * Math.max(w, h), kf = n / (Math.max(w, h) + 2 * pad), gw = Math.round((w + 2 * pad) * kf), gh = Math.round((h + 2 * pad) * kf);
    const c = cnv(gw, gh), g = c.getContext('2d', { willReadFrequently: true }); g.filter = `blur(${(Math.min(gw, gh) * .07).toFixed(1)}px)`; g.drawImage(im, pad * kf, pad * kf, w * kf, h * kf); g.filter = 'none';
    const px = g.getImageData(0, 0, gw, gh).data, d = new Float32Array(gw * gh); for (let i = 0; i < d.length; i++) { const a = px[i * 4 + 3] / 255; d[i] = a > .5 ? Math.min(1, (a - .5) * 2.2) : 0 }
    const sd = hsh(w, h, 5) * 1e6 | 0, n1 = vnoise(gw, gh, 9, sd), n2 = vnoise(gw, gh, 3.5, sd + 1), nz = new Float32Array(gw * gh); for (let i = 0; i < nz.length; i++) nz[i] = .62 * n1[i] + .38 * n2[i];
    const ov = cnv(gw, gh), ho = cnv(gw, gh), og = ov.getContext('2d'), hg = ho.getContext('2d');
    return FLD[key] = { gw, gh, pad, kf, d, nz, ov, ho, og, hg, od: og.createImageData(gw, gh), hd: hg.createImageData(gw, gh) }
  }
  const sm = (x, a, b) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x) };
  /* g already holds the picture (image space scaled by sc = canvas px per image px); burns it: scorch + char + ember overlay, then the burnt-away hole */
  function renderBurn(F, g, inf, sc, p, ember, flick) {
    const o = F.od.data, hh = F.hd.data, d = F.d, nz = F.nz, n = F.gw * F.gh;
    for (let i = 0; i < n; i++) {
      const s = d[i] + (nz[i] - .5) * .5 - p, k = i * 4;
      const hole = s < -.015 ? 1 : s > .015 ? 0 : .5 - s / .03;
      const aS = s > -.02 && s < .4 ? .7 * (1 - sm(s, .05, .38)) : 0, aC = s < .15 ? 1 - sm(s, .03, .13) : 0, aE = ember * Math.max(0, 1 - Math.abs(s - .075) / .05) * flick * (.7 + .5 * nz[i]);
      let r = 62, gr = 34, b = 12, a = aS; const a1 = aC + a * (1 - aC); if (a1 > 0) { r = (24 * aC + r * a * (1 - aC)) / a1; gr = (16 * aC + gr * a * (1 - aC)) / a1; b = (12 * aC + b * a * (1 - aC)) / a1 } a = a1;
      if (aE > 0) { const ee = Math.min(1, aE), a2 = ee + a * (1 - ee), er = 255, eg = 120 + 90 * Math.max(0, 1 - Math.abs(s - .075) / .02), eb = 24; r = (er * ee + r * a * (1 - ee)) / a2; gr = (eg * ee + gr * a * (1 - ee)) / a2; b = (eb * ee + b * a * (1 - ee)) / a2; a = a2 }
      o[k] = r; o[k + 1] = gr; o[k + 2] = b; o[k + 3] = a * 255; hh[k] = hh[k + 1] = hh[k + 2] = 0; hh[k + 3] = hole * 255
    }
    F.og.putImageData(F.od, 0, 0); F.hg.putImageData(F.hd, 0, 0);
    const x0 = -F.pad * sc, w = F.gw / F.kf * sc, h = F.gh / F.kf * sc;
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.globalCompositeOperation = 'source-atop'; g.drawImage(F.ov, x0, x0, w, h); g.globalCompositeOperation = 'destination-out'; g.drawImage(F.ho, x0, x0, w, h); g.globalCompositeOperation = 'source-over'
  }
  function burn(it, t, st, f, inf, fxs) {
    const tau = t - T0(it, f, .3), dur = num(f.dur, 2.2, .3, 8), amt = num(f.amount, .5, .08, 1), p = eio(clamp(tau / dur)) * amt * .95; if (p < .004) return false;
    const im = IM[it.src], s = scratch('bn|' + it.src, inf), g = s.g; g.drawImage(im, 0, 0, s.c.width, s.c.height);
    const ag = fxs.find(x => x.type === 'aged'); if (ag) { const q = eio(clamp((t - T0(it, ag, 0)) / num(ag.dur, 1.2, .05, 8))) * num(ag.amount, .85, .1, 1); if (q > 0) { g.globalAlpha = q; g.drawImage(agedLayer(it.src, inf), 0, 0, s.c.width, s.c.height); g.globalAlpha = 1 } }
    renderBurn(fieldOf('b|' + it.src, im), g, inf, s.k, p, f.ember === false ? 0 : 1, .75 + .25 * Math.sin(t * 19) * Math.sin(t * 7.3 + 1));
    local(st, inf, k => { shadowFor(k); if (VOX) ctx.filter = 'sepia(.1) saturate(1.05) contrast(1.05)'; ctx.drawImage(s.c, -inf.w / 2, -inf.h / 2, inf.w, inf.h) });
    return true
  }

  /* ---------- sparkle: little twinkling glints on the shape of the picture ---------- */
  function sparkleFx(it, t, st, f, inf) {
    const tau = t - T0(it, f, .2); if (tau < 0) return; const n = Math.round(num(f.count, 5, 1, 14)), u = unitOf(inf), r0 = u * num(f.size, .11, .04, .3), env = envOf(tau, +f.dur > 0 ? +f.dur : 0, .3, .5), [x0, y0, x1, y1] = inf.bb, m = inf.mask;
    local(st, inf, () => {
      for (let i = 0; i < n; i++) {
        let px = (x0 + x1) / 2, py = (y0 + y1) / 2; for (let j = 0; j < 30; j++) { const qx = x0 + (x1 - x0) * hsh(i, j, 11), qy = y0 + (y1 - y0) * hsh(i, j, 12); if (!m || m.a[((qy * m.h) | 0) * m.w + ((qx * m.w) | 0)]) { px = qx; py = qy; break } }
        const b = Math.pow(Math.max(0, Math.sin(tau * (.55 + hsh(i, 0, 5) * .6) * TAU + hsh(i, 0, 6) * TAU)), 3) * env; if (b < .03) continue;
        const X = (px - .5) * inf.w, Y = (py - .5) * inf.h, r = r0 * (.45 + .8 * b), g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 1.7); g.addColorStop(0, `rgba(255,244,190,${.55 * b})`); g.addColorStop(1, 'rgba(255,244,190,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 1.7, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(X, Y); ctx.rotate(.3 * hsh(i, 0, 7)); ctx.beginPath(); for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2; ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.lineTo(Math.cos(ang + Math.PI / 4) * r * .18, Math.sin(ang + Math.PI / 4) * r * .18) } ctx.closePath(); ctx.fillStyle = `rgba(255,255,255,${Math.min(1, b * 1.2)})`; ctx.fill(); ctx.restore()
      }
    })
  }

  /* ---------- shine: a light streak sweeps across the picture ---------- */
  function shine(it, t, st, f, inf) {
    const dur = num(f.dur, .9, .2, 4), every = num(f.every, 0, 0, 12); let tau = t - T0(it, f, .3); if (tau < 0) return; if (every > 0) tau = mod(tau, dur + every); if (tau > dur) return;
    const p = eio(tau / dur), im = IM[it.src], s = scratch('sh|' + it.src, inf), g = s.g; g.scale(s.k, s.k); g.translate(inf.w / 2, inf.h / 2); g.rotate(.45);
    const bw = inf.w * .26 * num(f.width, 1, .4, 2.5), x = lerp(-(inf.w * .75 + bw), inf.w * .75 + bw, p), gr = g.createLinearGradient(x - bw, 0, x + bw, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-inf.w, -inf.h, inf.w * 2, inf.h * 2); clipTo(s, im);
    local(st, inf, () => putLayer(s.c, inf, 1))
  }

  /* ---------- glow: a soft coloured halo that breathes (drawn behind the picture) ---------- */
  function glow(it, t, st, f, inf) {
    const tau = t - T0(it, f, 0); if (tau < 0) return; const a = envOf(tau, +f.dur > 0 ? +f.dur : 0, .4, .5) * num(f.amount, 1, .1, 1), pulse = .75 + .25 * Math.sin(tau * TAU * num(f.rate, .8, .1, 4)), im = IM[it.src];
    local(st, inf, () => { ctx.shadowColor = f.color || '#ffd24a'; ctx.shadowBlur = num(f.radius, 46, 10, 140) * pulse; ctx.globalAlpha *= a; ctx.drawImage(im, -inf.w / 2, -inf.h / 2); ctx.drawImage(im, -inf.w / 2, -inf.h / 2) })
  }

  /* ---------- wiggle / pulse: the picture itself shakes or beats (changes how the base picture is drawn) ---------- */
  function motion(it, t, f, o) {
    const tau = t - T0(it, f, 0); if (tau < 0) return; const dur = +f.dur > 0 ? +f.dur : 0, env = envOf(tau, dur, .15, .3);
    if (f.type === 'wiggle') o.dr += Math.sin(tau * TAU * num(f.freq, 3.2, .5, 10)) * num(f.amp, .07, .01, .5) * env;
    else o.k *= 1 + num(f.amp, .07, .01, .5) * Math.pow(Math.max(0, Math.sin(tau * TAU * num(f.rate, 1.2, .3, 4))), 3) * env
  }

  /* ---------- crack: glass-like cracks spread out of one point ---------- */
  function crackGeo(key, R, n, seed) {
    if (CH[key]) return CH[key]; const rays = [];
    for (let i = 0; i < n; i++) {
      const a0 = i * TAU / n + (hsh(seed, i, 1) - .5) * .5, len = R * (.55 + .45 * hsh(seed, i, 2)), m = 7; let a = a0, x = 0, y = 0; const pts = [[0, 0]], br = [];
      for (let k = 1; k <= m; k++) { a += (hsh(seed, i, 10 + k) - .5) * .6; x += Math.cos(a) * len / m; y += Math.sin(a) * len / m; pts.push([x, y]); if (k > 2 && k < m && hsh(seed, i, 30 + k) < .4) { const ba = a + (hsh(seed, i, 50 + k) < .5 ? -1 : 1) * (.5 + .5 * hsh(seed, i, 70 + k)), bl = len / m * (1.2 + 1.5 * hsh(seed, i, 90 + k)); br.push([[x, y], [x + Math.cos(ba) * bl, y + Math.sin(ba) * bl]]) } }
      rays.push({ pts, br })
    }
    const rings = [.13, .3].map((r, j) => { const pts = []; for (let k = 0; k <= 22; k++) { const a = k * TAU / 22, rr = R * r * (1 + (hsh(seed, k, 120 + j) - .5) * .25); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]) } return pts });
    return CH[key] = { rays, rings }
  }
  function strokePartial(g, pts, p) {
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); let rest = L * p; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && rest > 0; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), q = Math.min(1, rest / l); g.lineTo(lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)); rest -= l } g.stroke()
  }
  function crack(it, t, st, f, inf) {
    const tau = t - T0(it, f, .3), dur = +f.dur > 0 ? +f.dur : 0; if (tau < 0 || (dur && tau > dur + .3)) return;
    const [ax, ay] = anchorOf(it, f, 'crack', inf), u = unitOf(inf), R = u * num(f.size, .55, .2, 1.2), geo = crackGeo(['crack', it.src, ax.toFixed(2), ay.toFixed(2), R | 0, f.rays | 0, f.seed | 0].join('|'), R, Math.round(num(f.rays, 8, 4, 14)), f.seed | 0);
    const p = eoc(tau / .38), s = scratch('cr|' + it.src, inf), g = s.g, lw = Math.max(1.6, u * .007); g.scale(s.k, s.k); g.translate(ax * inf.w, ay * inf.h); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? 'rgba(255,255,255,.92)' : 'rgba(20,20,34,.5)'; g.lineWidth = pass ? lw : lw * 2.6;
      geo.rays.forEach(r => { strokePartial(g, r.pts, p); r.br.forEach(b => strokePartial(g, b, ramp(p, .35, 1))) });
      geo.rings.forEach((pts, j) => { g.globalAlpha = ramp(p, .3 + j * .2, .8 + j * .2); strokePartial(g, pts, 1); g.globalAlpha = 1 })
    }
    clipTo(s, IM[it.src]); local(st, inf, () => putLayer(s.c, inf, dur ? 1 - ramp(tau, dur, dur + .3) : 1))
  }

  /* ---------- fold: crease lines (one across, a cross, or a diagonal too) with a light and a dark edge, clipped to the picture ---------- */
  function fold(it, t, st, f, inf) {
    const tau = t - T0(it, f, 0); if (tau < 0) return; const n = Math.round(num(f.folds, 2, 1, 3)), im = IM[it.src];
    const lay = stat(['fold', it.src, n].join('|'), inf, g => {
      const [x0, y0, x1, y1] = inf.bb, X0 = x0 * inf.w, Y0 = y0 * inf.h, bw = (x1 - x0) * inf.w, bh = (y1 - y0) * inf.h, wd = Math.min(bw, bh) * .035, ls = [[X0, Y0 + bh / 2, X0 + bw, Y0 + bh / 2]]; if (n >= 2) ls.push([X0 + bw / 2, Y0, X0 + bw / 2, Y0 + bh]); if (n >= 3) ls.push([X0, Y0, X0 + bw, Y0 + bh]);
      ls.forEach(([a, b, c, d]) => { const nx = -(d - b), ny = c - a, L = Math.hypot(nx, ny), ux = nx / L * wd, uy = ny / L * wd, mx = (a + c) / 2, my = (b + d) / 2, gr = g.createLinearGradient(mx - ux, my - uy, mx + ux, my + uy);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.42, 'rgba(0,0,0,.2)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(.58, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.strokeStyle = gr; g.lineWidth = wd * 2; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke() });
      g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0, inf.w, inf.h)
    });
    local(st, inf, () => putLayer(lay, inf, num(f.amount, .7, .1, 1)))
  }

  /* called by drawItem / pins: base(o) draws the picture the normal way (o = {k, dr}: scale / rotation added by wiggle or pulse);
     page-turn and burn replace it while they run, the rest is drawn over it */
  function item(it, t, st0, base) {
    const inf = INFO[it.src], fxs = (it.fx || []).filter(f => f && TYPES.includes(f.type));
    if (!inf || !fxs.length) { base(); return }
    const o = { k: 1, dr: 0 }; fxs.forEach(f => { if (f.type === 'wiggle' || f.type === 'pulse') motion(it, t, f, o) });
    const st = o.k === 1 && !o.dr ? st0 : { ...st0, size: st0.size * o.k, rot: st0.rot + o.dr };
    fxs.forEach(f => { if (f.type === 'glow') glow(it, t, st, f, inf) });
    let done = false, flat = true; const pg = fxs.find(f => f.type === 'page-turn'); if (pg) { done = pageTurn(it, t, st, pg, inf); flat = !done }
    let burned = false; if (!done) { const bn = fxs.find(f => f.type === 'burn'); if (bn) { done = burned = burn(it, t, st, bn, inf, fxs) } }
    if (!done) base(o);
    fxs.forEach(f => {
      switch (f.type) {
        case 'steam': steam(it, t, st, f, inf, false); break;
        case 'smoke': steam(it, t, st, f, inf, true); break;
        case 'aged': if (flat && !burned) agedOver(it, t, st, f, inf); break;
        case 'tea-ring': if (flat) ring(it, t, st, f, inf); break;
        case 'sparkle': if (flat) sparkleFx(it, t, st, f, inf); break;
        case 'shine': if (flat) shine(it, t, st, f, inf); break;
        case 'fold': if (flat) fold(it, t, st, f, inf); break;
        case 'crack': if (flat) crack(it, t, st, f, inf); break
      }
    })
  }

  /* ---------- pinned pictures: a library picture stuck on the scene's backdrop inside a frame ---------- */
  const PHOTO = { cream: '#efe3c6', sky: '#bfe0f0', mint: '#cfe9d3', rose: '#f4cfd6', sand: '#e8c999', night: '#243049', kraft: '#c9a26b', white: '#fbfaf5' };
  const CARD = { white: ['#fffdf6', '#efe9d6'], cream: ['#f6ecd2', '#e6d8b4'], kraft: ['#d8b880', '#bd9a5f'], black: ['#2a2a2e', '#141416'], rose: ['#fbe3e8', '#efc7d0'] };
  const PINCOL = { 'pin-red': ['#ff8a80', '#e0262f', '#8a0f18'], 'pin-blue': ['#a9d0ff', '#2b6fe0', '#123c8a'], 'pin-brass': ['#fff3bd', '#d1a73a', '#7a5a10'] };
  const WASHI = [['#f7b7c8', '#ffffff'], ['#9fd8d0', '#ffffff'], ['#ffd66b', '#ffffff']];
  const speckle = (g, x, y, w, h, seed, n, al) => { for (let i = 0; i < n; i++) { g.fillStyle = hsh(seed, i, 1) < .5 ? `rgba(90,60,20,${al * hsh(seed, i, 2)})` : `rgba(255,255,255,${al * hsh(seed, i, 2)})`; g.fillRect(x + hsh(seed, i, 3) * w, y + hsh(seed, i, 4) * h, 1 + hsh(seed, i, 5) * 2.2, 1 + hsh(seed, i, 6) * 2.2) } };
  function jagged(g, x, y, w, h, seed, jag, step) {
    const pts = [], edge = (x0, y0, x1, y1, nx, ny) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step)); for (let i = 0; i < n; i++) { const q = i / n, j = (hsh(seed, pts.length, 3) - .5) * 2 * jag; pts.push([x0 + (x1 - x0) * q + nx * j, y0 + (y1 - y0) * q + ny * j]) } };
    edge(x, y, x + w, y, 0, 1); edge(x + w, y, x + w, y + h, 1, 0); edge(x + w, y + h, x, y + h, 0, 1); edge(x, y + h, x, y, 1, 0); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath()
  }
  function metalFrame(g, x, y, w, h, th, cols, grain) {   // wood / gold: bevelled rectangular frame of thickness th
    const gr = g.createLinearGradient(x, y, x + w, y + h); cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c)); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,240,200,.45)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeRect(x + th, y + th, w - 2 * th, h - 2 * th);
    g.save(); g.globalAlpha = grain; g.strokeStyle = '#2a1608'; g.lineWidth = 1; for (let i = 0; i < 36; i++) { const yy = y + hsh(w | 0, i, 8) * h; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + w * .3, yy + 6, x + w * .6, yy - 6, x + w, yy + 2); g.stroke() } g.restore();
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - th, y + th); g.lineTo(x + th, y + th); g.lineTo(x + th, y + h - th); g.lineTo(x, y + h); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.moveTo(x + w, y + h); g.lineTo(x, y + h); g.lineTo(x + th, y + h - th); g.lineTo(x + w - th, y + h - th); g.lineTo(x + w - th, y + th); g.lineTo(x + w, y); g.fill()
  }
  /* ----- the things that hold a picture on the wall ----- */
  function tapePiece(g, x, y, rot, w, h, washi, seed) {
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); for (let i = 0; i <= 8; i++) g.lineTo(-w / 2 + (i % 2 ? 4 : 0), -h / 2 + i * h / 8); for (let i = 8; i >= 0; i--) g.lineTo(w / 2 - (i % 2 ? 4 : 0), -h / 2 + i * h / 8); g.closePath();
    g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    if (washi) { const c = WASHI[seed % WASHI.length]; g.fillStyle = c[0]; g.fill(); g.shadowColor = 'transparent'; g.save(); g.clip(); g.fillStyle = c[1]; g.globalAlpha = .55; for (let sx = -w; sx < w * 2; sx += h * .7) { g.beginPath(); g.moveTo(sx - h, h); g.lineTo(sx - h + h * .28, h); g.lineTo(sx + h * .28, -h); g.lineTo(sx, -h); g.closePath(); g.fill() } g.restore() }
    else { g.fillStyle = 'rgba(238,224,168,.84)'; g.fill(); g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-w / 2 + 6, -h / 2 + h * .12, w - 12, h * .18) }
    g.strokeStyle = 'rgba(120,100,40,.25)'; g.lineWidth = 1.5; g.stroke(); g.restore()
  }
  function pushpin(g, px, py, r, cols) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(px + r * .5, py + r * .8, r, r * .7, 0, 0, TAU); g.fill();
    const rg = g.createRadialGradient(px - r * .35, py - r * .35, r * .1, px, py, r); rg.addColorStop(0, cols[0]); rg.addColorStop(.45, cols[1]); rg.addColorStop(1, cols[2]); g.fillStyle = rg; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(px - r * .35, py - r * .38, r * .28, r * .16, -.6, 0, TAU); g.fill()
  }
  function attachDraw(g, kind, ox, oy, cw, ch, mx, seed) {   // (ox,oy,cw,ch) = the card rectangle
    const cx = ox + cw / 2;
    if (PINCOL[kind]) pushpin(g, cx, oy + .045 * mx, .042 * mx, PINCOL[kind]);
    else if (kind === 'tape-corners' || kind === 'washi') for (const s of [-1, 1]) tapePiece(g, s < 0 ? ox + cw * .08 : ox + cw * .92, oy + ch * .02, s * .62 + (hsh(seed, s + 2, 1) - .5) * .2, .3 * mx, .1 * mx, kind === 'washi', seed + (s > 0 ? 1 : 0));
    else if (kind === 'tape-top') tapePiece(g, cx, oy + .01 * mx, (hsh(seed, 3, 1) - .5) * .12, .34 * mx, .1 * mx, false, seed);
    else if (kind === 'tape-4') [[ox + cw * .05, oy + ch * .03, .7], [ox + cw * .95, oy + ch * .03, -.7], [ox + cw * .05, oy + ch * .97, -.7], [ox + cw * .95, oy + ch * .97, .7]].forEach(([x, y, r], i) => tapePiece(g, x, y, r, .26 * mx, .085 * mx, false, seed + i));
    else if (kind === 'clip') {
      const x = cx + .1 * cw * (hsh(seed, 1, 1) - .5), y = oy - .04 * mx, w = .1 * mx, h = .3 * mx, lw = .013 * mx; g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 5; g.shadowOffsetY = 3; g.lineWidth = lw; g.lineCap = 'round'; g.strokeStyle = '#aeb4bf';
      g.beginPath(); g.moveTo(x - w * .4, y + h * .72); g.lineTo(x - w * .4, y + h * .12); g.arc(x, y + h * .12, w * .4, Math.PI, 0); g.lineTo(x + w * .4, y + h * .78); g.arc(x, y + h * .78, w * .4, 0, Math.PI); g.lineTo(x - w * .4, y + h * .72); g.moveTo(x - w * .4, y + h * .72); g.stroke();
      g.shadowColor = 'transparent'; g.strokeStyle = '#8a909c'; g.beginPath(); g.moveTo(x, y + h * .3); g.lineTo(x, y + h * .72); g.arc(x + w * .2, y + h * .72, w * .2, Math.PI, 0); g.lineTo(x + w * .4, y + h * .16); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = lw * .35; g.beginPath(); g.moveTo(x - w * .4 + 2, y + h * .2); g.lineTo(x - w * .4 + 2, y + h * .6); g.stroke(); g.restore()
    } else if (kind === 'nail') { const x = cx, y = oy + .04 * mx, r = .024 * mx; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + r, y + r * 1.6, r * 1.5, r * .8, .5, 0, TAU); g.fill(); const rg = g.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); rg.addColorStop(0, '#e8e8ee'); rg.addColorStop(.5, '#7b7f8a'); rg.addColorStop(1, '#30323a'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill() }
    else if (kind === 'magnet') { const x = cx, y = oy + .05 * mx, r = .05 * mx; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + r * .3, y + r * .8, r, r * .6, 0, 0, TAU); g.fill(); g.fillStyle = '#30343d'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = '#d23b3b'; g.lineWidth = r * .28; g.beginPath(); g.arc(x, y, r * .72, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - r * .35, y - r * .4, r * .3, r * .15, -.6, 0, TAU); g.fill() }
    else if (kind === 'putty') for (const [x, y] of [[ox + .03 * mx, oy + .03 * mx], [ox + cw - .03 * mx, oy + .03 * mx], [ox + .03 * mx, oy + ch - .03 * mx], [ox + cw - .03 * mx, oy + ch - .03 * mx]]) { const r = .034 * mx; g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x + 2, y + 3, r, r * .85, 0, 0, TAU); g.fill(); g.fillStyle = '#5b97e6'; g.beginPath(); for (let a = 0; a < 14; a++) { const an = a * TAU / 14, rr = r * (.85 + .3 * hsh(seed, a, 61)); g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr) } g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - r * .3, y - r * .35, r * .35, r * .2, -.6, 0, TAU); g.fill() }
    else if (kind === 'string') {
      const top = oy - .3 * mx; g.strokeStyle = '#6b4a2a'; g.lineWidth = Math.max(2, .008 * mx); g.lineCap = 'round'; g.beginPath(); g.moveTo(ox + cw * .1, oy + .02 * mx); g.lineTo(cx, top); g.lineTo(ox + cw * .9, oy + .02 * mx); g.stroke();
      g.strokeStyle = 'rgba(255,230,180,.35)'; g.lineWidth = Math.max(1, .003 * mx); g.beginPath(); g.moveTo(ox + cw * .1, oy + .02 * mx); g.lineTo(cx, top); g.lineTo(ox + cw * .9, oy + .02 * mx); g.stroke();
      pushpin(g, ox + cw * .1, oy + .03 * mx, .028 * mx, PINCOL['pin-brass']); pushpin(g, ox + cw * .9, oy + .03 * mx, .028 * mx, PINCOL['pin-brass']); attachDraw(g, 'nail', cx - cw / 2 + cw / 2, top - .04 * mx + 0 * ch, 0, 0, mx, seed)
    }
  }
  const normPin = p => { let fr = p.frame || 'polaroid', at = p.attach; if (fr === 'tape') { fr = 'plain'; if (at == null) at = 'tape-corners' } else if (fr === 'pin') { fr = 'plain'; if (at == null) at = 'pin-red' } return { frame: fr, attach: at || 'none', card: p.card || 'white', curl: !!p.curl } };
  function frameCanvas(p) {
    const im = IM[p.src], inf = INFO[p.src], n = normPin(p), style = n.frame, att = n.attach; if (!im || !inf || (style === 'none' && att === 'none' && !n.curl)) return null;
    const [bx0, by0, bx1, by1] = inf.bb, bw = (bx1 - bx0) * inf.w, bh = (by1 - by0) * inf.h, k = Math.min(1.25, 560 / Math.max(bw, bh)), cw = bw * k, ch = bh * k, mx = Math.max(cw, ch), seed = (p.seed | 0) + (inf.w | 0);
    const photo = PHOTO[p.photo] || (/^#[0-9a-f]{3,8}$/i.test(p.photo || '') ? p.photo : PHOTO.cream), cc = CARD[n.card] || CARD.white;
    const G = { polaroid: [.09, .27, .03], plain: [.075, .075, .03], stamp: [.1, .1, .03], film: [.17, .17, .03], torn: [.11, .11, .04], burnt: [.14, .14, .08], wood: [.2, .2, .02], gold: [.21, .21, .02], none: [0, 0, 0] }[style] || [.08, .08, .03];
    const flat = style === 'none', padX = G[0] * mx, padT = style === 'film' ? .06 * mx : G[0] * mx, padB = style === 'film' ? .06 * mx : G[1] * mx, ext = Math.max(G[2] * mx, att === 'none' && !n.curl ? 0 : .11 * mx), extT = att === 'string' ? .42 * mx : ext;
    const iw = flat ? cw : cw + .12 * mx, ih = flat ? ch : ch + .12 * mx, cardW = iw + 2 * padX, cardH = ih + padT + padB, c = cnv(cardW + 2 * ext, cardH + extT + ext), g = c.getContext('2d'), ox = ext, oy = extT, ax = ox + padX, ay = oy + padT;
    const paper = (col, col2) => { const gr = g.createLinearGradient(ox, oy, ox + cardW, oy + cardH); gr.addColorStop(0, col); gr.addColorStop(1, col2); g.fillStyle = gr };
    const photoArea = () => { g.fillStyle = photo; g.fillRect(ax, ay, iw, ih); const rg = g.createRadialGradient(ax + iw / 2, ay + ih / 2, mx * .1, ax + iw / 2, ay + ih / 2, mx * .75); rg.addColorStop(0, 'rgba(255,255,255,.22)'); rg.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = rg; g.fillRect(ax, ay, iw, ih); speckle(g, ax, ay, iw, ih, seed, 260, .16) };
    const picture = () => g.drawImage(im, bx0 * inf.w, by0 * inf.h, bw, bh, ax + (iw - cw) / 2, ay + (ih - ch) / 2, cw, ch);
    if (style === 'polaroid' || style === 'plain' || style === 'stamp' || style === 'film') {
      if (style === 'film') { paper('#2a2a2e', '#121214') } else paper(cc[0], cc[1]); g.fillRect(ox, oy, cardW, cardH); g.strokeStyle = 'rgba(120,100,60,.25)'; g.lineWidth = 2; g.strokeRect(ox + 1, oy + 1, cardW - 2, cardH - 2);
      if (style === 'stamp') { g.save(); g.globalCompositeOperation = 'destination-out'; const r = .022 * mx, st = .062 * mx; for (let x = ox + st / 2; x < ox + cardW; x += st) { g.beginPath(); g.arc(x, oy, r, 0, TAU); g.arc(x, oy + cardH, r, 0, TAU); g.fill() } for (let y = oy + st / 2; y < oy + cardH; y += st) { g.beginPath(); g.arc(ox, y, r, 0, TAU); g.arc(ox + cardW, y, r, 0, TAU); g.fill() } g.restore() }
      if (style === 'film') { g.fillStyle = '#efe6cf'; const hh = .05 * mx, st = .09 * mx; for (let y = oy + st * .6; y < oy + cardH - hh; y += st) for (const x of [ox + padX * .3, ox + cardW - padX * .3 - hh * .7]) { g.beginPath(); g.roundRect(x, y, hh * .7, hh, 3); g.fill() } }
      photoArea(); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 3; g.strokeRect(ax, ay, iw, ih); picture()
    } else if (style === 'torn' || style === 'burnt') {
      jagged(g, ox, oy, cardW, cardH, seed, style === 'torn' ? .02 * mx : .008 * mx, style === 'torn' ? 13 : 20); paper(style === 'burnt' ? '#ecd9a6' : cc[0], style === 'burnt' ? '#d8bf86' : cc[1]); g.fill(); g.save(); g.clip(); speckle(g, ox, oy, cardW, cardH, seed + 3, 420, .2); g.restore(); g.lineWidth = 2; g.strokeStyle = 'rgba(90,70,30,.35)'; g.stroke();
      g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 8; g.shadowOffsetY = 3; picture(); g.restore()
      if (style === 'burnt') renderBurn(fieldOf('f|' + [p.src, style, seed, c.width].join('|'), c), g, null, 1, .2, .8, 1)
    } else if (style === 'wood' || style === 'gold') {
      const th = padX * .62; metalFrame(g, ox, oy, cardW, cardH, th, style === 'wood' ? ['#9a6330', '#6a3f1a', '#8a5a2b', '#4d2c12'] : ['#fbe9a0', '#c99a33', '#f4d77a', '#8e6414'], style === 'wood' ? .16 : .0);
      g.fillStyle = '#f3ecd8'; g.fillRect(ox + th, oy + th, cardW - 2 * th, cardH - 2 * th); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(ox + th, oy + th, cardW - 2 * th, cardH - 2 * th); photoArea(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(ax, ay, iw, ih); picture();
      g.save(); g.beginPath(); g.rect(ax, ay, iw, ih); g.clip(); g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + iw * .55, ay); g.lineTo(ax, ay + ih * .55); g.closePath(); g.fill(); g.restore();
      if (style === 'gold') { g.fillStyle = '#b98a22'; for (const [x, y] of [[ox, oy], [ox + cardW, oy], [ox, oy + cardH], [ox + cardW, oy + cardH], [ox + cardW / 2, oy], [ox + cardW / 2, oy + cardH], [ox, oy + cardH / 2], [ox + cardW, oy + cardH / 2]]) { g.beginPath(); g.arc(x, y, th * .42, 0, TAU); g.fill(); g.fillStyle = '#fbe9a0'; g.beginPath(); g.arc(x - 2, y - 2, th * .2, 0, TAU); g.fill(); g.fillStyle = '#b98a22' } }
    } else picture();   // 'none': just the picture (the fasteners below can still hold it)
    if (n.curl) {   // the bottom-right corner is lifted: the corner is cut away and a folded flap with a little shadow lies on the picture
      const cs = .17 * mx, X = ox + cardW, Y = oy + cardH; g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(X - cs, Y); g.lineTo(X, Y); g.lineTo(X, Y - cs); g.closePath(); g.fill(); g.restore();
      const sg = g.createLinearGradient(X - cs, Y - cs, X - cs * .2, Y - cs * .2); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.28)'); g.fillStyle = sg; g.beginPath(); g.moveTo(X - cs * 1.1, Y - cs * .1); g.lineTo(X - cs * .1, Y - cs * 1.1); g.lineTo(X - cs * .1, Y - cs * .1); g.closePath(); g.fill();
      const fg = g.createLinearGradient(X - cs, Y - cs, X - cs * .3, Y - cs * .3); fg.addColorStop(0, '#fffaf0'); fg.addColorStop(1, '#d9cfb6'); g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; g.shadowOffsetX = 2; g.shadowOffsetY = 3; g.fillStyle = fg; g.beginPath(); g.moveTo(X - cs, Y); g.lineTo(X, Y - cs); g.lineTo(X - cs, Y - cs); g.closePath(); g.fill(); g.restore()
    }
    if (att !== 'none') attachDraw(g, att, ox, oy, cardW, cardH, mx, seed);
    return c
  }
  const pinKey = (sc, i, p) => { const n = normPin(p); return n.frame === 'none' && n.attach === 'none' && !n.curl ? p.src : ['pin', sc.idx, i, p.src, n.frame, n.attach, n.card, n.curl ? 1 : 0, p.photo || '', p.seed | 0].join('|') };
  function buildPins() {
    if (typeof D === 'undefined' || !D) return;
    D.scenes.forEach(sc => (sc.pins || []).forEach((p, i) => { if (!p || !p.src || !IM[p.src]) return; if (!INFO[p.src]) INFO[p.src] = measure(IM[p.src]); const key = pinKey(sc, i, p); if (key === p.src || IM[key]) return; const c = frameCanvas(p); if (c) { IM[key] = c; INFO[key] = measure(c) } }))
  }
  function selBox(x, y, im, S, rot) { const m = Math.max(im.width, im.height), w = im.width / m * S, h = im.height / m * S; ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.setLineDash([22, 14]); ctx.lineWidth = 7; ctx.strokeStyle = '#00e5ff'; ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16); ctx.restore() }
  function drawPinImg(key, x, y, size, rot, a, sh, o) {   // a picture stuck on the wall: no entrance, no float, no squash; only a soft contact shadow
    const im = IM[key]; if (!im) return; const s = size * (o ? o.k : 1) / Math.max(im.width, im.height);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot + (o ? o.dr : 0)); if (sh > 0) { ctx.shadowColor = `rgba(25,12,0,${.5 * sh})`; ctx.shadowBlur = 6 + 22 * sh; ctx.shadowOffsetX = 5 * sh + 1; ctx.shadowOffsetY = 12 * sh + 2 }
    ctx.scale(s, s); ctx.globalAlpha = a; if (VOX) ctx.filter = 'sepia(.1) saturate(1.05) contrast(1.05)'; ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore()
  }
  function pins(t, sc) {
    const arr = sc.pins; if (!arr || !arr.length) return;
    arr.forEach((p, i) => {
      if (!p || !p.src) return; const key = pinKey(sc, i, p), kk = IM[key] ? key : p.src, im = IM[kk]; if (!im) return;
      const lay = (p.lay && p.lay[FMT]) || {}, S = B * .38 * num(p.sz, 1, .15, 5) * (lay.sz || 1), sh = num(p.shadow, .6, 0, 1);
      const px = (p.x == null ? .2 + .6 * hsh(sc.idx, i, 41) : +p.x) * W + (lay.dx || 0) * W, py = (p.y == null ? .2 + .5 * hsh(sc.idx, i, 42) : +p.y) * H + (lay.dy || 0) * H, rot0 = (p.rot == null ? (hsh(sc.idx, i, 43) - .5) * .3 : +p.rot) + (lay.rot || 0);
      const st0 = num(p.start, 0, 0, 30), t1 = sc.t0 + st0, a = EDIT || st0 <= 0 ? 1 : ramp(t, t1, t1 + .15); if (a <= 0) return;   // present from the first frame of the scene (start = 0)
      REC[2000 + i] = { x: px, y: py, size: S, src: kk, kind: 'pin' };
      const base = o => drawPinImg(kk, px, py, S, rot0, a, sh, o);
      if (!EDIT && p.fx && p.fx.length) item({ src: kk, t: Math.min(sc.t0, t1), fx: p.fx }, t, { x: px, y: py, size: S, rot: rot0, a, sx: 1, sy: 1 }, base); else base();
      if (EDIT && EDIT.sel === 2000 + i) selBox(px, py, im, S, rot0)
    })
  }

  /* ---------- scene background layer ---------- */
  function slotsOf(sc, b, N) {   // random positions that are still spread evenly (best of 10 candidates), then the owner's hand placement on top
    const tilt = num(b.tilt, .25, 0, 1), key = [sc.idx, N, W, b.seed | 0, tilt].join('|');
    if (!SL[key]) {
      const r = rng((sc.idx * 131 + 17) ^ ((b.seed | 0) * 7919)), out = [];
      for (let i = 0; i < N; i++) { let best = null, bd = -1; for (let c = 0; c < 10; c++) { const q = { x: .08 + .84 * r(), y: .06 + .88 * r() }; let d = 9e9; out.forEach(o => { d = Math.min(d, Math.hypot((o.x - q.x) * W, (o.y - q.y) * H)) }); if (d > bd) { bd = d; best = q } } out.push({ x: best.x, y: best.y, rot: (r() * 2 - 1) * tilt * Math.PI, sz: .8 + r() * .5 }) }
      SL[key] = out
    }
    const lay = (b.lay && b.lay[FMT]) || {};
    return SL[key].map((s, i) => { const o = lay[i]; return o ? { x: s.x + (o.dx || 0), y: s.y + (o.dy || 0), rot: s.rot + (o.rot || 0), sz: s.sz * (o.sz || 1), fixed: true } : s })
  }
  const DIRS = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0], dr: [.7, .7], dl: [-.7, .7], ur: [.7, -.7], ul: [-.7, -.7] };
  function pattern(b, sc, S, step) {   // one seamless period of the scrolling pattern, drawn once and reused every frame
    const tilt = num(b.tilt, .15, 0, 1), key = [sc.idx, b.src, S | 0, W, H, b.seed | 0, tilt].join('|'); if (PAT[key]) return PAT[key];
    const im = IM[b.src], nc = Math.ceil(W / step) + 2; let nr = Math.ceil(H / step) + 2; if (nr % 2) nr++;
    const c = document.createElement('canvas'); c.width = Math.round(nc * step); c.height = Math.round(nr * step); const g = c.getContext('2d'), k = S / Math.max(im.width, im.height), r = rng(sc.idx * 71 + 3 + (b.seed | 0) * 13);
    for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
      const cx = (i + .5) * step + (j % 2 ? step / 2 : 0) + (r() - .5) * step * .3, cy = (j + .5) * step + (r() - .5) * step * .3, rot = (r() * 2 - 1) * tilt * Math.PI;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const x = cx + ox * c.width, y = cy + oy * c.height; if (x < -S || x > c.width + S || y < -S || y > c.height + S) continue;
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore()
      }
    }
    return PAT[key] = c
  }
  const inv = y => { let a = 0, b = 1; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (cvS(m) < y) a = m; else b = m } return (a + b) / 2 };
  const cvS = x => { const s = x * x * x * (x * (x * 6 - 15) + 10); return .25 * x + .75 * s };   // slow - fast - slow: arrivals per second start at 1/4 of the average, peak at about 1.7x, and end at 1/4 again
  /* cover: a plan of random placements that provably fills the screen (each new picture lands on a spot still showing the scene), with arrival times along the slow-fast-slow curve */
  function coverPlan(sc, b, im) {
    const szk = num(b.size, 1, .2, 3), tilt = num(b.tilt, 1, 0, 1), key = ['cv', sc.idx, W, H, b.src, szk, b.seed | 0, tilt].join('|'); if (CV[key]) return CV[key];
    const K = 8, gw = Math.ceil(W / K), gh = Math.ceil(H / K), c = cnv(gw, gh), g = c.getContext('2d', { willReadFrequently: true }), r = rng(sc.idx * 977 + (b.seed | 0) * 131 + 5), base = B * .5 * szk, list = [];
    for (let n = 0; n < 320; n++) {
      const px = g.getImageData(0, 0, gw, gh).data, U = []; for (let i = 0; i < gw * gh; i++) if (px[i * 4 + 3] < 240) U.push(i);
      if (list.length) list[list.length - 1].cov = 1 - U.length / (gw * gh); if (!U.length) break;
      const cell = U[Math.floor(r() * U.length)], S = base * (.75 + .55 * r()) * (1 + Math.max(0, n - 60) * .012), x = ((cell % gw) + .5) * K + (r() - .5) * S * .3, y = (((cell / gw) | 0) + .5) * K + (r() - .5) * S * .3, rot = (r() * 2 - 1) * tilt * Math.PI;
      g.save(); g.translate(x / K, y / K); g.rotate(rot); const s = S / Math.max(im.width, im.height) / K; g.scale(s, s); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore(); list.push({ x, y, S, rot, cov: 0 })
    }
    if (list.length && !list[list.length - 1].cov) list[list.length - 1].cov = 1;
    return CV[key] = { list, comp: null, avg: (INFO[b.src] || {}).avg || [128, 128, 128] }
  }
  function cover(t, sc, b, im, u, sp) {
    const P = coverPlan(sc, b, im), M = P.list.length; if (!M) return; const Tc = 4 / sp, col = `rgb(${P.avg[0] * .85 | 0},${P.avg[1] * .85 | 0},${P.avg[2] * .85 | 0})`;
    if (u > Tc + .7) {   // finished: the final picture never changes, so it is drawn once and reused
      if (!P.comp) { const c = cnv(W, H), g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, W, H); P.list.forEach(o => { g.save(); g.translate(o.x, o.y); g.rotate(o.rot); const s = o.S / Math.max(im.width, im.height); g.scale(s, s); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore() }); P.comp = c }
      ctx.drawImage(P.comp, 0, 0); return
    }
    const T = i => M < 2 ? 0 : Tc * inv(i / (M - 1)); let cov = 0; for (let i = 0; i < M; i++) if (u >= T(i)) cov = P.list[i].cov; else break;
    ctx.fillStyle = col; ctx.globalAlpha = ramp(cov, .7, .97); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    for (let i = 0; i < M; i++) {
      const age = u - T(i); if (age < 0) break; const o = P.list[i], q = spr(age, 0, .5, 16);
      drawImg(b.src, o.x, o.y, o.S * (.55 + .45 * Math.min(q, 1.1)), o.rot + (1 - Math.min(q, 1)) * .35 * (i % 2 ? 1 : -1), ramp(age, 0, .08), 'none', 1, 1, false)
    }
  }
  function bg(t, sc) {
    const b = sc.bg, im = b && b.src && IM[b.src]; if (!im) return;
    const mot = b.motion || 'down', start = +b.start || 0, u0 = t - sc.t0 - start, edit = !!EDIT;
    if (!edit && u0 < 0 && start > 0 && mot !== 'fill') return;
    const u = edit ? 8 : Math.max(u0, 0), N = Math.round(num(b.count, 3, 1, mot === 'fill' || mot === 'fillin' ? 40 : 20)), sp = num(b.speed, 1, .2, 3), szk = num(b.size, 1, .2, 3), op = num(b.opacity, .9, .05, 1), blur = num(b.blur, 0, 0, 24), tilt = num(b.tilt, mot === 'cover' ? 1 : .25, 0, 1);
    const base = B * .42 * szk / (1 + .05 * (N - 1)), flt = (extra = 0) => { const v = blur + extra; return v >= .9 ? `blur(${(Math.round(v * 2) / 2).toFixed(1)}px)` : 'none' };   // blur is quantised: fewer different filter states, cheaper to render
    const sd = sc.idx * 7 + (b.seed | 0) * 131, rnd = (i, c, k) => hsh(sd, i * 17 + k, c);
    if (mot === 'cover') { if (!edit) cover(t, sc, b, im, u, sp); return }
    const SS = (mot === 'fill' || mot === 'fillin' || mot === 'scroll') ? null : slotsOf(sc, b, N);
    if (edit && SS) {   // the owner arranges the copies: every copy sits in its settled place, can be selected, dragged, pinched and turned
      SS.forEach((s, i) => { const S = base * s.sz; REC[1000 + i] = { x: s.x * W, y: s.y * H, size: S, src: b.src, rot: s.rot, kind: 'bg' }; drawImg(b.src, s.x * W, s.y * H, S, s.rot, op, flt(), 1, 1, false); if (EDIT.sel === 1000 + i) selBox(s.x * W, s.y * H, im, S, s.rot) }); return
    }
    if (edit && (mot === 'fill' || mot === 'fillin')) return;
    if (mot === 'down' || mot === 'up' || mot === 'left' || mot === 'right') {
      const vert = mot === 'down' || mot === 'up', rev = mot === 'up' || mot === 'left', L = vert ? H : W, tot = L + 2 * base * 1.15, C = 3.2 / sp, gap = C / N;
      for (let i = 0; i < N; i++) {
        const s = SS[i], sway = Math.sin(u * .9 + i * 1.7);
        if (b.hold) {   // enters from the edge and settles in its (random) place
          const S = base * s.sz, ts = i * .2 / sp; if (u < ts) continue;
          const q = Math.min(spr(u, ts, .5, 10), 1.12), px = s.x * W, py = s.y * H, from = vert ? (rev ? H + S : -S) : (rev ? W + S : -S);
          drawImg(b.src, vert ? px + sway * S * .03 : lerp(from, px, q), vert ? lerp(from, py, q) : py + sway * S * .03, S, s.rot + Math.sin(u * .7 + i) * .05, op * ramp(u, ts, ts + .15), flt(), 1, 1, false)
        } else {        // keeps flowing across the screen: every pass takes a new random lane, angle and size
          const ui = u - i * gap; if (ui < 0) continue; const c = Math.floor(ui / C), p = mod(ui / C, 1), fx = s.fixed;
          const S = base * (fx ? s.sz : .75 + .55 * rnd(i, c, 3)), rot = fx ? s.rot : (rnd(i, c, 2) * 2 - 1) * tilt * Math.PI, lane = fx ? (vert ? s.x : s.y) : .06 + .88 * rnd(i, c, 1);
          const pos = -base * 1.15 + (rev ? 1 - p : p) * tot, cross = lane * (vert ? W : H) + sway * S * .08;
          drawImg(b.src, vert ? cross : pos, vert ? pos : cross, S, rot + Math.sin(u * .6 + i) * .1, op, flt(), 1, 1, false)
        }
      }
    } else if (mot === 'zoom') {   // comes forward out of the background: small, faint and soft -> big and sharp
      const cx = W / 2, cy = H / 2, Cz = 3.6 / sp, L = [];
      for (let i = 0; i < N; i++) {
        const s = SS[i]; let p, kp, ks, al, tx = s.x, ty = s.y, rot = s.rot, sz = s.sz;
        if (b.hold) { const ts = i * .2 / sp; if (u < ts) continue; p = eoc((u - ts) / (1.4 / sp)); kp = p; ks = .12 + .88 * p; al = ramp(p, 0, .2) }
        else { const ui = u - i * Cz / N; if (ui < 0) continue; const c = Math.floor(ui / Cz); p = mod(ui / Cz, 1); if (!s.fixed) { tx = .1 + .8 * rnd(i, c, 1); ty = .1 + .8 * rnd(i, c, 4); rot = (rnd(i, c, 2) * 2 - 1) * tilt * Math.PI; sz = .75 + .55 * rnd(i, c, 3) } kp = .15 + 1.15 * Math.pow(p, 1.4); ks = .12 + 1.1 * Math.pow(p, 1.6); al = ramp(p, 0, .15) * (1 - ramp(p, .82, 1)) }
        L.push({ p, x: cx + (tx * W - cx) * kp, y: cy + (ty * H - cy) * kp, S: base * sz * ks, rot: rot * (b.hold ? (1 - p) * .6 + .4 : 1), al: al * op })
      }
      L.sort((a, c) => a.p - c.p).forEach(o => drawImg(b.src, o.x, o.y, o.S, o.rot, o.al, flt((1 - o.p) * 6), 1, 1, false))
    } else if (mot === 'pop') {
      for (let i = 0; i < N; i++) { const s = SS[i], ts = i * .2 / sp, q = spr(u, ts, .45, 13); if (q <= 0) continue; drawImg(b.src, s.x * W, s.y * H, base * s.sz * Math.min(q, 1.15), s.rot + Math.sin(u * .8 + i) * .04, op * ramp(u, ts, ts + .1), flt(), 1, 1, false) }
    } else if (mot === 'fill' || mot === 'fillin') {   // the whole screen is covered (random angles), then empties tile by tile (fillin: the other way round)
      const cols = Math.max(1, Math.ceil(Math.sqrt(N * W / H))), rows = Math.ceil(N / cols), tot = cols * rows, cw = W / cols, ch = H / rows, S = Math.max(cw, ch) * 1.3 * szk, E = 3 / sp, tl = num(b.tilt, .25, 0, 1);
      const key = ['f', sc.idx, tot, b.seed | 0, tl].join('|'); if (!SL[key]) { const r = rng(sc.idx * 53 + 9 + (b.seed | 0) * 17), ord = [...Array(tot).keys()]; for (let i = tot - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [ord[i], ord[k]] = [ord[k], ord[i]] } const rank = []; ord.forEach((id, k) => { rank[id] = k }); SL[key] = { rank, rot: ord.map(() => (r() * 2 - 1) * tl * Math.PI), jx: ord.map(() => (r() - .5) * .3), jy: ord.map(() => (r() - .5) * .3) } }
      const F = SL[key];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const id = j * cols + i, T = .4 + F.rank[id] / Math.max(tot - 1, 1) * E, q = mot === 'fill' ? ramp(u, T, T + .4) : 1 - ramp(u, T, T + .4); if (q >= 1) continue;
        drawImg(b.src, (i + .5 + F.jx[id]) * cw, (j + .5 + F.jy[id]) * ch, S * (1 - .7 * eio(q)), F.rot[id], op * (1 - q), flt(), 1, 1, false)
      }
    } else if (mot === 'scroll') {   // endless tiled pattern drifting in one direction (count = pictures per row)
      const per = Math.max(1, Math.min(12, Math.round(num(b.count, 4, 1, 12)))), S = Math.min(W, H) / per * szk, step = S * 1.12, pat = pattern(b, sc, S, step), d = DIRS[b.dir] || DIRS.down, off = u * sp * S * .9;
      const ox = mod(d[0] * off, pat.width), oy = mod(d[1] * off, pat.height);
      ctx.save(); ctx.globalAlpha = op * ramp(u, 0, .4); if (blur > .4) ctx.filter = flt();
      for (const x of [ox - pat.width, ox]) for (const y of [oy - pat.height, oy]) ctx.drawImage(pat, x, y);
      ctx.restore()
    }
  }
  return { prepare, bg, pins, item, TYPES }
})();
