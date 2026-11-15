/* Zarrebin engine v2 — data-driven comic scenes. Everything is a pure function of time t.
   Query: ?ep=<episode>&fmt=v|h   (v = 1080x1920, h = 1920x1080)
   Data : episodes/<ep>/scenes.json  (built by tools/compile_scenes.py) */
const Q = new URLSearchParams(location.search);
const EP = Q.get('ep'), FMT = Q.get('fmt') === 'h' ? 'h' : 'v', MB = Q.get('mb') !== '0';
const V = FMT === 'v', W = V ? 1080 : 1920, H = V ? 1920 : 1080, B = 1080, TAU = Math.PI * 2, INK = '#14100e';
const out = document.getElementById('out'), cv = document.createElement('canvas');
out.width = cv.width = W; out.height = cv.height = H;
const ctx = cv.getContext('2d'), octx = out.getContext('2d');
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), lerp = (a, b, p) => a + (b - a) * p, ramp = (t, a, b) => clamp((t - a) / (b - a));
const eio = p => { p = clamp(p); return p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2 };
const eoc = p => 1 - Math.pow(1 - clamp(p), 3), eoq = p => 1 - Math.pow(1 - clamp(p), 5);
function spr(t, t0, z = .45, w = 14) { if (t < t0) return 0; const x = t - t0, wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * x) * Math.cos(wd * x) }
function bump(t, t0, a = .08) { if (t < t0) return 0; const x = t - t0; return a * Math.exp(-6 * x) * Math.sin(18 * x) }
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const faDigits = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

const THEMES = [
  { base: '#171a3e', dot: '#2d3a80', ray: '#1e2352', ra: .8, dark: true }, { base: '#ff9d1c', dot: '#f26f0a', ray: '#ffc23c', ra: .55 },
  { base: '#0f4c5c', dot: '#1d7a8c', ray: '#17606f', ra: .8, dark: true }, { base: '#c4166a', dot: '#e0357f', ray: '#d11e70', ra: .7, dark: true },
  { base: '#f4c430', dot: '#e0a800', ray: '#ffd75e', ra: .6 }, { base: '#2a7de1', dot: '#1c5cb8', ray: '#4a97ee', ra: .6, dark: true },
  { base: '#1f8a4c', dot: '#146b38', ray: '#2fa862', ra: .65, dark: true }, { base: '#a3182b', dot: '#7a0f1e', ray: '#c8283c', ra: .7, dark: true }];

/* Vox-like editorial style: flat paper colours, soft shadows, marker highlights, calm motion (enabled with ?style=vox or meta.style) */
let VOX = false;
/* POSTER mode (meta.mode === 'poster'): one full-bleed picture per scene (the owner's own image, scene.photo.src) + text layers on top
   (small label top-left, big number, headline chips with an orange highlighted word, word-by-word caption). Library pictures (items), pinned cards (pins), fx and sounds still work on top of it. */
let POSTER = false; const ORG = '#ff5a1f';
/* decorative symbols (arrow / plus / VS badge / burst ring / sparkle stars) are OFF by default; enable with ?symbols=1 or meta.symbols=true */
let SYM = false;
/* scene title cards (hero/duo/trio) are OFF: the caption itself sits on the paper. ?titles=1 / meta.titles brings them back. */
let TITLES = false;
/* per scene: sc.keyOn true = show the key-text card for this scene, false = hide it, missing = follow TITLES (meta.titles / ?titles=1). The text is sc.text, a *word* between stars is highlighted. */
const tOn = sc => sc.keyOn === false ? false : (TITLES || sc.keyOn === true);
const VTHEMES = [
  { base: '#e0cfa9', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#bba67c' }, { base: '#d8c59c', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#b29c70' },
  { base: '#e6d7b4', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#c4b185' }, { base: '#d4bf95', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#ae986c' },
  { base: '#dcc9a2', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#b8a47a' }, { base: '#e2d1ac', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#bfab80' },
  { base: '#d6c299', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#b5a074' }, { base: '#dac7a0', fg: '#2a1f14', mark: '#c6ff3d', acc: '#7a2e1d', sh: '#baa67c' }];
let PAPER = null, TEX = null;
function mkPaper() { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), im = g.createImageData(512, 512), r = rng(11);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r() - .5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 } g.putImageData(im, 0, 0); PAPER = ctx.createPattern(c, 'repeat');
  const m = document.createElement('canvas'); m.width = 540; m.height = 960; const q = m.getContext('2d'), r2 = rng(5);   // blotches, stains, creases (drawn once, scaled up)
  for (let i = 0; i < 70; i++) { const x = r2() * 540, y = r2() * 960, R = 30 + r2() * 120, gr = q.createRadialGradient(x, y, 0, x, y, R); const dark = r2() < .6; gr.addColorStop(0, dark ? 'rgba(90,60,25,.10)' : 'rgba(255,245,220,.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(x - R, y - R, 2 * R, 2 * R) }
  /* (zig-zag crease lines removed: they read as stray arrows on the paper) */
  const eg = q.createRadialGradient(270, 480, 200, 270, 480, 600); eg.addColorStop(0, 'rgba(60,35,10,0)'); eg.addColorStop(1, 'rgba(60,35,10,.2)'); q.fillStyle = eg; q.fillRect(0, 0, 540, 960); TEX = m }
function torn(x, y, w, h, seed, jag = 9) { const r = rng(seed), pts = [], st = 22; const edge = (x0, y0, x1, y1) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / st)); for (let i = 0; i < n; i++) { const p = i / n; pts.push([lerp(x0, x1, p) + (r() - .5) * jag * 2, lerp(y0, y1, p) + (r() - .5) * jag * 2]) } };
  edge(x - w / 2, y - h / 2, x + w / 2, y - h / 2); edge(x + w / 2, y - h / 2, x + w / 2, y + h / 2); edge(x + w / 2, y + h / 2, x - w / 2, y + h / 2); edge(x - w / 2, y + h / 2, x - w / 2, y - h / 2);
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath() }
function vbg(t, th, sc) {
  ctx.fillStyle = th.base; ctx.fillRect(-300, -300, W + 600, H + 600);
  const r = rng(sc.idx * 31 + 7); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(V ? 1 : 1.8, V ? 1 : 1.8); ctx.rotate((sc.idx % 4) * Math.PI / 2 * (V ? 0 : 0)); ctx.drawImage(TEX, -W / 2 / (V ? 1 : 1.8) * (V ? 1 : 1), -H / 2 / (V ? 1 : 1.8), W / (V ? 1 : 1.8), H / (V ? 1 : 1.8)); ctx.restore();
  ctx.save(); ctx.globalAlpha = .55; for (let i = 0; i < 3; i++) { const cx = W * (.2 + r() * .6), cy = H * (.2 + r() * .6), ww = B * (.5 + r() * .4), hh = B * (.35 + r() * .35); ctx.save(); ctx.translate(Math.sin(t * .1 + i) * 14, Math.cos(t * .08 + i) * 10); ctx.rotate((r() - .5) * .5); ctx.shadowColor = 'rgba(40,25,10,.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; ctx.fillStyle = i % 2 ? '#e4d5b2' : '#c2ac80'; torn(cx, cy, ww, hh, sc.idx * 17 + i, 10); ctx.fill(); ctx.restore() } ctx.restore();
  if (PAPER) { ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .22; ctx.fillStyle = PAPER; ctx.fillRect(-300, -300, W + 600, H + 600); ctx.restore() }
}
let CUR = null; const VT = sc => VTHEMES[((sc || CUR).theme || 0) % VTHEMES.length];
/* palettes: chosen in the app (meta.palette) or one custom base colour (meta.base) */
function hex2hsl(h) { const n = parseInt(h.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, ss = 0;
  if (mx !== mn) { const d = mx - mn; ss = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60 } return [hh, ss, l] }
function hsl2hex(h, s, l) { h = ((h % 360) + 360) % 360; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0') }; return '#' + f(0) + f(8) + f(4) }
const lumOf = h => { const [, , l] = hex2hsl(h); return l };
function comicTheme(base) { const [h, s, l] = hex2hsl(base); return { base, dot: hsl2hex(h, s, Math.max(l - .1, .05)), ray: hsl2hex(h, s, Math.min(l + .08, .95)), ra: l > .55 ? .6 : .75, dark: l < .5 } }
const COMIC_PAL = { warm: ['#ff9d1c', '#f4c430', '#a3182b', '#c4521a', '#e8553d', '#8a4b1f', '#e0a800', '#7a0f1e'], cool: ['#2a7de1', '#0f4c5c', '#1f8a4c', '#171a3e', '#4a2c8a', '#12807a', '#3b5bdb', '#0b6e99'], pop: ['#c4166a', '#f4c430', '#171a3e', '#c4166a', '#f4c430', '#171a3e', '#ff6a00', '#2a7de1'] };
const VOX_PAL = { cream: ['#f1e9d6', '#ece3cd', '#f4edda', '#e8dec6', '#f0e6d0', '#eadfc8', '#f3ebd8', '#e9e0ca'], grey: ['#d3cfc6', '#c9c5bb', '#dad6cd', '#c1bdb3', '#d0ccc2', '#cbc7bd', '#d7d3ca', '#c6c2b8'], dark: ['#7b6a52', '#6f5f49', '#85745b', '#67573f', '#76664e', '#6c5c45', '#80705a', '#705f48'] };
function applyPalette(meta) {
  const pal = meta.palette || '', base = /^#[0-9a-f]{6}$/i.test(meta.base || '') ? meta.base : null;
  if (VOX) { let bases = VOX_PAL[pal]; if (base) { const [h, s, l] = hex2hsl(base); bases = [0, 1, 2, 3, 4, 5, 6, 7].map(i => hsl2hex(h + (i % 4 - 1.5) * 3, s, clamp(l + (i % 3 - 1) * .025, .05, .95))) }
    if (bases) bases.forEach((b, i) => { const [h, s, l] = hex2hsl(b); VTHEMES[i] = { ...VTHEMES[i], base: b, sh: hsl2hex(h, s, Math.max(l - .07, .03)), dark: l < .35 } }) }
  else { let bases = COMIC_PAL[pal]; if (base) { const [h, s, l] = hex2hsl(base); bases = [0, 1, 2, 3, 4, 5, 6, 7].map(i => hsl2hex(h + [0, 25, -25, 50, -50, 180, 150, 210][i], s, clamp(l + [0, .08, -.08, 0, .1, -.15, .05, -.05][i], .1, .85))) }
    if (bases) bases.forEach((b, i) => { THEMES[i] = comicTheme(b) }) }
}
let D = null; const IM = {};
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => { IM[src] = i; r() }; i.onerror = () => { if (i.dataset.r) return r(); i.dataset.r = 1; i.src = 'https://raw.githubusercontent.com/amirzadehes/zarrebin-video/main/' + src }; i.src = '../' + src }) }

/* ---------- primitives ---------- */
function drawImg(src, x, y, size, rot = 0, a = 1, filter = 'none', sx = 1, sy = 1, shadow = true) {
  const i = IM[src]; if (!i) return; const s = size / Math.max(i.width, i.height);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * sx, s * sy); ctx.globalAlpha = a; if (VOX) filter = (filter !== 'none' ? filter + ' ' : '') + 'sepia(.1) saturate(1.05) contrast(1.05)'; if (filter !== 'none') ctx.filter = filter;
  if (shadow) { if (VOX) { ctx.shadowColor = 'rgba(20,25,45,.32)'; ctx.shadowOffsetX = 6 / s; ctx.shadowOffsetY = 22 / s; ctx.shadowBlur = 34 / s } else { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowOffsetX = 16 / s; ctx.shadowOffsetY = 20 / s; ctx.shadowBlur = 0 } }
  ctx.drawImage(i, -i.width / 2, -i.height / 2); ctx.restore()
}
function star(x, y, r1, r2, n, rot, fill, lw = 8) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r2, a = rot + i * Math.PI / n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke() } }
function sparkle(x, y, r, rot, fill = '#ffe15a') { if (VOX || !SYM) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a + Math.PI / 4) * r * .28, Math.sin(a + Math.PI / 4) * r * .28) } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore() }
function ring(x, y, r, a, col = '#ffe15a') { if (!SYM) return; if (VOX) { ctx.save(); ctx.globalAlpha = a * .8; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = VT().acc; ctx.stroke(); ctx.restore(); return } ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 26; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 14; ctx.strokeStyle = col; ctx.stroke(); ctx.restore() }
function card(x, y, w, h, fill = '#ffe15a', rot = 0, a = 1, sc = 1) { if (VOX) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot * .5); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.shadowColor = 'rgba(40,25,10,.45)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 14; ctx.fillStyle = '#efe5cd'; torn(0, 0, w, h, Math.round(w * 7 + h) % 997, 7); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(80,55,25,.35)'; ctx.stroke(); ctx.restore(); return } ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 12; ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore() }
function arrow(x, y, len, rot, col, a = 1, sc = 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  (VOX ? [[VT().acc, 14]] : [[INK, 46], [col, 26]]).forEach(([c, w]) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(len / 2 - 50, -50); ctx.lineTo(len / 2, 0); ctx.lineTo(len / 2 - 50, 50); ctx.stroke() }); ctx.restore() }
function plusSign(x, y, r, col, a = 1, sc = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = a; ctx.lineCap = 'round'; (VOX ? [[VT().acc, 16]] : [[INK, 46], [col, 26]]).forEach(([c, w]) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke() }); ctx.restore() }
function vsBadge(x, y, r, a = 1, sc = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = a; if (VOX) { ctx.beginPath(); ctx.arc(0, 0, r * .85, 0, TAU); ctx.fillStyle = VT().acc; ctx.fill(); ctx.font = `900 ${r * .7}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = '#fff'; ctx.fillText('VS', 0, 4); ctx.restore(); return } star(0, 0, r * .75, r, 12, .2, '#ff3b4a', 8); ctx.font = `900 ${r * .8}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.fillStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText('VS', 0, 4); ctx.fillText('VS', 0, 4); ctx.restore() }
function bg(t, th, cx, cy, spin, W_ = W, H_ = H) {
  if (VOX) return;
  ctx.fillStyle = th.base; ctx.fillRect(-300, -300, W_ + 600, H_ + 600);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * spin); ctx.fillStyle = th.ray; const N = 22; ctx.globalAlpha = th.ra;
  for (let i = 0; i < N; i += 2) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 3200, i * TAU / N, (i + 1) * TAU / N); ctx.closePath(); ctx.fill() } ctx.restore();
  ctx.save(); ctx.fillStyle = th.dot; const sp = 46, md = Math.hypot(W_, H_) * .8;
  for (let y = -40; y < H_ + 60; y += sp) for (let x = -40; x < W_ + 60; x += sp) { const xo = x + ((y / sp) % 2 ? sp / 2 : 0), d = Math.hypot(xo - cx, y - cy) / md, r = clamp(d * d * 15, 0, 17); if (r < 1) continue; ctx.beginPath(); ctx.arc(xo, y, r, 0, TAU); ctx.fill() } ctx.restore()
}

/* ---------- text layout (Persian RTL / Latin LTR) ---------- */
function measure(font, s) { ctx.font = font; return ctx.measureText(s).width }
// tokens: "*word*" marks a highlighted word.
function wrapTokens(text, font, maxW) {
  const toks = text.split(/\s+/).filter(Boolean).map(w => ({ txt: w.replace(/\*/g, ''), hl: w.includes('*') }));
  ctx.font = font; const sp = ctx.measureText(' ').width, lines = []; let cur = [], wid = 0;
  toks.forEach(k => { k.w = ctx.measureText(k.txt).width; if (cur.length && wid + sp + k.w > maxW) { lines.push({ ws: cur, w: wid }); cur = []; wid = 0 } cur.push(k); wid += (cur.length > 1 ? sp : 0) + k.w });
  if (cur.length) lines.push({ ws: cur, w: wid }); return { lines, sp }
}
// draws wrapped text centred at (cx,cy). reveal(i)-> 0..1 alpha/scale per token index
function drawText(text, cx, cy, size, maxW, o = {}) {
  const font = `900 ${size}px Vz`, L = wrapTokens(text, font, maxW), lh = size * 1.32, tot = L.lines.length * lh; let idx = 0;
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr';
  L.lines.forEach((ln, li) => {
    const y = cy - tot / 2 + lh * (li + .5); let x = D.meta.rtl ? cx + ln.w / 2 : cx - ln.w / 2;
    ln.ws.forEach(k => { const p = o.reveal ? o.reveal(idx++) : 1; const w = k.w; if (D.meta.rtl) x -= w; const mx = x + w / 2;
      if (p > 0) { ctx.save(); ctx.translate(mx, y); ctx.scale(.6 + .4 * p, .6 + .4 * p); ctx.globalAlpha = clamp(p * 1.6);
        if (VOX && k.hl) { const th = VT(); ctx.fillStyle = th.mark; ctx.save(); ctx.rotate(-.015); ctx.fillRect(-w / 2 - 10, -size * .42, (w + 20) * clamp(p * 1.3), size * .9); ctx.restore(); ctx.fillStyle = '#1c130b' } else if (k.hl) { ctx.fillStyle = o.hlBg || '#ff3b4a'; ctx.beginPath(); ctx.roundRect(-w / 2 - 14, -size * .6, w + 28, size * 1.2, 16); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#fff' } else ctx.fillStyle = o.ink || (VOX ? (o.color ? '#f3ead6' : '#1c130b') : (o.color || INK));
        if ((o.stroke && !VOX) || o.outline) { ctx.lineWidth = 12; ctx.strokeStyle = VOX ? '#1c130b' : INK; ctx.lineJoin = 'round'; ctx.strokeText(k.txt, -w / 2, 4) }
        ctx.fillText(k.txt, -w / 2, 4); ctx.restore() }
      if (D.meta.rtl) x -= L.sp; else x += w + L.sp })
  }); ctx.restore(); return { h: tot, w: Math.max(...L.lines.map(l => l.w)), n: idx }
}

/* ---------- entrances ---------- */
const ENTS = ['pop', 'left', 'drop', 'spin', 'right', 'rise', 'zoom'];
function ent(kind, t, t0, tx, ty) {
  if (t < t0) return null; const p = VOX ? eoq(ramp(t, t0, t0 + .6)) : spr(t, t0, .45, 13), e = eoq(ramp(t, t0, t0 + .55)); if (VOX && kind === 'spin') kind = 'pop'; let x = tx, y = ty, s = 1, r = 0, bl = 0;
  switch (kind) {
    case 'left': x = lerp(-W * .5, tx, Math.min(p, 1.15)); r = (1 - e) * (VOX ? -.08 : -.5); break;
    case 'right': x = lerp(W * 1.5, tx, Math.min(p, 1.15)); r = (1 - e) * (VOX ? .08 : .5); break;
    case 'drop': y = lerp(-H * .4, ty, Math.min(p, 1.2)); break;
    case 'rise': y = lerp(H * 1.4, ty, Math.min(p, 1.15)); break;
    case 'spin': s = p; r = (1 - e) * -2.6; break;
    case 'zoom': s = lerp(3.4, 1, Math.min(e * 1.1, 1.05)); bl = (1 - e) * 6; break;
    case 'fade': return { x, y, s: 1, r: 0, a: ramp(t, t0, t0 + .55), bl: 0 };
    case 'far': s = lerp(.12, 1, Math.min(eoq(ramp(t, t0, t0 + .7)) * 1.05, 1.05)); break;
    default: s = VOX ? .86 + .14 * p : p; r = VOX ? 0 : (1 - p) * -.35 }
  return { x, y, s, r, a: ramp(t, t0, t0 + .06), bl }
}
let EDIT = null; const REC = {};   // EDIT = {sel} while the owner arranges items in the in-app preview; REC = where each item of the current scene is drawn
window.setEdit = v => { EDIT = v }; window.getRec = () => REC;
function drawItem(it, t, tx, ty, size, k, rx = 0) {
  const L = it.lay && it.lay[FMT], idx = CUR ? CUR.items.indexOf(it) : -1;   // owner's manual placement for this format (fractions of the canvas)
  let rot0 = rx; if (L) { tx += (L.dx || 0) * W; ty += (L.dy || 0) * H; size *= (L.sz || 1); rot0 += L.rot || 0 }
  const e = ent(it.en, t, it.t, tx, ty); if (!e) return;
  if (!EDIT && it.out != null && it.out > it.t + .3 && t >= it.out) { const q = ramp(t, it.out, it.out + .4); if (q >= 1) return; const g = eoq(q); e.a *= 1 - g; e.s *= 1 - .3 * g; e.y -= size * .12 * g }   // owner-set exit time: the picture shrinks and fades away
  const fl = EDIT ? 0 : Math.sin(t * 2 + k * 1.7), fr = EDIT ? 0 : Math.sin(t * 1.6 + k) * .03;
  if (idx >= 0) REC[idx] = { x: tx, y: ty, size };
  const sq = EDIT ? 0 : bump(t, it.t, .11);   // squash & stretch when the object lands
  const fk = window.FXL && FXL.itemKey ? FXL.itemKey(CUR, idx, it) : null, srcK = fk && IM[fk] ? fk : it.src;   // framed item: the picture is drawn inside its frame
  const baseDraw = o => drawImg(srcK, e.x, e.y + fl * size * .02, size * e.s * (o ? o.k : 1), e.r + fr + rot0 + (o ? o.dr : 0), e.a, e.bl ? `blur(${e.bl}px)` : 'none', 1 + sq, 1 - sq);
  if (!EDIT && it.fx && it.fx.length && window.FXL) FXL.item(it, t, { x: e.x, y: e.y + fl * size * .02, size: size * e.s, rot: e.r + fr + rot0, a: e.a, sx: 1 + sq, sy: 1 - sq }, baseDraw);   // image-bound effects follow the picture's own motion
  else baseDraw();
  if (!EDIT) impact(t, it.t, tx, ty, size * .5, k * 13 + (CUR ? CUR.idx : 0));
  if (EDIT && EDIT.sel === idx && idx >= 0) { const im = IM[it.src]; if (im) { const m = Math.max(im.width, im.height), w = im.width / m * size, h = im.height / m * size; ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(rot0); ctx.setLineDash([22, 14]); ctx.lineWidth = 7; ctx.strokeStyle = '#00e5ff'; ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16); ctx.restore() } }
  if (it.label) labelPill(it.label, e.x, e.y + size * .55, size, e.a * clamp(e.s), k);
  return e
}
function labelPill(txt, x, y, size, a, k) {
  const fs = Math.round(B * .052), w = measure(`900 ${fs}px Vz`, txt) + 56; ctx.save(); ctx.translate(x, y); ctx.rotate((k % 2 ? 1 : -1) * .04); ctx.globalAlpha = a;
  card(0, 0, w, fs * 1.7, '#fff', 0, 1); ctx.font = `900 ${fs}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr'; ctx.fillStyle = INK; ctx.fillText(txt, 0, 4); ctx.restore()
}

/* ---------- decor: small floating topic stickers + sparkles ---------- */
function decor(t, sc, th) {
  const r = rng(sc.idx * 97 + 5), items = sc.decor || [];
  items.forEach((src, i) => { for (let j = 0; j < 3; j++) { const z = .5 + r() * .7, x0 = r() * W, sp = (H * .22) * (.6 + z * .5), ph = r() * H * 2, rot = r() * TAU, rs = (r() - .5) * 2, tt = t - sc.t0; if (tt < 0) continue;
    const y = ((ph - tt * sp) % (H + 300) + H + 300) % (H + 300) - 150, a = ramp(tt, 0, .4) * (z < .7 ? .55 : .9); drawImg(src, x0 + Math.sin(tt * .8 + j + i) * 30, y, B * .13 * z, rot + rs * tt, a, z < .65 ? 'blur(2.5px)' : 'none', 1, 1, false) } })
}
function sparks(t, t0, cx, cy, n, R, seed) { const r = rng(seed); for (let i = 0; i < n; i++) { const a = r() * TAU, d = R * (.6 + r() * .7), s = spr(t, t0 + r() * .6, .5, 12); if (s > 0) sparkle(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .8, (20 + r() * 26) * s, t * 1.4 + i) } }

/* short radial impact lines when an object lands (0.42 s) — pure function of t */
function impact(t, t0, x, y, R, seed) {
  const d = t - t0; if (d < 0 || d > .42) return; const p = d / .42, r = rng(seed * 7 + 3), n = 12;
  ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.strokeStyle = VOX ? 'rgba(42,31,20,.5)' : 'rgba(255,255,255,.95)'; ctx.globalAlpha = 1 - p;
  for (let i = 0; i < n; i++) { const a = (i + r() * .6) * TAU / n, r0 = R * (.75 + .35 * eoc(p)), r1 = r0 + R * (.18 + r() * .22) * (1 - p * .5); ctx.lineWidth = (VOX ? 5 : 9) * (1 - p); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke() }
  ctx.restore()
}

/* ---------- rhythm (retention): composition variety + camera beats ----------
   VARY : a hero scene with a single picture alternates the picture to the left / right of centre with a slight tilt, so a run of hero scenes never looks the same.
          Off with meta.vary=false or ?vary=0.
   BEATS: a short camera "punch" (a small spring zoom, ~3.5%) on the onset of an emphasised word (w.kw) and, when nothing new has appeared on screen for a while,
          on the next word, so there is a visual event at least every ~3.5 s. Pure function of time (the parallel chunk rendering stays consistent).
          Off with meta.punch=false or ?punch=0. Never inside the in-app layout editor. */
let VARY = true, BEATS = [];
function heroVary(sc, its) { if (!VARY || EDIT || its.length !== 1) return { dx: 0, rot: 0 }; const s = sc.idx % 2 ? 1 : -1, r = rng(sc.idx * 53 + 9); return { dx: s * W * (V ? .045 : .06), rot: s * (.025 + r() * .03) } }
function buildBeats() {
  BEATS = []; if (!D || D.meta.punch === false || Q.get('punch') === '0') return;
  const ev = []; D.scenes.forEach(s => { ev.push({ t: s.t0, a: .15, b: .6 }); (s.items || []).forEach(i => ev.push({ t: i.t, a: .3, b: .4 })) });   // scene wipes and landing pictures are visual events already
  const near = t => ev.some(e => t > e.t - e.a && t < e.t + e.b), lastEv = t => ev.reduce((m, e) => e.t <= t && e.t > m ? e.t : m, -9);
  let last = -9;
  (D.words || []).forEach(w => { if (w.t0 == null || w.t0 < .8 || near(w.t0)) return; const quiet = w.t0 - Math.max(last, lastEv(w.t0));
    if ((w.kw && w.t0 - last >= 1.5) || quiet >= 3.4) { BEATS.push(w.t0); last = w.t0 } })
}
function beatZ(t) { if (EDIT || !BEATS.length) return 0; let b = -1; for (let i = 0; i < BEATS.length && BEATS[i] <= t; i++) b = BEATS[i]; return b < 0 || t - b > .9 ? 0 : bump(t, b, V ? .055 : .045) }

/* ---------- layouts per format ---------- */
const FL = (nx, ny) => V ? [W * nx, H * ny] : [W * nx, H * ny]; // fractions, kept for readability
const CONTENT = () => V ? { x0: 0, y0: 200, x1: W, y1: 1370 } : { x0: 0, y0: 150, x1: W, y1: 860 };

/* ---------- templates ---------- */
const TPL = {
  hero(t, sc) {
    const c = CONTENT(), cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2 + (V ? 10 : 0), th = THEMES[sc.theme], its = sc.items, hs = B * (V ? .8 : .72);
    if (its[0]) { const vo = heroVary(sc, its), hx = cx + vo.dx; const e = ent(its[0].en, t, its[0].t, hx, cy); if (e && t < its[0].t + .9) ring(hx, cy, 80 + (t - its[0].t) * 900, clamp(1 - (t - its[0].t) / .6) * .9, '#fff'); drawItem(its[0], t, hx, cy, hs * (1 + .015 * Math.sin(t * 3)), 0, vo.rot); sparks(t, its[0].t + .1, hx, cy, 6, hs * .62, sc.idx + 3) }
    const n = its.length - 1; its.slice(1).forEach((it, i) => { const a = -Math.PI / 2 + (i + .5) * TAU / Math.max(n, 1) + (n === 1 ? 2.2 : 0) + t * .06, rx = V ? W * .36 : W * .3, ry = V ? H * .2 : H * .27;
      drawItem(it, t, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, B * .34, i + 1) });
    if (sc.text && tOn(sc)) { const e = spr(t, sc.t0 + .35, .5, 12); if (e > 0) { const yy = V ? c.y1 - 70 : c.y1 - 30; const th2 = sc.text.replace(/\*/g, ''); const w = measure(`900 ${Math.round(B * .07)}px Vz`, th2) + 70; card(cx, yy, Math.min(w, W * .9), B * .13, '#ffe15a', -.03, 1, e); ctx.save(); ctx.translate(cx, yy + 4); ctx.scale(e, e); ctx.rotate(-.03); drawText(sc.text, 0, 0, B * .07, W * .85, { hlBg: '#ff3b4a' }); ctx.restore() } }
  },
  duo(t, sc) {
    const c = CONTENT(), th = THEMES[sc.theme], its = sc.items, sz = B * (V ? .62 : .66);
    const P = V ? [[W * .5, c.y0 + 400], [W * .5, c.y1 - 280]] : [[W * .27, H * .47], [W * .73, H * .47]], mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
    its.slice(0, 2).forEach((it, i) => drawItem(it, t, P[i][0], P[i][1], sz, i));
    const t2 = its[1] ? its[1].t : sc.t0 + 1, lk = spr(t, t2 + .05, .45, 13);
    if (!SYM) impact(t, t2, mid[0], mid[1], B * .22, sc.idx + 5);   // symbol-free face-off: a short impact burst where the two meet
    if (lk > 0 && SYM) { const kind = sc.link || 'vs'; if (kind === 'plus') plusSign(mid[0], mid[1], 70, '#ffe15a', 1, lk); else if (kind === 'arrow') arrow(mid[0], mid[1], 230, V ? Math.PI / 2 : 0, '#ffe15a', 1, lk); else vsBadge(mid[0], mid[1], 100, 1, lk) }
    if (sc.text && tOn(sc)) { const e = spr(t, sc.t0 + .4, .5, 12); if (e > 0) { card(W / 2, V ? c.y0 + 50 : c.y0 - 10, W * (V ? .8 : .5), B * .12, '#fff', .02, 1, e); ctx.save(); ctx.translate(W / 2, (V ? c.y0 + 50 : c.y0 - 10) + 4); ctx.scale(e, e); drawText(sc.text, 0, 0, B * .06, W * (V ? .76 : .46), {}); ctx.restore() } }
  },
  trio(t, sc) {
    const c = CONTENT(), its = sc.items, n = Math.max(its.length, 1), sz = B * (n > 3 ? (V ? .46 : .36) : V ? .44 : .46);
    its.forEach((it, i) => { let x, y; if (V && n > 3) { const rows = Math.ceil(n / 2); y = c.y0 + 150 + (c.y1 - c.y0 - 190) * (Math.floor(i / 2) + .5) / rows; x = (n % 2 && i === n - 1) ? W * .5 : W * (i % 2 ? .72 : .28) } else if (V) { const rows = n; y = c.y0 + 110 + (c.y1 - c.y0 - 130) * (i + .5) / rows; x = W * (i % 2 ? .66 : .34) } else { x = W * (i + .5) / n; y = H * .46 + (i % 2 ? 40 : -30) }
      drawItem(it, t, x, y, sz, i) });
    if (sc.text && tOn(sc)) { const e = spr(t, sc.t0 + .3, .5, 12); if (e > 0) { const y = V ? c.y0 + 50 : c.y0 - 10; card(W / 2, y, W * (V ? .82 : .5), B * .12, '#ffe15a', -.02, 1, e); ctx.save(); ctx.translate(W / 2, y + 4); ctx.scale(e, e); drawText(sc.text, 0, 0, B * .06, W * (V ? .78 : .46), {}); ctx.restore() } }
  },
  statement(t, sc) {
    const c = CONTENT(), cx = W / 2, cy = (c.y0 + c.y1) / 2, th = THEMES[sc.theme], size = B * (V ? .115 : .105), maxW = W * (V ? .8 : .52);
    const words = (sc.text || '').split(/\s+/).filter(Boolean).length, tw = sc.textT || [];
    const gap = Math.min(.2, Math.max(sc.t1 - sc.t0 - 1.2, .6) / Math.max(words, 1)); const reveal = i => spr(t, tw[i] !== undefined ? tw[i] : sc.t0 + .3 + i * gap, .5, 14);
    const e0 = spr(t, sc.t0 + .1, .5, 12); const L = wrapTokens(sc.text || '', `900 ${size}px Vz`, maxW), hh = L.lines.length * size * 1.32 + 90, ww = Math.max(...L.lines.map(l => l.w), 200) + 110;
    its_corner(t, sc, c);
    if (tOn(sc)) { card(cx, cy, ww, hh, sc.card || '#fff', -.025, 1, e0); ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.025); ctx.scale(e0, e0); drawText(sc.text || '', 0, 0, size, maxW, { reveal }); ctx.restore() }
    sparks(t, sc.t0 + .2, cx, cy, 8, ww * .6, sc.idx + 11)
  },
  stat(t, sc) {
    const c = CONTENT(), cx = W / 2, cy = (c.y0 + c.y1) / 2, e0 = spr(t, sc.t0 + .15, .45, 12), num = String(sc.number || '');
    const sz = B * (V ? .34 : .3); const w = measure(`900 ${sz}px Vz`, num) + 120; its_corner(t, sc, c);
    if (tOn(sc)) {   // big number card + label are off: the caption is the only text on screen
    card(cx, cy - (V ? 40 : 10), w, sz * 1.45, '#ffe15a', -.04, 1, e0); ctx.save(); ctx.translate(cx, cy - (V ? 36 : 6)); ctx.rotate(-.04); ctx.scale(e0, e0); ctx.font = `900 ${sz}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr'; ctx.fillStyle = INK; ctx.fillText(num, 0, 10); ctx.restore();
    if (sc.text) { const e1 = spr(t, sc.t0 + .55, .5, 12); const ty = cy + sz * .95; drawText(sc.text, cx, ty, B * .075, W * (V ? .82 : .6), { color: '#fff', stroke: true, reveal: () => e1 }) }
    }
    sparks(t, sc.t0 + .2, cx, cy, 8, w * .6, sc.idx + 21)
  }
};
function its_corner(t, sc, c) { // items peek in from the corners around a text/number card
  const pos = V ? [[W * .17, c.y0 + 110], [W * .84, c.y1 - 90], [W * .8, c.y0 + 90], [W * .16, c.y1 - 100]] : [[W * .12, H * .3], [W * .88, H * .68], [W * .86, H * .28], [W * .12, H * .72]];
  sc.items.slice(0, 4).forEach((it, i) => drawItem(it, t, pos[i][0], pos[i][1], B * (V ? .36 : .38), i + 2))
}


/* ---------- POSTER mode ---------- */
const jit = (t, sd) => { const f = t * 11, i = Math.floor(f), u = f - i, a = hz(i * 1.3 + sd) - .5, b = hz((i + 1) * 1.3 + sd) - .5; return a + (b - a) * u * u * (3 - 2 * u) };
const hz = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) };
const mixHex = (a, b, k) => { const f = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255] }, x = f(a), y = f(b); return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',') + ')' };
function posterColor(t, sc) {   // a colour background instead of a picture: two-colour gradient + a slow, looping effect (pure function of time)
  const c = sc.bgc || {}, c1 = c.c1 || '#c2410c', c2 = c.c2 || '#1c1917', fx = c.fx || 'glow', A = clamp(c.amt == null ? 1 : c.amt, 0, 2), lt = t - sc.t0, cx = W / 2, cy = H * .46, R = Math.hypot(W, H);
  let g = ctx.createLinearGradient(0, 0, W * .35, H); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(-300, -300, W + 600, H + 600);
  ctx.save();
  if (fx === 'glow') { const r = R * (.38 + .03 * Math.sin(lt * 1.1)); g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, mixHex(c1, '#ffffff', .45)); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.globalAlpha = .55 * A; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H) }
  else if (fx === 'rays') { const n = 14; ctx.translate(cx, cy); ctx.rotate(lt * .06); ctx.globalAlpha = .16 * A; ctx.fillStyle = mixHex(c1, '#ffffff', .6); for (let i = 0; i < n; i++) { const a = i * TAU / n; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a, a + TAU / n / 2); ctx.closePath(); ctx.fill() } }
  else if (fx === 'bokeh') { for (let i = 0; i < 16; i++) { const sp = .02 + hz(i + 3) * .03, x = ((hz(i) + lt * sp) % 1) * (W + 200) - 100, y = H - ((hz(i + 40) + lt * sp * 1.4) % 1) * (H + 200) + 100, r = B * (.05 + hz(i + 9) * .1); g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, mixHex(c1, '#ffffff', .55)); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.globalAlpha = (.22 + .2 * hz(i + 5)) * A * (.7 + .3 * Math.sin(lt * 1.3 + i)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() } }
  else if (fx === 'stripes') { const w = B * .16, off = (lt * B * .03) % (w * 2); ctx.globalAlpha = .13 * A; ctx.fillStyle = '#000'; ctx.translate(cx, cy); ctx.rotate(-.45); for (let x = -R + off; x < R; x += w * 2) ctx.fillRect(x, -R, w, 2 * R) }
  else if (fx === 'dots') { const st = B * .06, off = (lt * B * .012) % st; ctx.globalAlpha = .12 * A; ctx.fillStyle = '#000'; for (let y = -st + off; y < H + st; y += st) for (let x = -st; x < W + st; x += st) { const k = (y / H) * .9 + .1; ctx.beginPath(); ctx.arc(x + ((Math.round(y / st) & 1) ? st / 2 : 0), y, st * .32 * k, 0, TAU); ctx.fill() } }
  else if (fx === 'waves') { ctx.fillStyle = mixHex(c1, '#000000', .35); ctx.globalAlpha = .25 * A; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * (.5 + k * .1) + Math.sin(x / W * 5 + lt * (.5 + k * .15) + k) * B * .05); ctx.lineTo(W, H); ctx.closePath(); ctx.fill() } }
  ctx.restore();
  if (c.grain !== false) { ctx.save(); ctx.globalAlpha = .07 * A; const f = Math.floor(lt * 12); for (let i = 0; i < 260; i++) { ctx.fillStyle = hz(i * 3 + f) > .5 ? '#fff' : '#000'; ctx.fillRect(hz(i + f * 7) * W, hz(i * 2 + f * 5 + 1) * H, 2.2, 2.2) } ctx.restore() }
}
function phReveal(e, kind, sw) {   // clip/alpha/scale for the background picture arriving (e: 0..1) over whatever lies beneath; sw: the effect is played backwards (leaving)
  const k = 1 - Math.pow(1 - clamp(e), 3); ctx.beginPath();
  if (kind === 'left') ctx.rect(sw ? W * (1 - k) : 0, 0, W * k, H); else if (kind === 'right') ctx.rect(sw ? 0 : W * (1 - k), 0, W * k, H);
  else if (kind === 'up') ctx.rect(0, sw ? H * (1 - k) : 0, W, H * k); else if (kind === 'down') ctx.rect(0, sw ? 0 : H * (1 - k), W, H * k);
  else if (kind === 'circle') ctx.arc(W / 2, H * .48, Math.hypot(W, H) * .56 * k, 0, TAU); else ctx.rect(-300, -300, W + 600, H + 600);
  ctx.clip(); if (kind === 'zoom') { ctx.translate(W / 2, H / 2); ctx.scale(1 + .3 * (1 - k), 1 + .3 * (1 - k)); ctx.translate(-W / 2, -H / 2) } if (kind === 'fade' || kind === 'zoom') ctx.globalAlpha *= k
}
function posterBg(t, sc) {
  const p = sc.photo || {}, im = p.src && IM[p.src], useCol = sc.bgc && (!im || sc.bgc.on), hasPic = im && !useCol;
  ctx.fillStyle = '#14100e'; ctx.fillRect(-300, -300, W + 600, H + 600);
  const gate = p.t != null || p.out != null, ps0 = p.t != null ? p.t : sc.t0, pe = p.out != null ? p.out : 1e9, ENT = .75, EXT = .55;
  if (useCol) posterColor(t, sc);
  else if (!hasPic || gate) { if (sc.bgc) posterColor(t, sc); else { const g0 = ctx.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#2b2118'); g0.addColorStop(1, '#14100e'); ctx.fillStyle = g0; ctx.fillRect(-300, -300, W + 600, H + 600) } }   // gradient (or the colour background) lies beneath until the picture arrives
  if (hasPic && (EDIT || (t >= ps0 - 1e-6 && t < pe + EXT))) {
    const ein = (t - ps0) / ENT, eout = t > pe ? 1 - (t - pe) / EXT : 1, kin = p.en || 'fade', kout = p.ex || 'fade'; ctx.save();
    if (p.t != null && ein < 1 && !EDIT) phReveal(ein, kin, false); else if (p.out != null && t > pe && !EDIT) { if (kout === 'none') { ctx.restore(); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 0, 0); ctx.clip() } else phReveal(eout, kout, true) }
    const lt = t - Math.max(ps0, sc.t0), pc = clamp(lt / Math.max(.8, sc.t1 - Math.max(ps0, sc.t0) + WD));
    const mo = p.motion && p.motion !== 'auto' ? p.motion : ['in', 'out', 'left', 'right'][sc.idx % 4]; let z = 1.05, ox = 0;
    const dl = p.drift != null ? p.drift : D.meta.drift != null ? D.meta.drift : 0, DA = EDIT ? 0 : [0, 3, 6, 10][dl] || 0;   // micro hand-held drift of the whole picture (px)
    if (EDIT || mo === 'none') z = 1; else if (mo === 'in') z = lerp(1.04, 1.15, pc); else if (mo === 'out') z = lerp(1.15, 1.04, pc); else if (mo === 'left') { z = 1.1; ox = lerp(.03, -.03, pc) } else if (mo === 'right') { z = 1.1; ox = lerp(-.03, .03, pc) }
    if (DA) z = Math.max(z, 1.02 + DA * .0015);
    const jx = DA ? DA * (2 * jit(t, 1) + .6 * Math.sin(t * .9)) : 0, jy = DA ? DA * (2 * jit(t, 7) + .6 * Math.cos(t * .7)) : 0;
    const fx = p.fx == null ? .5 : p.fx, fy = p.fy == null ? .5 : p.fy, k = Math.max(W / im.width, H / im.height) * z, dw = im.width * k, dh = im.height * k;
    const x = clamp((W - dw) * fx + ox * W + jx, Math.min(0, W - dw), 0), y = clamp((H - dh) * fy + jy, Math.min(0, H - dh), 0);
    ctx.drawImage(im, x, y, dw, dh); ctx.restore()
  }
  let g = ctx.createLinearGradient(0, 0, 0, H * .3); g.addColorStop(0, 'rgba(10,6,2,.55)'); g.addColorStop(1, 'rgba(10,6,2,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * .3);
  g = ctx.createLinearGradient(0, H * (V ? .62 : .6), 0, H); g.addColorStop(0, 'rgba(10,6,2,0)'); g.addColorStop(1, 'rgba(10,6,2,.72)'); ctx.fillStyle = g; ctx.fillRect(0, H * (V ? .62 : .6), W, H);
}
TPL.poster = function (t, sc) {   // library pictures only (the owner places them with the usual tools); the layers of text are drawn by posterText
  const its = sc.items || []; if (!its.length) return; const cx = W / 2, cy = H * (V ? .55 : .54), hs = B * (V ? .62 : .56);
  const vo = heroVary(sc, its); drawItem(its[0], t, cx + vo.dx, cy, hs * (1 + .012 * Math.sin(t * 3)), 0, vo.rot);
  const n = its.length - 1; its.slice(1).forEach((it, i) => { const a = -Math.PI / 2 + (i + .5) * TAU / Math.max(n, 1) + (n === 1 ? 2.2 : 0) + t * .05, rx = V ? W * .34 : W * .3, ry = V ? H * .17 : H * .24; drawItem(it, t, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, B * .3, i + 1) })
};
function posterChips(text, size, maxW, cx, top, t, t0, align, o) {   // o: {col: text colour, bg: chip colour or 'none', hl: highlight chip colour}
  o = o || {}; const ga = ctx.globalAlpha, tcol = o.col || '#fff', hcol = o.hl || ORG, chip = o.bg === 'none' ? null : (o.bg || 'rgba(14,10,7,.84)');   // headline on dark chips, *word* on an orange chip; returns its height
  const font = `900 ${size}px Vz`, L = wrapTokens(text, font, maxW), lh = size * 1.5, rtl = D.meta.rtl, padX = size * .38; let idx = 0;
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
  L.lines.forEach((ln, li) => {
    const p = spr(t, t0 + li * .14, .55, 13); if (p <= 0) return; const y = top + lh * (li + .5), w = ln.w + 2 * padX;
    const right = align === 'center' ? cx + w / 2 : align === 'right' ? cx : cx - w;   // box edge: right edge of the chip for 'right'
    const x0 = align === 'center' ? cx - w / 2 : align === 'right' ? cx - w : cx;
    ctx.save(); ctx.translate((x0 + w / 2), y); ctx.scale(.85 + .15 * Math.min(p, 1.1), .85 + .15 * Math.min(p, 1.1)); ctx.globalAlpha = ga * clamp(p * 1.8);
    if (chip) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.fillStyle = chip; ctx.beginPath(); ctx.roundRect(-w / 2, -lh * .46, w, lh * .92, size * .22); ctx.fill(); ctx.shadowColor = 'transparent' }
    let x = rtl ? w / 2 - padX : -w / 2 + padX;
    ln.ws.forEach(k => { const kw = k.w; if (rtl) x -= kw;
      if (k.hl) { ctx.fillStyle = hcol; ctx.beginPath(); ctx.roundRect(x - size * .22, -lh * .4, kw + size * .44, lh * .8, size * .18); ctx.fill() }
      if (!chip) { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3 }
      ctx.fillStyle = tcol; ctx.fillText(k.txt, x, 3); ctx.shadowColor = 'transparent'; if (rtl) x -= L.sp; else x += kw + L.sp });
    ctx.restore(); idx++ });
  ctx.restore(); return L.lines.length * lh
}
function posterText(t, sc) {
  const lt = t - sc.t0, m = V ? 70 : 90, rtl = D.meta.rtl, kp = sc.keyPos && sc.keyPos[FMT], k = sc.keySize || 1; let y = V ? 250 : 180;
  const num = String(sc.number == null ? '' : sc.number).trim();
  if (num) { const e = spr(t, sc.t0 + .15, .5, 12), size = B * (V ? .24 : .2); ctx.save(); ctx.font = `900 ${size}px Vz`; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    ctx.translate(rtl ? W - m : m, y + size * .55); ctx.scale(.7 + .3 * Math.min(e, 1.1), .7 + .3 * Math.min(e, 1.1)); ctx.globalAlpha = clamp(e * 1.6); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fff'; ctx.fillText(num, 0, 0); ctx.restore(); y += size * 1.12 }
  if (sc.text && tOn(sc)) {
    const size = B * (V ? .062 : .055) * k, maxW = W * (V ? .86 : .6), t0 = sc.tIn != null ? sc.tIn : sc.t0 + (num ? .5 : .3), st = { col: sc.tcol, bg: sc.tbg, hl: sc.thl }, A = sc.tAnim || 'pop', ps = lyrPose(t, t0, sc.tOut != null ? sc.tOut : 1e9, A, sc.tAnimOut);
    if (ps) { ctx.save(); ctx.translate(W / 2 + ps.dx, H / 2 + ps.dy); ctx.scale(ps.s, ps.s); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = ps.al; const tt = A === 'pop' ? t0 : t - 5;
      if (kp) { const L = wrapTokens(sc.text, `900 ${size}px Vz`, maxW), hh = L.lines.length * size * 1.5; posterChips(sc.text, size, maxW, kp.x * W, kp.y * H - hh / 2, t, tt, 'center', st) }
      else posterChips(sc.text, size, maxW, rtl ? W - m : m, y, t, tt, rtl ? 'right' : 'left', st)
      ctx.restore() }
  }
  posterLayers(t, sc); posterBubbles(t, sc)
}
/* extra layers (any number per scene): {kind:'text'|'stamp', text, t, out, x, y (centre, fractions of the frame), size (multiplier), col, bg ('none' = no chip), hl, rot (deg, stamps)} */
const STAMPC = {};
function stampSprite(text, size, col, rtl) {
  const key = text + '|' + size + '|' + col + '|' + rtl; if (STAMPC[key]) return STAMPC[key];
  const cv = document.createElement('canvas'), c = cv.getContext('2d'), font = `900 ${size}px Vz`; c.font = font; const tw = c.measureText(text).width, padX = size * .6, padY = size * .42, pad = size * .2;
  const w = Math.ceil(tw + padX * 2 + pad * 2), h = Math.ceil(size * 1 + padY * 2 + pad * 2); cv.width = w; cv.height = h; c.font = font; c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = size * .09; c.beginPath(); c.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, size * .16); c.stroke();
  c.lineWidth = size * .03; c.beginPath(); c.roundRect(pad + size * .15, pad + size * .15, w - 2 * pad - size * .3, h - 2 * pad - size * .3, size * .1); c.stroke(); c.fillText(text, w / 2, h / 2 + size * .04);
  c.globalCompositeOperation = 'destination-out';   // worn ink: random specks and a few scratches punched out (fixed seed, so every frame is identical)
  for (let j = 0; j < 140; j++) { c.globalAlpha = .35 + .6 * hz(j * 3.3); c.beginPath(); c.arc(hz(j * 1.7) * w, hz(j * 2.9 + 5) * h, 1 + hz(j * 4.3) * size * .045, 0, TAU); c.fill() }
  c.globalAlpha = .55; c.lineWidth = 2; for (let j = 0; j < 7; j++) { c.beginPath(); const x = hz(j * 8.1) * w, y = hz(j * 6.2) * h; c.moveTo(x, y); c.lineTo(x + (hz(j * 9) - .5) * size * 1.6, y + (hz(j * 7) - .5) * size * .5); c.stroke() }
  return STAMPC[key] = { cv, w, h }
}
/* entry / exit animation of a layer: entry 'pop' (spring) | left | right | up | down | zoom | slam | fade; exit 'fade' | left | right | up | down | zoom | none. Returns the pose or null when it is not visible */
function lyrPose(t, t0, out, ain, aout) {
  const d = t - t0; if (d < 0) return null; let dx = 0, dy = 0, s = 1, al = 1; const e = eio(d / .45), A = ain || 'pop';
  if (A === 'left') { dx = -(1 - e) * W * .8; al = clamp(d / .15) } else if (A === 'right') { dx = (1 - e) * W * .8; al = clamp(d / .15) } else if (A === 'up') { dy = -(1 - e) * H * .45; al = clamp(d / .15) } else if (A === 'down') { dy = (1 - e) * H * .45; al = clamp(d / .15) }
  else if (A === 'zoom') { s = lerp(.15, 1, Math.min(spr(t, t0, .55, 13), 1.12)); al = clamp(d / .12) }
  else if (A === 'slam') { s = d < .16 ? lerp(2.6, 1, eio(d / .16)) : 1 + .05 * Math.exp(-(d - .16) * 11) * Math.cos((d - .16) * 38); al = clamp(d / .06); if (d >= .16 && d < .42) { const q = Math.sin(d * 150) * 7 * (1 - (d - .16) / .26); dx = q; dy = q * .6 } }
  else if (A === 'fade') al = clamp(d / .35);
  if (t > out) { const x = eio((t - out) / .35), O = aout || 'fade'; if (O === 'none' || x >= 1) return null;
    if (O === 'left') dx -= x * W * .8; else if (O === 'right') dx += x * W * .8; else if (O === 'up') dy -= x * H * .45; else if (O === 'down') dy += x * H * .45; else if (O === 'zoom') s *= lerp(1, .15, x);
    al *= (O === 'fade' || O === 'zoom') ? 1 - x : 1 - x * x * x }
  return { dx, dy, s, al }
}
function posterLayers(t, sc) {
  (sc.layers || []).forEach(L => {
    if (!L || !String(L.text || '').trim()) return; const t0 = L.t != null ? L.t : sc.t0 + .3, out = L.out != null ? L.out : 1e9, P = (L.pos && L.pos[FMT]) || L, st = L.kind === 'stamp', A = L.anim || (st ? 'slam' : 'pop');
    const ps = lyrPose(t, t0, out, A, L.animOut); if (!ps) return; const k = L.size || 1, rtl = D.meta.rtl, cx = (P.x == null ? .5 : P.x) * W, cy = (P.y == null ? (st ? .38 : .5) : P.y) * H;
    if (L.kind === 'number') {
      const size = B * (V ? .24 : .2) * k, q = A === 'pop' ? .7 + .3 * Math.min(spr(t, t0, .5, 12), 1.1) : 1;
      ctx.save(); ctx.font = `900 ${size}px Vz`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.direction = 'ltr'; ctx.translate(cx + ps.dx, cy + ps.dy); ctx.scale(ps.s * q, ps.s * q); ctx.globalAlpha = ps.al * (A === 'pop' ? clamp(spr(t, t0, .5, 12) * 1.6) : 1);
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6; ctx.fillStyle = L.col || '#fff'; ctx.fillText(String(L.text).trim(), 0, 0); ctx.restore(); return
    }
    if (st) {
      const sp = stampSprite(String(L.text).trim(), Math.round(B * .1 * k), L.col || '#e0352b', rtl), q = A === 'pop' ? .6 + .4 * Math.min(spr(t, t0, .5, 14), 1.15) : 1;
      ctx.save(); ctx.translate(cx + ps.dx, cy + ps.dy); ctx.rotate((L.rot == null ? -8 : L.rot) * Math.PI / 180); ctx.scale(ps.s * q, ps.s * q); ctx.globalAlpha = ps.al * .94; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.drawImage(sp.cv, -sp.w / 2, -sp.h / 2); ctx.restore(); return
    }
    const size = B * (V ? .062 : .055) * k, maxW = W * (V ? .86 : .6), Lw = wrapTokens(L.text, `900 ${size}px Vz`, maxW), hh = Lw.lines.length * size * 1.5;
    ctx.save(); ctx.translate(cx + ps.dx, cy + ps.dy); ctx.scale(ps.s, ps.s); ctx.translate(-cx, -cy); ctx.globalAlpha = ps.al; posterChips(L.text, size, maxW, cx, cy - hh / 2, t, A === 'pop' ? t0 : t - 5, 'center', { col: L.col, bg: L.bg, hl: L.hl }); ctx.restore()
  })
}
/* speech bubbles: sc.bubbles = [{text, shape:'speech'|'thought'|'shout'|'box', tail:'dl'|'d'|'dr'|'ul'|'u'|'ur'|'l'|'r'|'none', x,y, size, col, bg, hl, t, out, anim, animOut}] */
function bubblePath(shape, w, h, tail, B) {
  const r = Math.min(h / 2, B * .035) * (shape === 'box' ? .35 : 1), L = B * .075, tb = B * .028, T = { dl: [-.5, 1, 0, 1, -.35], d: [0, 1, 0, 1, 0], dr: [.5, 1, 0, 1, .35], ul: [-.5, -1, 0, -1, -.35], u: [0, -1, 0, -1, 0], ur: [.5, -1, 0, -1, .35], l: [-1, 0, -1, 0, -.35], r: [1, 0, 1, 0, .35] }[tail];
  return { r, L, tb, T }
}
function posterBubbles(t, sc) {
  (sc.bubbles || []).forEach(Bb => {
    if (!Bb || !String(Bb.text || '').trim()) return; const t0 = Bb.t != null ? Bb.t : sc.t0 + .3, out = Bb.out != null ? Bb.out : 1e9, A = Bb.anim || 'pop', P = (Bb.pos && Bb.pos[FMT]) || Bb;
    const ps = lyrPose(t, t0, out, A, Bb.animOut); if (!ps) return; const k = Bb.size || 1, rtl = D.meta.rtl, cx = (P.x == null ? .5 : P.x) * W, cy = (P.y == null ? .3 : P.y) * H, shape = Bb.shape || 'speech', tail = Bb.tail || (shape === 'box' || shape === 'shout' ? 'none' : 'dl');
    const bim = Bb.img && IM[Bb.img];
    if (bim) {   // the owner's own bubble picture (cut out, empty); only the text is ours. Bb.tb = text area as fractions of the picture [x,y,w,h]
      const bw = W * (V ? .56 : .3) * k, bh = bw * bim.height / bim.width, fl = !!Bb.flip, q2 = A === 'pop' ? .7 + .3 * Math.min(spr(t, t0, .5, 12), 1.1) : 1, tb = Bb.tb || [.14, .16, .72, .5], rx = fl ? 1 - tb[0] - tb[2] : tb[0];
      ctx.save(); ctx.translate(cx + ps.dx, cy + ps.dy); ctx.scale(ps.s * q2, ps.s * q2); ctx.globalAlpha = ps.al * (A === 'pop' ? clamp(spr(t, t0, .5, 12) * 1.6) : 1);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.32)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; if (fl) ctx.scale(-1, 1); ctx.drawImage(bim, -bw / 2, -bh / 2, bw, bh); ctx.restore();
      const tw = tb[2] * bw, th = tb[3] * bh, tcx = -bw / 2 + (rx + tb[2] / 2) * bw, tcy = -bh / 2 + (tb[1] + tb[3] / 2) * bh; let fs = B * (V ? .05 : .045) * (Bb.tsz || 1) * Math.max(k, .6), Lq, lq;
      for (let it = 0; it < 18; it++) { Lq = wrapTokens(Bb.text, `900 ${fs}px Vz`, tw); lq = fs * 1.4; if (Lq.lines.length * lq <= th && Math.max(...Lq.lines.map(l => l.w)) <= tw * 1.02) break; fs *= .93 }
      ctx.font = `900 ${fs}px Vz`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
      Lq.lines.forEach((ln, li) => { const y = tcy + (li - (Lq.lines.length - 1) / 2) * lq + 2; let x = tcx + (rtl ? ln.w / 2 : -ln.w / 2);
        ln.ws.forEach(tk => { if (rtl) x -= tk.w; ctx.fillStyle = tk.hl ? (Bb.hl || '#d9420c') : (Bb.col || '#17110d'); ctx.fillText(tk.txt, x, y); if (rtl) x -= Lq.sp; else x += tk.w + Lq.sp }) });
      ctx.restore(); return
    }
    const size = B * (V ? .05 : .045) * k, maxW = W * (V ? .62 : .36) * Math.min(k, 1.4), font = `900 ${size}px Vz`, Lw = wrapTokens(Bb.text, font, maxW), lh = size * 1.45, pad = size * .8;
    const w = Math.max(...Lw.lines.map(l => l.w), size) + pad * 2 + (shape === 'shout' ? size * 1.2 : 0), h = Lw.lines.length * lh + pad * (shape === 'shout' ? 1.6 : 1.1), bg = Bb.bg || '#ffffff', col = Bb.col || '#17110d', ink = '#17110d', q = A === 'pop' ? .7 + .3 * Math.min(spr(t, t0, .5, 12), 1.1) : 1;
    ctx.save(); ctx.translate(cx + ps.dx, cy + ps.dy); ctx.scale(ps.s * q, ps.s * q); ctx.globalAlpha = ps.al * (A === 'pop' ? clamp(spr(t, t0, .5, 12) * 1.6) : 1); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.lineWidth = Math.max(3, B * .005); ctx.strokeStyle = ink; ctx.fillStyle = bg; ctx.lineJoin = 'round';
    const bp = bubblePath(shape, w, h, tail === 'none' ? 'd' : tail, B), T = bp.T;
    const tipOf = () => { const ex = T[0] * w / 2 * (Math.abs(T[0]) === 1 ? 1 : .9), ey = T[1] * h / 2 * (Math.abs(T[1]) === 1 ? 1 : 1), nx = T[2], ny = T[3]; return { bx: ex, by: ey, tx: ex + nx * bp.L * 1.25 + (ny ? T[4] * bp.L * 1.3 : 0), ty: ey + ny * bp.L * 1.25 + (nx ? T[4] * bp.L * 1.3 : 0), nx, ny } };
    if (shape === 'shout') {
      const n = 18, pts = []; for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rr = i % 2 ? .78 : 1.02; pts.push([Math.cos(a) * w / 2 * rr * 1.08, Math.sin(a) * h / 2 * rr * 1.12]) }
      ctx.beginPath(); pts.forEach((p2, i) => i ? ctx.lineTo(p2[0], p2[1]) : ctx.moveTo(p2[0], p2[1])); ctx.closePath(); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke()
    } else {
      let ti = null; if (tail !== 'none' && shape !== 'box') ti = tipOf();
      if (ti && shape === 'speech') { const px = ti.ny ? 1 : 0, py = ti.nx ? 1 : 0; ctx.beginPath(); ctx.moveTo(ti.bx - px * bp.tb, ti.by - py * bp.tb); ctx.lineTo(ti.tx, ti.ty); ctx.lineTo(ti.bx + px * bp.tb, ti.by + py * bp.tb); ctx.closePath(); ctx.fill(); ctx.stroke() }
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, shape === 'thought' ? h * .5 : bp.r); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.stroke();
      if (ti && shape === 'speech') { const px = ti.ny ? 1 : 0, py = ti.nx ? 1 : 0, e = 3; ctx.beginPath(); ctx.moveTo(ti.bx - px * (bp.tb - 2) - ti.nx * e, ti.by - py * (bp.tb - 2) - ti.ny * e); ctx.lineTo(ti.tx - ti.nx * 3, ti.ty - ti.ny * 3); ctx.lineTo(ti.bx + px * (bp.tb - 2) - ti.nx * e, ti.by + py * (bp.tb - 2) - ti.ny * e); ctx.closePath(); ctx.fill() }
      if (ti && shape === 'thought') for (let j = 0; j < 3; j++) { const f = (j + 1) / 3.4, rr = size * (.34 - j * .09); ctx.beginPath(); ctx.arc(ti.bx + (ti.tx - ti.bx) * f, ti.by + (ti.ty - ti.by) * f + ti.ny * rr, rr, 0, TAU); ctx.fill(); ctx.stroke() }
    }
    ctx.shadowColor = 'transparent'; ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
    Lw.lines.forEach((ln, li) => { const y = (li - (Lw.lines.length - 1) / 2) * lh + 2; let x = rtl ? ln.w / 2 : -ln.w / 2;
      ln.ws.forEach(tk => { if (rtl) x -= tk.w; ctx.fillStyle = tk.hl ? (Bb.hl || '#d9420c') : col; ctx.fillText(tk.txt, x, y); if (rtl) x -= Lw.sp; else x += tk.w + Lw.sp }) });
    ctx.restore()
  })
}
/* atmosphere on a scene: sc.atm = [{type:'snow'|'rain'|'lightning'|'fog'|'embers', amt (0.3..2), t (start, optional)}]; every particle is a pure function of time */
function posterAtm(t, sc) {
  const list = sc.atm; if (!list || !list.length) return;
  list.forEach((a, ai) => {
    const amt = a.amt == null ? 1 : a.amt, s0 = a.t != null ? a.t : sc.t0, f = clamp((t - s0) / .5) * clamp((sc.t1 + WD - t) / .5); if (f <= 0) return; const sd = ai * 1000;
    ctx.save(); ctx.globalAlpha = f;
    if (a.type === 'snow') { const n = Math.round(110 * amt * (V ? 1 : 1.4)); ctx.fillStyle = '#fff';
      for (let i = 0; i < n; i++) { const r = 2.5 + hz(i * 7.7 + sd) * 6, sp = 55 + hz(i * 3.1 + sd) * 120 * (r / 6), y = (hz(i * 5.3 + sd) * (H + 80) + t * sp) % (H + 80) - 40, x = hz(i + sd) * W + Math.sin(t * (.5 + hz(i * 2.2)) + i) * 34;
        ctx.globalAlpha = f * (.5 + .45 * hz(i * 9 + sd)); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() } }
    else if (a.type === 'rain') { const n = Math.round(170 * amt * (V ? 1 : 1.5)); ctx.fillStyle = 'rgba(20,35,70,.14)'; ctx.globalAlpha = f * Math.min(amt, 1.2); ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(205,225,255,.5)'; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) { const len = 40 + hz(i * 4.1 + sd) * 60, sp = 1500 + hz(i * 3.7 + sd) * 900, y = (hz(i * 5.9 + sd) * (H + 200) + t * sp) % (H + 200) - 100, x = ((hz(i * 1.9 + sd) * (W + 300) - y * .2) % (W + 300) + W + 300) % (W + 300) - 100;
        ctx.globalAlpha = f * (.25 + .4 * hz(i * 8.3)); ctx.lineWidth = 1.5 + hz(i * 6.1) * 1.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * .2, y + len); ctx.stroke() } }
    else if (a.type === 'lightning') { const P = 2.4 + hz(ai + 3) * 1.4;
      for (let k = Math.floor((t - s0) / P) - 1; k <= Math.floor((t - s0) / P); k++) { if (k < 0) continue; const te = s0 + (k + .25 + .45 * hz(k * 3.7 + sd)) * P, d = t - te; if (d < 0 || d > 1) continue;
        const env = d < .07 ? d / .07 : d < .15 ? 1 - (d - .07) / .08 * .65 : d < .23 ? .35 + (d - .15) / .08 * .65 : Math.exp(-(d - .23) * 6);
        ctx.globalAlpha = f * Math.min(.8, .5 * env * Math.min(amt, 1.6)); ctx.fillStyle = '#e6eeff'; ctx.fillRect(0, 0, W, H);
        if (d < .3) { ctx.globalAlpha = f * Math.min(1, env * 1.3); ctx.strokeStyle = '#f4f8ff'; ctx.shadowColor = '#9db9ff'; ctx.shadowBlur = 28; ctx.lineJoin = 'round'; ctx.lineWidth = 7;
          let x = W * (.2 + .6 * hz(k * 5.1 + sd)), y = 0; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 11; j++) { x += (hz(k * 17 + j) - .5) * 150; y += H * .06; ctx.lineTo(x, y) } ctx.stroke() } } }
    else if (a.type === 'fog') { for (let i = 0; i < 6; i++) { const cx = ((hz(i + sd) * W * 1.6 + t * (14 + 10 * hz(i + 3))) % (W * 1.7)) - W * .35, cy = H * (.4 + .5 * hz(i * 3 + sd)), r = B * (.75 + .6 * hz(i * 5 + sd)), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(225,230,240,${.26 * Math.min(amt, 1.6)})`); g.addColorStop(1, 'rgba(225,230,240,0)'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r) } }
    else if (a.type === 'embers') { const n = Math.round(60 * amt); for (let i = 0; i < n; i++) { const sp = 70 + hz(i * 3.3 + sd) * 140, y = H - ((hz(i * 5.1 + sd) * (H + 60) + t * sp) % (H + 60)) + 30, x = hz(i * 1.3 + sd) * W + Math.sin(t * (1 + hz(i)) + i) * 40, r = 2 + hz(i * 7 + sd) * 4, fl = .55 + .45 * Math.sin(t * 9 + i * 2.3);
        ctx.globalAlpha = f * fl * (1 - y / (H + 60) * .6); ctx.fillStyle = '#ffb347'; ctx.shadowColor = '#ff6a1f'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill() } }
    ctx.restore()
  })
}
function uiPoster(t) {
  const m = V ? 70 : 90, ty = V ? 98 : 70, bw = W - 2 * m, sc = D.scenes[sceneIndex(t)], rtl = D.meta.rtl; ctx.save();
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8; ctx.globalAlpha = .9; ctx.font = '700 28px Vz'; ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'left' : 'right';
  const lab = D.meta.topLabel || (sc && sc.kicker) || ''; ctx.direction = /[\u0600-\u06FF]/.test(lab) ? 'rtl' : 'ltr'; ctx.fillText(lab, rtl ? m : W - m, ty);   // always the episode's name
  const brand = D.meta.brand || 'ذره‌بین'; ctx.font = '900 30px Vz'; ctx.direction = 'rtl'; const bwid = ctx.measureText(brand).width + 36;
  ctx.shadowColor = 'transparent'; ctx.globalAlpha = .95; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.roundRect(rtl ? W - m - bwid : m, ty - 33, bwid, 56, 6); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillText(brand, (rtl ? W - m - bwid : m) + bwid / 2, ty + 2);
  const by = ty + 54; ctx.shadowColor = 'transparent'; ctx.fillStyle = '#fff'; ctx.globalAlpha = .2; ctx.fillRect(m, by, bw, 4); ctx.globalAlpha = .9; ctx.fillStyle = ORG; const pr = clamp(t / D.meta.total); ctx.fillRect(rtl ? m + bw * (1 - pr) : m, by, bw * pr, 4);
  if (D.meta.footer) { ctx.globalAlpha = .55; ctx.fillStyle = '#fff'; ctx.font = '700 26px Vz'; ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.fillText(D.meta.footer, W / 2, H - (V ? 64 : 34)) }
  ctx.restore()
}
function subsPoster(t, c) {
  const fs = V ? 62 : 54, a = clamp((t - c.t0) / .1) * clamp((c.t1 - t) / .12), rtl = D.meta.rtl, e = spr(t, c.t0, .5, 15), y = V ? 1500 : H - 130, k = .94 + .06 * Math.min(e, 1.1);
  ctx.save(); ctx.font = `700 ${fs}px Vz`; const sp = ctx.measureText(' ').width, tot = c.words.reduce((q, w) => q + w.mw, 0) + sp * (c.words.length - 1); ctx.restore();
  ctx.save(); ctx.translate(W / 2, y); ctx.scale(k, k); ctx.globalAlpha = a; ctx.font = `700 ${fs}px Vz`; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; let x = rtl ? tot / 2 : -tot / 2;
  c.words.forEach(w => { if (rtl) x -= w.mw; const on = t >= w.t0, act = on && t < w.t1 + .04, p = spr(t, w.t0, .5, 16);
    ctx.save(); ctx.translate(x + w.mw / 2, 4);
    if (w.kw && on) { const q = .85 + .15 * p; ctx.fillStyle = ORG; ctx.beginPath(); ctx.roundRect(-w.mw / 2 - 14, -fs * .56, (w.mw + 28), fs * 1.12, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.scale(q, q) }
    else { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3; ctx.fillStyle = act ? ORG : on ? '#fff' : 'rgba(255,255,255,.42)' }
    ctx.fillText(w.txt, -w.mw / 2, 0); ctx.restore(); if (rtl) x -= sp; else x += w.mw + sp });
  ctx.restore()
}

/* ---------- scene, wipe, camera ---------- */
/* ---------- owner-placed key text: position per format (sc.keyPos.v / .h = {x,y} as fractions of the frame), paper style, size, turned text ---------- */
const keyCustom = sc => !!(sc.text && tOn(sc) && ((sc.keyPos && sc.keyPos[FMT]) || (sc.keyPaper && sc.keyPaper !== 'auto') || sc.keyTurn || (sc.keySize && sc.keySize !== 1)));
function keyPaperDraw(kind, w, h, seed) {   // paper centred on (0,0) in the current transform
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowOffsetY = 9; ctx.shadowBlur = 16;
  const tornP = fill => { torn(0, 0, w, h, seed, 7); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(80,55,25,.4)'; ctx.stroke() };
  if (kind === 'white' || kind === 'yellow') { ctx.shadowOffsetX = 8; ctx.fillStyle = kind === 'white' ? '#fff' : '#ffe15a'; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke() }
  else if (kind === 'cream') tornP('#f6efe0'); else if (kind === 'old') tornP('#efe5cd'); else if (kind === 'kraft') tornP('#c9a26b'); else if (kind === 'dark') tornP('#2b2118');
  ctx.restore()
}
function keyCard(t, sc) {
  const e = spr(t, sc.t0 + .35, .5, 12); if (e <= 0) return;
  const kp = sc.keyPos && sc.keyPos[FMT], x = (kp ? kp.x : .5) * W, y = (kp ? kp.y : .14) * H, turn = !!sc.keyTurn, k = sc.keySize || 1;
  const size = B * (V ? .08 : .07) * k, maxW = Math.min(turn ? (V ? H * .45 : H * .7) : W * (V ? .8 : .5), W * .9 - 90);
  const kind = (!sc.keyPaper || sc.keyPaper === 'auto') ? (VOX ? 'old' : 'yellow') : sc.keyPaper;
  const L = wrapTokens(sc.text, `900 ${size}px Vz`, Math.max(maxW, size * 3)), hh = L.lines.length * size * 1.32 + 60, ww = Math.max(...L.lines.map(l => l.w), 160) + 90;
  const ink = kind === 'dark' ? '#f3ead6' : kind === 'none' ? '#fff' : undefined;
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn ? -Math.PI / 2 : (kind === 'none' ? 0 : -.02)); ctx.scale(e, e);
  if (kind !== 'none') keyPaperDraw(kind, ww, hh, Math.round(ww * 7 + hh) % 997);
  else { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4 }
  drawText(sc.text, 0, 0, size, Math.max(maxW, size * 3), { ink, outline: kind === 'none', hlBg: '#ff3b4a' });
  ctx.restore()
}
/* ---------- time flip: the whole background is flipped fast to one side (like rewinding a tape) while a year counter rolls ----------
   scene.tf = { on:true, s:2, e:4.5 (seconds after scene start), dir:'past' (right->left, year goes down) | 'future' (left->right, year goes up), y1:'1402', y2:'1370' }
   The background and the counter use the SAME eased progress, so they always run at the same speed. Pure function of t. */
const FAD = '۰۱۲۳۴۵۶۷۸۹';
const tfYear = v => { const n = parseInt(String(v == null ? '' : v).replace(/[۰-۹]/g, d => FAD.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''), 10); return isFinite(n) ? n : null };
function tfOf(sc) {
  const f = sc.tf; if (!f || !f.on || EDIT) return null; const s = Math.max(0, +f.s || 0), e = Math.max(s + .3, +f.e || s + 2), past = f.dir !== 'future', a = tfYear(f.y1), b = tfYear(f.y2);
  const has = a != null && b != null, hi = has ? Math.max(a, b) : 0, lo = has ? Math.min(a, b) : 0;
  return { s, e, past, has, from: past ? hi : lo, to: past ? lo : hi, n: has ? Math.round(clamp(Math.abs(a - b) / 6, 4, 14)) : 6 }
}
function bgLayer(t, sc, th) { if (VOX) vbg(t, VT(sc), sc); else bg(t, th, W * (.3 + .4 * ((sc.idx * .37) % 1)), H * .55, .06 + .03 * (sc.idx % 3)) }
function tfPage(t, sc, th, i, own) {
  if (own) { bgLayer(t, sc, th); if (window.FXL && sc.bg && sc.bg.src) FXL.bg(t, sc); return }
  const k = Math.abs(i), ps = Object.assign(Object.create(sc), { idx: sc.idx + 3 + k * 5, theme: (sc.theme || 0) + k, bg: null }); bgLayer(t, ps, THEMES[ps.theme % THEMES.length])
}
function tfBg(t, sc, th, f) {
  const lt = t - sc.t0, p = ramp(lt, f.s, f.e); if (p <= 0 || p >= 1) { tfPage(t, sc, th, 0, true); return }
  const sg = f.past ? 1 : -1, x = sg * f.n * eio(p), v = x - sg * f.n * eio(ramp(lt - 1 / 30, f.s, f.e)), sp = clamp(Math.abs(v) * 8), ns = 1 + Math.round(4 * sp), last = sg * f.n;
  for (let j = 0; j < ns; j++) {   // motion blur: several copies a little apart, averaged
    const xs = x - v * 1.8 * (j / Math.max(1, ns - 1)), a = Math.floor(xs);
    for (let i = a; i <= a + 1; i++) { ctx.save(); ctx.globalAlpha = 1 / (j + 1); ctx.beginPath(); ctx.rect((i - xs) * W, 0, W + 1, H); ctx.clip(); ctx.translate((i - xs) * W, 0);
      tfPage(t, sc, th, i, i === 0 || i === last); ctx.restore() }
  }
}
function tfCounter(t, sc, f) {
  if (!f.has) return; const lt = t - sc.t0, a = ramp(lt, f.s - .15, f.s + .1) * (1 - ramp(lt, f.e + 1.2, f.e + 1.6)); if (a <= 0) return;
  const L = Math.max(String(f.from).length, String(f.to).length), size = B * (V ? .2 : .17), sw = size * .14;
  ctx.save(); ctx.font = `900 ${size}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.direction = 'ltr'; ctx.lineJoin = 'round';
  // true ink box of a digit (+ outline), so nothing is cut at the top/bottom and the digit sits exactly in the middle of its cell
  const m = ctx.measureText('۸'), asc = m.actualBoundingBoxAscent || size * .72, desc = m.actualBoundingBoxDescent || 0;
  const clipH = asc + desc + sw + size * .1, pitch = clipH + size * .12, dy = (asc - desc) / 2, cw = m.width * 1.08, cy = H * (V ? .4 : .45), ink = VOX ? '#1c130b' : INK;
  const e = tt => eio(ramp(tt - sc.t0, f.s, f.e)), val = tt => lerp(f.from, f.to, e(tt));
  // every column is a continuous wheel that stays close to the real value, and lands exactly on a digit at both ends
  const wheel = (k, tt) => { const q = Math.pow(10, k), ee = e(tt); return val(tt) / q + (Math.floor(f.from / q) - f.from / q) * (1 - ee) + (Math.floor(f.to / q) - f.to / q) * ee };
  const draw = (tt, al) => {
    const v = val(tt), cnt = [1]; let Le = 1;   // leading columns fade out instead of showing a "0" (316, not 0316)
    for (let k = 1; k < L; k++) { const q = Math.pow(10, k), c = clamp((v - .8 * q) / (.2 * q)); cnt.push(c * c * (3 - 2 * c)); Le += cnt[k] }
    const right = W / 2 + Le * cw / 2;
    for (let k = 0; k < L; k++) {
      if (cnt[k] <= 0) continue; const cx = right - (k + .5) * cw, pk = wheel(k, tt), n0 = Math.floor(pk), fr = pk - n0;
      ctx.save(); ctx.globalAlpha = al * cnt[k]; ctx.beginPath(); ctx.rect(cx - cw / 2 - sw, cy - clipH / 2, cw + 2 * sw, clipH); ctx.clip();
      for (let r = -1; r <= 2; r++) { const d = (((n0 + r) % 10) + 10) % 10, y = cy + (r - fr) * pitch + dy; ctx.lineWidth = sw; ctx.strokeStyle = ink; ctx.strokeText(FAD[d], cx, y); ctx.fillStyle = '#fff'; ctx.fillText(FAD[d], cx, y) }
      ctx.restore()
    }
  };
  // motion blur: when the wheels spin fast, average several moments inside one frame so the motion looks smooth, not jumpy
  const sp = Math.abs(wheel(0, t) - wheel(0, t - 1 / 60)) * 60, sh = Math.min(.8 / 30, 1.1 / Math.max(sp, 1e-6)), ns = clamp(Math.round(sp * sh / .35), 0, 6) + 1;   // blur never smears more than about one digit
  for (let j = 0; j < ns; j++) draw(t - (ns > 1 ? sh * j / (ns - 1) : 0), a / (j + 1));
  ctx.restore()
}
function drawScene(t, sc) {
  CUR = sc; if (EDIT) for (const k in REC) delete REC[k]; const th = THEMES[sc.theme], lt = t - sc.t0, dur = sc.t1 - sc.t0, kc = sc.idx % 4, pc = ramp(lt, 0, dur + .6);
  // camera: each scene gets its own move (push in / pull out, with a slow pan) so consecutive scenes never feel identical
  const KK = sc.kick || 'both'; let punch = 0; if (POSTER && !EDIT && (KK === 'punch' || KK === 'both')) sc.items.forEach(it => { const d = t - it.t; if (d > 0 && d < .5) punch = Math.max(punch, .045 * Math.exp(-d * 8)) });
  const z = EDIT ? 1 : POSTER ? 1 + punch : (kc % 2 ? lerp(1.08, 1.0, pc) : lerp(1.0, 1.08, pc)) * (1 + beatZ(t)), px = EDIT || POSTER ? 0 : [-1, 1, 0, 0][kc] * lerp(-16, 16, pc), py = EDIT || POSTER ? 0 : [0, 0, -1, 1][kc] * lerp(-14, 14, pc);
  let shake = 0; sc.items.forEach(it => { const d = t - it.t; if (d > 0 && d < .35) shake = Math.max(shake, 8 * (1 - d / .35)) }); if (EDIT || (POSTER && KK !== 'shake' && KK !== 'both')) { shake = 0 }
  ctx.save(); ctx.translate(W / 2 + px + Math.sin(t * 90) * shake, H / 2 + py + Math.cos(t * 77) * shake); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2 + (V ? 0 : 0));
  const TF = POSTER ? null : tfOf(sc);
  if (POSTER) posterBg(t, sc); else if (TF) tfBg(t, sc, th, TF); else { bgLayer(t, sc, th); if (window.FXL && sc.bg && sc.bg.src) FXL.bg(t, sc) }   // optional background picture layer (engine/fx.js)
  if (window.FXL && sc.pins && sc.pins.length) FXL.pins(t, sc, false);   // optional framed pictures pinned to the backdrop
  decor(t, sc, th); const KC = POSTER ? false : keyCustom(sc); (POSTER ? TPL.poster : (TPL[sc.tpl] || TPL.hero))(t, KC ? Object.assign(Object.create(sc), { keyOn: false }) : sc); if (window.FXL && sc.pins && sc.pins.length) FXL.pins(t, sc, true); if (KC) keyCard(t, sc); if (POSTER) { posterAtm(t, sc); posterText(t, sc) } ctx.restore(); if (TF) tfCounter(t, sc, TF)   // pins marked 'top' (stamps, arrows) lie over the pictures
}
function wipePath(style, p, k) {
  const e = eio(p); ctx.beginPath();
  if (style === 0) { const cx = k % 2 ? W * .85 : W * .15, cy = H * .6, r = e * Math.hypot(W, H) * 1.1; ctx.arc(cx, cy, r, 0, TAU) }
  else if (style === 1) { const sk = H * .35, x = lerp(-sk - 40, W + sk + 40, e); ctx.moveTo(-1, -1); ctx.lineTo(x + sk, -1); ctx.lineTo(x, H + 1); ctx.lineTo(-1, H + 1); ctx.closePath() }
  else if (style === 2) { const y = lerp(H + 40, -40, e); ctx.rect(-1, y, W + 2, H + 100) }
  else if (style === 3) { const n = 8, bh = H / n; for (let i = 0; i < n; i++) ctx.rect(0, i * bh - 1, W * eio(clamp(p * 1.5 - i * .07)), bh + 2) }   // blinds
  else if (style === 4) { const w = e * (W + 40); ctx.rect(W / 2 - w / 2, -1, w, H + 2) }   // split open from the centre
  else { const r = e * (W + H) * .62, cx = W / 2, cy = H * .55; ctx.moveTo(cx - r, cy); ctx.lineTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.closePath() }   // diamond iris
}
const WD = .55;
function sceneIndex(t) { let k = 0; for (let i = 0; i < D.scenes.length; i++) if (t >= D.scenes[i].t0 - .1) k = i; return k }
function world(t) {
  const k = sceneIndex(t), sc = D.scenes[k], p = (t - (sc.t0 - .1)) / WD;
  if (k > 0 && p < 1) { drawScene(t, D.scenes[k - 1]); ctx.save(); wipePath(sc.wipe, p, k); ctx.clip(); drawScene(t, sc); ctx.restore();
    if (sc.wipe === 0 || sc.wipe === 5) { ctx.save(); wipePath(sc.wipe, p, k); ctx.lineWidth = 30; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore() } }
  else drawScene(t, sc)
}

/* ---------- subtitles / UI / finish ---------- */
let CH = [];
function buildCaptions() {
  const fs = V ? 62 : 54, maxW = V ? 900 : 1500, font = `700 ${fs}px Vz`; ctx.font = font; const sp = ctx.measureText(' ').width; const sents = {};
  D.words.forEach(w => (sents[w.s] = sents[w.s] || []).push(w));
  Object.keys(sents).map(Number).sort((a, b) => a - b).forEach(si => { let cur = [], wid = 0; const push = () => { if (cur.length) CH.push({ s: si, words: cur, w: wid }); cur = []; wid = 0 };
    sents[si].forEach(w => { const txt = w.w.replace(/[.،؛«»,;"]/g, ''); if (!txt) return; const mw = ctx.measureText(txt).width; if (cur.length && (cur.length >= (V ? 4 : 7) || wid + sp + mw > maxW)) push(); cur.push({ ...w, txt, mw }); wid += (cur.length > 1 ? sp : 0) + mw }); push() });
  CH.forEach((c, i) => { c.t0 = c.words[0].t0 - .05; const n = CH[i + 1]; c.t1 = n ? Math.min(n.words[0].t0 - .04, c.words[c.words.length - 1].t1 + .6) : c.words[c.words.length - 1].t1 + .5 })
}
function subs(t) {
  if (D.meta.subs === false) return;
  const c = CH.find(c => t >= c.t0 && t < c.t1); if (!c) return; if (POSTER) return subsPoster(t, c); const fs = V ? 62 : 54, a = clamp((t - c.t0) / .1) * clamp((c.t1 - t) / .12), rtl = D.meta.rtl;
  const e = spr(t, c.t0, .5, 15), y = V ? 1480 : H - 130, rot = (c.s % 2 ? 1 : -1) * .012, sc0 = .9 + .1 * Math.min(e, 1.1);
  ctx.save(); ctx.font = `700 ${fs}px Vz`; const sp = ctx.measureText(' ').width, tot = c.words.reduce((q, w) => q + w.mw, 0) + sp * (c.words.length - 1); ctx.restore();
  card(W / 2, y, tot + 120, fs * 1.85, '#fff', rot, a, sc0);   // the paper (vox: torn paper, comic: white card); the caption is the only text of a scene now
  ctx.save(); ctx.translate(W / 2, y); ctx.rotate(rot * (VOX ? .5 : 1)); ctx.scale(sc0, sc0); ctx.globalAlpha = a; ctx.font = `700 ${fs}px Vz`; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const INKC = VOX ? '#1c130b' : INK, ACC = VOX ? '#7a2e1d' : '#e0245e'; let x = rtl ? tot / 2 : -tot / 2;
  c.words.forEach(w => { if (rtl) x -= w.mw; const on = t >= w.t0, act = on && t < w.t1 + .04, p = spr(t, w.t0, .5, 16);
    ctx.save(); ctx.translate(x + w.mw / 2, 4); const k = act ? 1 + .12 * Math.exp(-9 * (t - w.t0)) : 1; ctx.scale(k, k);
    if (w.kw && on) { const q = .85 + .15 * p;
      if (VOX) { ctx.fillStyle = '#c6ff3d'; ctx.save(); ctx.rotate(-.015); ctx.fillRect(-w.mw / 2 - 10, -fs * .46, (w.mw + 20) * clamp(q * 1.1), fs * .92); ctx.restore(); ctx.fillStyle = INKC }
      else { ctx.fillStyle = '#ff3b4a'; ctx.beginPath(); ctx.roundRect(-w.mw / 2 - 14, -fs * .6, w.mw + 28, fs * 1.2, 14); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#fff' } }
    else ctx.fillStyle = act ? ACC : on ? INKC : (VOX ? 'rgba(28,19,11,.38)' : 'rgba(20,16,14,.38)');
    ctx.fillText(w.txt, -w.mw / 2, 0); ctx.restore();
    if (rtl) x -= sp; else x += w.mw + sp }); ctx.restore()
}
function uiVox(t) {
  const y0 = V ? 1330 : H - 280, g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(25,15,5,0)'); g.addColorStop(.45, 'rgba(25,15,5,.55)'); g.addColorStop(1, 'rgba(25,15,5,.9)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  const m = V ? 70 : 90, ty = V ? 98 : 70, bw = W - 2 * m; ctx.save(); ctx.fillStyle = '#2a1f14'; ctx.globalAlpha = .75; ctx.font = '700 30px Vz'; ctx.textAlign = 'left'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr'; ctx.fillText(D.meta.topLabel || '', m, ty);
  ctx.font = '900 38px Vz'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText('ذره‌بین', W - m, ty + 2);
  const by = ty + 54; ctx.globalAlpha = .18; ctx.fillRect(m, by, bw, 4); ctx.globalAlpha = .8; const pr = clamp(t / D.meta.total); ctx.fillRect(D.meta.rtl ? m + bw * (1 - pr) : m, by, bw * pr, 4); ctx.restore()
}
function ui(t) {
  if (POSTER) return uiPoster(t);
  if (VOX) return uiVox(t);
  const y0 = V ? 1380 : H - 230, g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  const m = V ? 70 : 90, ty = V ? 98 : 70, bw = W - 2 * m;
  ctx.save(); ctx.font = '700 30px Vz'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'left'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr'; ctx.fillText(D.meta.topLabel || '', m, ty);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(W - m - 220, ty - 34, 220, 64, 6); ctx.stroke(); ctx.font = '700 34px Vz'; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillText('ذره‌بین', W - m - 110, ty + 1);
  const by = ty + 54; ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(m, by, bw, 4); ctx.fillStyle = '#ffc21a'; const pr = clamp(t / D.meta.total); ctx.fillRect(D.meta.rtl ? m + bw * (1 - pr) : m, by, bw * pr, 4); ctx.restore()
}
const GR = []; function mkGrain() { for (let k = 0; k < 8; k++) { const c = document.createElement('canvas'); c.width = 480; c.height = 270; const g = c.getContext('2d'), im = g.createImageData(480, 270), r = rng(300 + k); for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 } g.putImageData(im, 0, 0); GR.push(c) } }
let GRP = null;   // animated film grain (12 fps), very light so the video encoder stays clean
function grain(t) { if (!GR.length) return; if (!GRP) GRP = GR.map(c => ctx.createPattern(c, 'repeat')); ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = VOX ? .05 : .06; ctx.fillStyle = GRP[Math.floor(t * 12) % GRP.length]; ctx.fillRect(0, 0, W, H); ctx.restore() }
function finish(t) { grain(t); const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .5, W / 2, H / 2, Math.max(W, H) * .75); v.addColorStop(0, 'rgba(10,6,20,0)'); v.addColorStop(1, 'rgba(10,6,20,' + (VOX ? .16 : .4) + ')'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H) }

function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  world(t); ui(t); subs(t); finish(t);
  const T = D.meta.total; if (t > T - .5) { ctx.fillStyle = `rgba(0,0,0,${ramp(t, T - .5, T)})`; ctx.fillRect(0, 0, W, H) }
  if (t < .25) { ctx.fillStyle = `rgba(0,0,0,${1 - ramp(t, 0, .25)})`; ctx.fillRect(0, 0, W, H) }
}
window.frame = function (t) { draw(t); octx.globalAlpha = 1; octx.drawImage(cv, 0, 0); if (MB) { draw(t + .6 / 30); octx.globalAlpha = .5; octx.drawImage(cv, 0, 0); octx.globalAlpha = 1 } };
window.seek = function (t) { draw(t); octx.globalAlpha = 1; octx.drawImage(cv, 0, 0) };
window.loadData = async (DD, only) => {   // shared by the renderer and the in-app preview (only = scene indices whose images are needed)
  D = DD; POSTER = D.meta.mode === 'poster'; VOX = POSTER || (Q.get('style') || D.meta.style) === 'vox'; SYM = Q.get('symbols') === '1' || D.meta.symbols === true; VARY = Q.get('vary') !== '0' && D.meta.vary !== false; TITLES = Q.get('titles') === '1' || D.meta.titles === true; applyPalette({ ...D.meta, ...(Q.get('palette') ? { palette: Q.get('palette') } : {}), ...(Q.get('base') ? { base: '#' + Q.get('base') } : {}) });
  D.scenes.forEach((s, i) => { s.idx = i }); const srcs = new Set(); D.scenes.forEach((s, i) => { if (only && !only.includes(i)) return; (s.items || []).forEach(i => { srcs.add(i.src); (i.fx || []).forEach(f => { if (f && f.type === 'bubble' && f.file) srcs.add(f.file) }) }); (s.bubbles || []).forEach(b => { if (b && b.img) srcs.add(b.img) }); (s.decor || []).forEach(d => srcs.add(d)); if (s.bg && s.bg.src) srcs.add(s.bg.src); if (s.photo && s.photo.src) srcs.add(s.photo.src); (s.pins || []).forEach(p => { if (p && p.src) srcs.add(p.src) }) });
  await Promise.all([...[...srcs].map(loadImg), document.fonts.load('900 40px Vz'), document.fonts.load('700 40px Vz')]); await document.fonts.ready;
  if (window.FXL) await FXL.prepare([...srcs]);
  mkGrain(); mkPaper(); CH.length = 0; buildCaptions(); buildBeats(); seek(0); return true
};
window.ready = Q.get('inline') ? new Promise(() => {}) : (async () => loadData(await (await fetch('../episodes/' + EP + '/scenes.json?' + Date.now())).json()))();
