/* Zarrebin engine — moving picture effects per scene (scene.vfx), applied to the finished frame (picture, text and all) after finish().
   Loaded BEFORE v2.js; it only uses v2.js globals (cv, ctx, W, H, RS, D, EDIT, rng, clamp, ramp) when called.
   Every effect is a pure function of t (no wall clock, seeded randomness), so parallel chunk rendering stays frame-exact.
   scene.vfx = { boil:1, heat:1, embers:1, riso:1, grain:1, noise:1, glitch:1, scan:1, half:1, push:1, leak:1, shake:1, steps:1, amt:1 (.4-2) }
   A missing key (or 0) = off; old scenes without vfx are untouched. `steps` (hand-drawn 12 fps look) is handled in v2.js frame() through VFX.qt().
   boil   : every ~83 ms a new soft random displacement field (about 2 px, 60-120 px wide) shifts picture AND text, held until the next step
   heat   : the lower part of the frame ripples like hot air
   embers : glowing sparks rise from the bottom
   riso   : the colour channels drift apart a few pixels, re-jittered on every step (misprinted poster)
   grain  : coarse film grain, a new pattern on every step
   noise  : coloured digital noise with soft blotches, new on every step
   glitch : short bursts every ~1.9 s: sliced rows jump sideways, colour channels split, bright blocks flash
   scan   : crawling scan lines, a rolling bright band, a flickering tube and an occasional tracking tear
   half   : a halftone ink screen over the frame; the grid drifts and the dots breathe
   push   : slow push-in over the whole scene with a faint handheld drift
   leak   : warm light leaks that drift and flicker, plus a passing light streak
   shake  : a camera knock on every spoken word and a tiny handheld wobble */
window.VFX = (() => {
  const KEYS = ['steps', 'boil', 'heat', 'embers', 'riso', 'grain', 'noise', 'glitch', 'scan', 'half', 'push', 'leak', 'shake'];
  const NS = 'http://www.w3.org/2000/svg', cache = {};
  const hz = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) };
  const buf = (name, w, h) => { let c = cache[name]; if (!c || c.width !== w || c.height !== h) { c = cache[name] = document.createElement('canvas'); c.width = w; c.height = h } return c };
  const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), sm = (a, b, x) => { x = cl((x - a) / (b - a)); return x * x * (3 - 2 * x) };
  const active = sc => { const f = sc && sc.vfx; return f && typeof f === 'object' && KEYS.some(k => f[k]) ? f : null };

  /* 12 fps stepped time (hand-drawn look): the whole scene, not only the displacement, is held between steps */
  function qt(t) { const k = Math.floor(t * 12 + 1e-6); return k / 12 }

  /* ---- SVG displacement filter for `boil` (canvas ctx.filter = url(#...)); a tile fallback covers browsers without ctx.filter ---- */
  let SV = null;
  function svg() {
    if (SV) return SV;
    SV = document.createElementNS(NS, 'svg'); SV.setAttribute('width', '0'); SV.setAttribute('height', '0'); SV.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    SV.innerHTML = '<filter id="vfxBoil" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence id="vfxBoilT" type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="1" result="n"/><feDisplacementMap id="vfxBoilD" in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G"/></filter>';
    (document.body || document.documentElement).appendChild(SV); return SV
  }
  let filterOK = null;
  const canFilter = () => { if (filterOK == null) filterOK = 'filter' in ctx; return filterOK };

  /* noise canvases (built once): grey grain and coloured digital noise, 6 variants each */
  let GN = null, CN = null;
  function mkNoise(cw, ch) {
    if (GN && GN.cw === cw) return; GN = []; CN = []; GN.cw = cw;
    const r = rng(8841), gw = Math.round(cw / 2), gh = Math.round(ch / 2), cwid = Math.round(cw / 4), chei = Math.round(ch / 4);
    for (let k = 0; k < 6; k++) {
      let c = document.createElement('canvas'); c.width = gw; c.height = gh; let g = c.getContext('2d'), im = g.createImageData(gw, gh);
      for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 } g.putImageData(im, 0, 0); GN.push(c);
      c = document.createElement('canvas'); c.width = cwid; c.height = chei; g = c.getContext('2d'); im = g.createImageData(cwid, chei);
      for (let i = 0; i < im.data.length; i += 4) { im.data[i] = r() * 255; im.data[i + 1] = r() * 255; im.data[i + 2] = r() * 255; im.data[i + 3] = 255 } g.putImageData(im, 0, 0);
      for (let b = 0; b < 26; b++) { g.globalAlpha = .35; g.fillStyle = 'hsl(' + Math.floor(r() * 360) + ',90%,55%)'; const x = r() * cwid, y = r() * chei, w = 20 + r() * 90, h = 3 + r() * 14; g.fillRect(x, y, w, h) } g.globalAlpha = 1; CN.push(c)
    }
  }
  let GLOW = null;
  function glow() {   // soft round sprite for the embers
    if (GLOW) return GLOW; GLOW = document.createElement('canvas'); GLOW.width = GLOW.height = 64; const g = GLOW.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,236,170,1)'); rg.addColorStop(.25, 'rgba(255,150,50,.85)'); rg.addColorStop(.6, 'rgba(255,90,20,.25)'); rg.addColorStop(1, 'rgba(255,70,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return GLOW
  }
  let SCP = null;
  function scanPat(px) {   // one dark line every 4 logical px
    const h = Math.max(2, Math.round(4 * px)); if (SCP && SCP.h === h) return SCP.p;
    const c = document.createElement('canvas'); c.width = 4; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 4, Math.max(1, Math.round(h / 2.4))); SCP = { h, p: ctx.createPattern(c, 'repeat') }; return SCP.p
  }

  const snap = (cw, ch) => { const P = buf('p', cw, ch), g = P.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, cw, ch); g.drawImage(cv, 0, 0); return P };
  function split(P, cw, ch, ox, oy) {   // colour channels apart: R shifted by (+ox,+oy), G in place, B shifted back
    const T = buf('t', cw, ch), g = T.getContext('2d'); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    [['#ff0000', ox, oy], ['#00ff00', 0, 0], ['#0000ff', -ox, -oy]].forEach(([col, dx, dy]) => {
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cw, ch); g.drawImage(P, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(T, dx - cw * .007, dy - ch * .007, cw * 1.014, ch * 1.014)   // a hair larger so the shifted channels never leave a coloured edge
    }); ctx.globalCompositeOperation = 'source-over'
  }

  function apply(t, sc) {
    const f = active(sc); if (!f || (typeof EDIT !== 'undefined' && EDIT)) return;
    const cw = cv.width, ch = cv.height, A = cl(+f.amt || 1, .4, 2), lt = t - sc.t0, st = Math.floor(t * 12 + 1e-6), px = cw / W, dur = Math.max(1, sc.t1 - sc.t0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true;

    /* push-in + camera shake: one transform pass */
    if (f.push || f.shake) {
      let z = 1, dx = 0, dy = 0;
      if (f.push) { const p = cl(lt / dur); z += .065 * A * p + .004 * Math.sin(t * .9); dx += Math.sin(t * .7) * .004 * cw; dy += Math.cos(t * .55) * .003 * ch }
      if (f.shake) {
        z += .02; dx += (Math.sin(t * 13.1) + Math.sin(t * 7.7 + 1)) * .0016 * cw * A; dy += (Math.sin(t * 11.3 + 2) + Math.sin(t * 6.1)) * .0012 * ch * A;
        const ws = D.words || []; for (let i = 0; i < ws.length; i++) { const w = ws[i]; if (w.t0 == null) continue; const d = t - w.t0; if (d >= 0 && d < .5) { const q = Math.exp(-d * 13) * Math.cos(d * 38); dx += (hz(i * 3 + 1) - .5) * 2 * .016 * cw * q * A; dy += (hz(i * 3 + 2) - .5) * 2 * .011 * ch * q * A } }
      }
      const P = snap(cw, ch); ctx.drawImage(P, cw / 2 * (1 - z) + dx, ch / 2 * (1 - z) + dy, cw * z, ch * z)
    }

    /* heat haze: horizontal strips of the lower frame swim sideways */
    if (f.heat) {
      const P = snap(cw, ch), sh = Math.max(3, Math.round(7 * px));
      for (let y = Math.round(ch * .3); y < ch; y += sh) { const w = sm(.3, .85, y / ch), ph = y / px * .05 - t * 7.5, dx = (Math.sin(ph) + .5 * Math.sin(ph * 2.3 + 1.7)) * 6 * px * w * A; if (Math.abs(dx) > .3) ctx.drawImage(P, 0, y, cw, sh, dx, y, cw, sh) }
    }

    /* boil: stepped, smooth random displacement of everything */
    if (f.boil) {
      const P = snap(cw, ch), sc2 = 13 * A * px, seed = (st * 7919) % 9973 + 1;
      if (canFilter()) {
        svg(); const T = document.getElementById('vfxBoilT'), Dm = document.getElementById('vfxBoilD');
        T.setAttribute('seed', String(seed)); T.setAttribute('baseFrequency', String(.008 / px)); Dm.setAttribute('scale', String(sc2));
        ctx.filter = 'url(#vfxBoil)'; ctx.drawImage(P, 0, 0); ctx.filter = 'none'
      } else {   // fallback: tiles shifted by a coarse noise field (corners stay unshifted underneath, so nothing tears open)
        const cell = Math.round(44 * px), cols = Math.ceil(cw / cell), rows = Math.ceil(ch / cell), fld = (i, j, k) => (hz(seed * 31 + i * 13 + j * 57 + k * 101) - .5) * 2;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x = i * cell, y = j * cell, w = Math.min(cell, cw - x), h = Math.min(cell, ch - y); ctx.drawImage(P, x, y, w, h, x + fld(i, j, 1) * sc2 * .16, y + fld(i, j, 2) * sc2 * .16, w, h) }
      }
    }

    /* glitch bursts: sliced rows, split colours, flash blocks */
    let burst = 0; if (f.glitch) { const ph = (t + sc.idx * .37) % 1.9; burst = ph < .26 || (ph > .5 && ph < .62) ? 1 : 0 }
    if (burst) {
      const P = snap(cw, ch), n = Math.round(9 + 6 * A);
      for (let k = 0; k < n; k++) { const y = Math.floor(hz(st * 13 + k) * ch), h = Math.floor((.008 + hz(st * 7 + k) * .055) * ch), dx = (hz(st * 5 + k) - .5) * .34 * cw * A; ctx.drawImage(P, 0, y, cw, h, dx, y, cw, h) }
      const P2 = snap(cw, ch); split(P2, cw, ch, (hz(st + 3) * .6 + .4) * 16 * px * A * (hz(st + 9) > .5 ? 1 : -1), 0);
      for (let k = 0; k < 3; k++) { if (hz(st * 11 + k) < .35) continue; ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = hz(st + k * 17) > .5 ? '#ff2bd6' : '#19e6ff'; ctx.globalAlpha = .55; ctx.fillRect(hz(st * 3 + k) * cw * .7, hz(st * 5 + k) * ch, cw * (.12 + hz(st + k) * .3), ch * (.006 + hz(st * 2 + k) * .02)) }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
    }

    /* riso: misregistered colour channels (always on; the glitch burst already split them) */
    if (f.riso && !burst) { const P = snap(cw, ch), ox = ((hz(st * 3 + 1) - .5) * 2 * 3.4 + Math.sin(t * 1.3) * 1.2) * px * A, oy = ((hz(st * 3 + 2) - .5) * 2 * 1.8) * px * A; split(P, cw, ch, ox, oy) }

    /* grain + coloured noise (new pattern every step, pixel-sharp scaling) */
    if (f.grain || f.noise) {
      mkNoise(cw, ch); ctx.imageSmoothingEnabled = false;
      if (f.noise) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = cl(.34 * A, 0, .8); ctx.drawImage(CN[st % 6], 0, 0, cw, ch); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = cl(.22 * A, 0, .6); ctx.drawImage(CN[(st * 5 + 2) % 6], 0, 0, cw, ch) }
      if (f.grain) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = cl(.2 * A, 0, .5); const g = GN[(st * 3 + 1) % 6], ox = Math.floor(hz(st) * 60), oy = Math.floor(hz(st + 5) * 60); ctx.drawImage(g, ox, oy, g.width - 60, g.height - 60, 0, 0, cw, ch) }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true
    }

    /* halftone: dark ink dots on a drifting, breathing grid (dot size follows the darkness underneath) */
    if (f.half) {
      const P = snap(cw, ch), c = Math.max(8, Math.round(15 * px)), s1 = c - ((t * 11 * px) % c), s2 = c - ((t * 7 * px + hz(st) * 2) % c), cols = Math.ceil((cw + s1) / c) + 1, rows = Math.ceil((ch + s2) / c) + 1;
      const S = buf('h', cols, rows), g = S.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true; g.clearRect(0, 0, cols, rows); g.drawImage(P, s1 / c, s2 / c, cw / c, ch / c);
      const d = g.getImageData(0, 0, cols, rows).data, br = 1 + .12 * Math.sin(t * 2.4);
      ctx.fillStyle = 'rgba(26,14,6,' + cl(.5 * A, .2, .8) + ')'; ctx.beginPath();
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const k = (j * cols + i) * 4, l = (d[k] * .3 + d[k + 1] * .59 + d[k + 2] * .11) / 255, r = c * .56 * Math.sqrt(1 - l) * br * (.9 + .2 * hz(i * 7 + j * 13 + st * .5)); if (r < .6) continue; const x = i * c - s1 + c / 2, y = j * c - s2 + c / 2; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832) }
      ctx.fill()
    }

    /* scan lines: crawling lines, a rolling bright band (with a tracking wobble), tube flicker, rare tearing bar */
    if (f.scan) {
      const pat = scanPat(px), off = (t * 36 * px) % (pat ? Math.max(2, Math.round(4 * px)) : 4);
      ctx.save(); ctx.translate(0, off); ctx.globalAlpha = cl(.24 * A, .08, .5); ctx.fillStyle = pat; ctx.fillRect(0, -8 * px, cw, ch + 16 * px); ctx.restore();
      const by = (((t * .2) % 1.25) - .15) * ch, bh = ch * .15; ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,' + cl(.1 * A, .04, .2) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, by, cw, bh); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .05 + .05 * hz(st + 40); ctx.fillStyle = hz(st) > .5 ? '#fff' : '#000'; ctx.fillRect(0, 0, cw, ch); ctx.restore();
      const tp = (t + .6) % 2.7; if (tp < .22) { const P = snap(cw, ch), y = Math.floor((.2 + hz(Math.floor((t + .6) / 2.7)) * .6) * ch), h = Math.round(ch * .035); ctx.drawImage(P, 0, y, cw, h, (hz(st) - .5) * 40 * px * A, y, cw, h); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, y, cw, Math.max(1, Math.round(px))) }
    }

    /* light leaks */
    if (f.leak) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; const R = ch * .55, fl = (.5 + .2 * Math.sin(t * 1.7) + .08 * (hz(st + 70) - .5));
      let x = cw * (1 + .08 * Math.sin(t * .5)), y = ch * (.2 + .1 * Math.sin(t * .7)); let g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(255,120,36,' + cl(.62 * fl * A, 0, .9) + ')'); g.addColorStop(.5, 'rgba(255,70,20,' + cl(.2 * fl * A, 0, .5) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      x = cw * (-.02 + .06 * Math.sin(t * .43 + 2)); y = ch * (.86 + .06 * Math.sin(t * .61)); g = ctx.createRadialGradient(x, y, 0, x, y, R * .8); g.addColorStop(0, 'rgba(255,60,120,' + cl(.36 * (1.2 - fl) * A, 0, .7) + ')'); g.addColorStop(1, 'rgba(255,40,100,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      const sp = (t % 4.2) / 1.3; if (sp < 1) { const cx = (-.3 + 1.6 * sp) * cw, w = cw * .35, g2 = ctx.createLinearGradient(cx - w, 0, cx + w, ch * .6); g2.addColorStop(0, 'rgba(255,200,120,0)'); g2.addColorStop(.5, 'rgba(255,190,110,' + .3 * A * Math.sin(Math.PI * sp) + ')'); g2.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, cw, ch) }
      ctx.restore()
    }

    /* embers rising from the bottom */
    if (f.embers) {
      const G = glow(); ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 46; i++) {
        const life = 1.6 + hz(i + 3) * 1.8, u = t / life + hz(i) * 9, ph = u - Math.floor(u), seed = Math.floor(u) * 7 + i;
        const x0 = (.08 + .84 * hz(i * 2 + seed)) * cw, x = x0 + Math.sin(ph * 6.5 + i) * 26 * px + (hz(i + 9) - .5) * 90 * px * ph, y = ch * (1.02 - ph * (.5 + .4 * hz(i + 4))), a = Math.sin(Math.PI * ph) * (.55 + .45 * hz(i + 1)), r = (3 + hz(i + 5) * 7) * px * A * (1 - .4 * ph);
        ctx.globalAlpha = cl(a, 0, 1); ctx.drawImage(G, x - r * 2, y - r * 2, r * 4, r * 4)
      } ctx.restore()
    }
    ctx.restore()
  }
  return { KEYS, apply, qt, active }
})();
