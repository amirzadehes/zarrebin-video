/* Zarrebin engine — background layer (scene.bg) and image-bound effects (item.fx).
   Loaded BEFORE v2.js; it only uses v2.js globals (ctx, W, H, B, IM, drawImg, rng, ramp, ...) when called.
   Every function is a pure function of t (no wall clock), so parallel chunk rendering stays frame-exact.

   scene.bg = { src:'library/x__1.webp', motion:'down|up|left|right|zoom|pop|fill|fillin|scroll', hold:false,
                speed:1 (.2-3), size:1 (.2-3), count:3 (1-20, fill up to 40), opacity:.9, blur:0 (px), start:0 (s after scene start),
                dir:'down|up|left|right|dr|dl|ur|ul' (scroll only), sound:'whoosh|swipe|airy|low|riser|pop|thud|none', vol:60 (0-100) }
   item.fx  = [ { type:'steam|page-turn|clock-rewind', start:s after the image appears, dur:s, anchor:[x,y] (fractions of the image),
                  vol:0-100, + per type: intensity/height/speed (steam), mode:'in|out' hinge:'center|left|right' (page-turn), turns/radius/hands/tint (clock-rewind) } ]
   The anchor defaults to the picture itself: the top-centre of the opaque shape for steam, its centre otherwise (measured from the alpha channel).
   library/anchors.json (optional) pins a point per picture id: { "coffee-cup": { "steam": [0.5, 0.2], "default": [0.5, 0.5] } }. */
window.FXL = (() => {
  const INFO = {}, SL = {}, PAT = {}; let ANCH = {};
  const mod = (a, b) => ((a % b) + b) % b, itemId = s => String(s || '').split('/').pop().split('__')[0];
  const num = (v, d, a, b) => { v = parseFloat(v); if (!isFinite(v)) v = d; return Math.max(a, Math.min(b, v)) };

  /* ---------- picture info: bounding box of the opaque pixels + the top-centre of the shape (fractions of the image) ---------- */
  function measure(im) {
    const w = im.width, h = im.height, k = Math.min(1, 160 / Math.max(w, h)), cw = Math.max(8, Math.round(w * k)), ch = Math.max(8, Math.round(h * k)), d = { w, h, bb: [0, 0, 1, 1], topX: .5 };
    try {
      const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, cw, ch);
      const px = g.getImageData(0, 0, cw, ch).data; let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (px[(y * cw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      if (x1 >= 0) {
        d.bb = [x0 / cw, y0 / ch, (x1 + 1) / cw, (y1 + 1) / ch];
        const band = Math.max(1, Math.round((y1 - y0 + 1) * .12)); let sx = 0, n = 0;
        for (let y = y0; y < y0 + band; y++) for (let x = x0; x <= x1; x++) if (px[(y * cw + x) * 4 + 3] > 40) { sx += x; n++ }
        if (n) d.topX = (sx / n + .5) / cw
      }
    } catch (e) { /* tainted canvas (image came from another origin): keep the whole-image defaults */ }
    return d
  }
  async function prepare(srcs) {
    try { const r = await fetch('../library/anchors.json?' + Date.now()); if (r.ok) ANCH = await r.json() } catch (e) { }
    (srcs || []).forEach(src => { const im = IM[src]; if (im && !INFO[src]) INFO[src] = measure(im) })
  }
  function anchorOf(it, f, type, inf) {
    if (Array.isArray(f.anchor) && f.anchor.length === 2) return [num(f.anchor[0], .5, -.5, 1.5), num(f.anchor[1], .5, -.5, 1.5)];
    const a = ANCH[itemId(it.src)]; if (a) { if (Array.isArray(a[type])) return a[type]; if (Array.isArray(a.default)) return a.default }
    const [x0, y0, x1, y1] = inf.bb;
    return type === 'steam' ? [inf.topX, y0 + (y1 - y0) * .04] : [(x0 + x1) / 2, (y0 + y1) / 2]
  }
  const T0 = (it, f, d) => it.t + (f.start == null || f.start === '' || isNaN(+f.start) ? d : +f.start);
  /* run fn in the picture's own pixel space (origin = image centre), following every move / zoom / squash the picture has */
  function local(st, inf, fn) { const s = st.size / Math.max(inf.w, inf.h); ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.rot); ctx.scale(s * st.sx, s * st.sy); ctx.globalAlpha = st.a; fn(s); ctx.restore() }
  const unitOf = inf => Math.min((inf.bb[2] - inf.bb[0]) * inf.w, (inf.bb[3] - inf.bb[1]) * inf.h);

  /* ---------- steam ---------- */
  function puff(x, y, r, a) {
    if (a < .01) return;
    let g = ctx.createRadialGradient(x, y + r * .12, 0, x, y + r * .12, r * 1.05); g.addColorStop(0, `rgba(70,60,50,${a * .2})`); g.addColorStop(1, 'rgba(70,60,50,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + r * .12, r * 1.05, 0, TAU); ctx.fill();   // soft grey under-layer: steam stays visible on light paper
    g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.55, `rgba(255,255,255,${a * .45})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  }
  function steam(it, t, st, f, inf) {
    const tau = t - T0(it, f, .3), dur = +f.dur > 0 ? +f.dur : null; if (tau < 0 || (dur && tau > dur)) return;
    let env = ramp(tau, 0, .9); if (dur) env *= 1 - ramp(tau, dur - .8, dur);
    const ik = num(f.intensity, 1, .2, 2.5), sp = num(f.speed, 1, .3, 3), [ax, ay] = anchorOf(it, f, 'steam', inf), u = unitOf(inf), w = inf.w, h = inf.h;
    const n = Math.round(Math.max(2, Math.min(6, 1.5 + 1.5 * ik))), P = 11, rise = u * num(f.height, .34, .12, 1.4), spread = u * .09, r0 = u * .042;
    local(st, inf, () => {
      for (let wi = 0; wi < n; wi++) {
        const off = (n === 1 ? 0 : wi / (n - 1) - .5) * spread * 2;
        for (let k = 0; k < P; k++) {
          const life = mod(tau * .42 * sp + wi * .318 + k / P, 1), y = (ay - .5) * h - life * rise, sway = Math.sin(life * 6.2 + wi * 2.3 + tau * .9) * u * .06 * (.25 + life);
          puff((ax - .5) * w + off + sway, y, r0 * (.5 + 1.5 * life), .36 * Math.pow(Math.sin(Math.PI * life), 1.3) * env * Math.min(ik, 1.2))
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

  /* ---------- clock rewind: a sweep hand with a golden trail winds counter-clockwise over the picture, amber time-wash + ticking ring ---------- */
  function clockRewind(it, t, st, f, inf) {
    const dur = num(f.dur, 2.6, .8, 8), tau = t - T0(it, f, .3); if (tau < 0 || tau > dur + .5) return;
    const env = ramp(tau, 0, .3) * (1 - ramp(tau, dur, dur + .5)), [ax, ay] = anchorOf(it, f, 'clock-rewind', inf), u = unitOf(inf), R = u * num(f.radius, .42, .15, .9);
    const turns = num(f.turns, 3, .5, 12), p = eio(clamp(tau / dur)), ang = -Math.PI / 2 - TAU * turns * p;   // counter-clockwise
    local(st, inf, () => {
      ctx.translate((ax - .5) * inf.w, (ay - .5) * inf.h); ctx.globalAlpha *= env;
      if (f.tint !== false) { const g = ctx.createRadialGradient(0, 0, R * .2, 0, 0, R * 1.08); g.addColorStop(0, 'rgba(255,190,60,.05)'); g.addColorStop(1, 'rgba(255,170,40,.3)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.08, 0, TAU); ctx.fill() }
      ctx.save(); ctx.rotate(TAU * .35 * p); ctx.lineCap = 'round';   // tick ring turns the other way
      for (let i = 0; i < 60; i++) { const a = i * TAU / 60, big = i % 5 === 0, r1 = R * (big ? .86 : .92); ctx.lineWidth = u * (big ? .016 : .009); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke() }
      ctx.restore();
      if (ctx.createConicGradient) { const g = ctx.createConicGradient(ang, 0, 0); g.addColorStop(0, 'rgba(255,196,40,.6)'); g.addColorStop(.22, 'rgba(255,196,40,0)'); g.addColorStop(1, 'rgba(255,196,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * .92, 0, TAU); ctx.fill() }
      const hand = (a, len, w) => { ctx.lineCap = 'round'; ctx.strokeStyle = '#14100e'; ctx.lineWidth = w * 1.9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke(); ctx.strokeStyle = '#ffc21a'; ctx.lineWidth = w; ctx.stroke() };
      hand(ang, R * .92, u * .014);
      if (f.hands) hand(-Math.PI / 2 - TAU * turns / 12 * p, R * .58, u * .02);
      ctx.fillStyle = '#14100e'; ctx.beginPath(); ctx.arc(0, 0, u * .02, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffc21a'; ctx.beginPath(); ctx.arc(0, 0, u * .011, 0, TAU); ctx.fill()
    })
  }

  /* called by drawItem: base() draws the picture the normal way; page-turn replaces it while the page is turning, the others are drawn over it */
  function item(it, t, st, base) {
    const inf = INFO[it.src], fxs = (it.fx || []).filter(f => f && f.type);
    if (!inf || !fxs.length) { base(); return }
    const pg = fxs.find(f => f.type === 'page-turn');
    if (!(pg && pageTurn(it, t, st, pg, inf))) base();
    fxs.forEach(f => { if (f.type === 'steam') steam(it, t, st, f, inf); else if (f.type === 'clock-rewind') clockRewind(it, t, st, f, inf) })
  }

  /* ---------- scene background layer ---------- */
  function slots(sc, N) {   // jittered grid positions (fractions of the canvas), the same for every frame
    const key = sc.idx + '|' + N + '|' + W; if (SL[key]) return SL[key];
    const r = rng(sc.idx * 131 + 17), cols = Math.max(1, Math.ceil(Math.sqrt(N * W / H))), rows = Math.ceil(N / cols), cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push([i, j]);
    for (let i = cells.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [cells[i], cells[k]] = [cells[k], cells[i]] }
    const out = []; for (let n = 0; n < N; n++) { const [i, j] = cells[n % cells.length]; out.push({ x: (i + .5 + (r() - .5) * .6) / cols, y: (j + .5 + (r() - .5) * .6) / rows, rot: (r() - .5) * .5, sz: .85 + r() * .3 }) }
    return SL[key] = out
  }
  const DIRS = { down: [0, 1], up: [0, -1], right: [1, 0], left: [-1, 0], dr: [.7, .7], dl: [-.7, .7], ur: [.7, -.7], ul: [-.7, -.7] };
  function pattern(b, sc, S, step) {   // one seamless period of the scrolling pattern, drawn once and reused every frame
    const key = [sc.idx, b.src, S | 0, W, H].join('|'); if (PAT[key]) return PAT[key];
    const im = IM[b.src], nc = Math.ceil(W / step) + 2; let nr = Math.ceil(H / step) + 2; if (nr % 2) nr++;
    const c = document.createElement('canvas'); c.width = Math.round(nc * step); c.height = Math.round(nr * step); const g = c.getContext('2d'), k = S / Math.max(im.width, im.height), r = rng(sc.idx * 71 + 3);
    for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
      const cx = (i + .5) * step + (j % 2 ? step / 2 : 0), cy = (j + .5) * step, rot = (r() - .5) * .3;
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const x = cx + ox * c.width, y = cy + oy * c.height; if (x < -S || x > c.width + S || y < -S || y > c.height + S) continue;
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k); g.drawImage(im, -im.width / 2, -im.height / 2); g.restore()
      }
    }
    return PAT[key] = c
  }
  function bg(t, sc) {
    const b = sc.bg, im = b && b.src && IM[b.src]; if (!im) return;
    const mot = b.motion || 'down', start = +b.start || 0, u0 = t - sc.t0 - start;
    if (u0 < 0 && start > 0 && mot !== 'fill') return;
    const u = Math.max(u0, 0), N = Math.round(num(b.count, 3, 1, mot === 'fill' || mot === 'fillin' ? 40 : 20)), sp = num(b.speed, 1, .2, 3), szk = num(b.size, 1, .2, 3), op = num(b.opacity, .9, .05, 1), blur = num(b.blur, 0, 0, 24);
    const base = B * .42 * szk / (1 + .05 * (N - 1)), flt = (extra = 0) => { const v = blur + extra; return v >= .9 ? `blur(${(Math.round(v * 2) / 2).toFixed(1)}px)` : 'none' }, SS = slots(sc, N);   // blur is quantised: fewer different filter states, cheaper to render
    if (mot === 'down' || mot === 'up' || mot === 'left' || mot === 'right') {
      const vert = mot === 'down' || mot === 'up', rev = mot === 'up' || mot === 'left', L = vert ? H : W, tot = L + 2 * base * 1.15, C = 3.2 / sp, gap = C / N;
      for (let i = 0; i < N; i++) {
        const s = SS[i], S = base * s.sz, sway = Math.sin(u * .9 + i * 1.7);
        if (b.hold) {   // enters from the edge and settles in its place
          const ts = i * .2 / sp; if (u < ts) continue;
          const q = Math.min(spr(u, ts, .5, 10), 1.12), px = s.x * W, py = s.y * H, from = vert ? (rev ? H + S : -S) : (rev ? W + S : -S);
          drawImg(b.src, vert ? px + sway * S * .03 : lerp(from, px, q), vert ? lerp(from, py, q) : py + sway * S * .03, S, s.rot * .4 + Math.sin(u * .7 + i) * .05, op * ramp(u, ts, ts + .15), flt(), 1, 1, false)
        } else {        // keeps flowing across the screen, one copy after another
          const ui = u - i * gap; if (ui < 0) continue;
          const p = mod(ui / C, 1), pos = -base * 1.15 + (rev ? 1 - p : p) * tot, cross = (vert ? s.x * W : s.y * H) + sway * S * .08;
          drawImg(b.src, vert ? cross : pos, vert ? pos : cross, S, s.rot * .5 + Math.sin(u * .6 + i) * .1, op, flt(), 1, 1, false)
        }
      }
    } else if (mot === 'zoom') {   // comes forward out of the background: small, faint and soft -> big and sharp
      const cx = W / 2, cy = H / 2, Cz = 3.6 / sp, L = [];
      for (let i = 0; i < N; i++) {
        const s = SS[i]; let p, kp, ks, al;
        if (b.hold) { const ts = i * .2 / sp; if (u < ts) continue; p = eoc((u - ts) / (1.4 / sp)); kp = p; ks = .12 + .88 * p; al = ramp(p, 0, .2) }
        else { const ui = u - i * Cz / N; if (ui < 0) continue; p = mod(ui / Cz, 1); kp = .15 + 1.15 * Math.pow(p, 1.4); ks = .12 + 1.1 * Math.pow(p, 1.6); al = ramp(p, 0, .15) * (1 - ramp(p, .82, 1)) }
        L.push({ p, x: cx + (s.x * W - cx) * kp, y: cy + (s.y * H - cy) * kp, S: base * s.sz * ks, rot: s.rot * (1 - p) * .6, al: al * op })
      }
      L.sort((a, c) => a.p - c.p).forEach(o => drawImg(b.src, o.x, o.y, o.S, o.rot, o.al, flt((1 - o.p) * 6), 1, 1, false))
    } else if (mot === 'pop') {
      for (let i = 0; i < N; i++) { const s = SS[i], ts = i * .2 / sp, q = spr(u, ts, .45, 13); if (q <= 0) continue; drawImg(b.src, s.x * W, s.y * H, base * s.sz * Math.min(q, 1.15), s.rot + Math.sin(u * .8 + i) * .04, op * ramp(u, ts, ts + .1), flt(), 1, 1, false) }
    } else if (mot === 'fill' || mot === 'fillin') {   // the whole screen is covered, then empties tile by tile (fillin: the other way round)
      const cols = Math.max(1, Math.ceil(Math.sqrt(N * W / H))), rows = Math.ceil(N / cols), tot = cols * rows, cw = W / cols, ch = H / rows, S = Math.max(cw, ch) * 1.08 * szk, E = 3 / sp;
      const key = 'f|' + sc.idx + '|' + tot; if (!SL[key]) { const r = rng(sc.idx * 53 + 9), ord = [...Array(tot).keys()]; for (let i = tot - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [ord[i], ord[k]] = [ord[k], ord[i]] } const rank = []; ord.forEach((id, k) => { rank[id] = k }); SL[key] = { rank, rot: ord.map(() => (r() - .5) * .22) } }
      const F = SL[key];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const id = j * cols + i, T = .4 + F.rank[id] / Math.max(tot - 1, 1) * E, q = mot === 'fill' ? ramp(u, T, T + .4) : 1 - ramp(u, T, T + .4); if (q >= 1) continue;
        drawImg(b.src, (i + .5) * cw, (j + .5) * ch, S * (1 - .7 * eio(q)), F.rot[id], op * (1 - q), flt(), 1, 1, false)
      }
    } else if (mot === 'scroll') {   // endless tiled pattern drifting in one direction (count = pictures per row)
      const per = Math.max(1, Math.min(12, Math.round(num(b.count, 4, 1, 12)))), S = Math.min(W, H) / per * szk, step = S * 1.12, pat = pattern(b, sc, S, step), d = DIRS[b.dir] || DIRS.down, off = u * sp * S * .9;
      const ox = mod(d[0] * off, pat.width), oy = mod(d[1] * off, pat.height);
      ctx.save(); ctx.globalAlpha = op * ramp(u, 0, .4); if (blur > .4) ctx.filter = flt();
      for (const x of [ox - pat.width, ox]) for (const y of [oy - pat.height, oy]) ctx.drawImage(pat, x, y);
      ctx.restore()
    }
  }
  return { prepare, bg, item }
})();
