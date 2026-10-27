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
  q.strokeStyle = 'rgba(70,45,20,.18)'; q.lineWidth = 1.4; for (let k = 0; k < 3; k++) { q.beginPath(); let x = r2() * 540, y = r2() * 960; q.moveTo(x, y); for (let j = 0; j < 14; j++) { x += (r2() - .5) * 70; y += (r2() - .35) * 80; q.lineTo(x, y) } q.stroke() }
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
function sparkle(x, y, r, rot, fill = '#ffe15a') { if (VOX) return; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a + Math.PI / 4) * r * .28, Math.sin(a + Math.PI / 4) * r * .28) } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore() }
function ring(x, y, r, a, col = '#ffe15a') { if (VOX) { ctx.save(); ctx.globalAlpha = a * .8; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = VT().acc; ctx.stroke(); ctx.restore(); return } ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 26; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 14; ctx.strokeStyle = col; ctx.stroke(); ctx.restore() }
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
        if (VOX && k.hl) { const th = VT(); ctx.fillStyle = th.mark; ctx.save(); ctx.rotate(-.015); ctx.fillRect(-w / 2 - 10, -size * .42, (w + 20) * clamp(p * 1.3), size * .9); ctx.restore(); ctx.fillStyle = '#1c130b' } else if (k.hl) { ctx.fillStyle = o.hlBg || '#ff3b4a'; ctx.beginPath(); ctx.roundRect(-w / 2 - 14, -size * .6, w + 28, size * 1.2, 16); ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#fff' } else ctx.fillStyle = VOX ? (o.color ? '#f3ead6' : '#1c130b') : (o.color || INK);
        if (o.stroke && !VOX) { ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(k.txt, -w / 2, 4) }
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
    default: s = VOX ? .86 + .14 * p : p; r = VOX ? 0 : (1 - p) * -.35 }
  return { x, y, s, r, a: ramp(t, t0, t0 + .06), bl }
}
let EDIT = null; const REC = {};   // EDIT = {sel} while the owner arranges items in the in-app preview; REC = where each item of the current scene is drawn
window.setEdit = v => { EDIT = v }; window.getRec = () => REC;
function drawItem(it, t, tx, ty, size, k) {
  const L = it.lay && it.lay[FMT], idx = CUR ? CUR.items.indexOf(it) : -1;   // owner's manual placement for this format (fractions of the canvas)
  let rot0 = 0; if (L) { tx += (L.dx || 0) * W; ty += (L.dy || 0) * H; size *= (L.sz || 1); rot0 = L.rot || 0 }
  const e = ent(it.en, t, it.t, tx, ty); if (!e) return; const fl = EDIT ? 0 : Math.sin(t * 2 + k * 1.7), fr = EDIT ? 0 : Math.sin(t * 1.6 + k) * .03;
  if (idx >= 0) REC[idx] = { x: tx, y: ty, size };
  drawImg(it.src, e.x, e.y + fl * size * .02, size * e.s, e.r + fr + rot0, e.a, e.bl ? `blur(${e.bl}px)` : 'none');
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

/* ---------- layouts per format ---------- */
const FL = (nx, ny) => V ? [W * nx, H * ny] : [W * nx, H * ny]; // fractions, kept for readability
const CONTENT = () => V ? { x0: 0, y0: 200, x1: W, y1: 1370 } : { x0: 0, y0: 150, x1: W, y1: 860 };

/* ---------- templates ---------- */
const TPL = {
  hero(t, sc) {
    const c = CONTENT(), cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2 + (V ? 10 : 0), th = THEMES[sc.theme], its = sc.items, hs = B * (V ? .8 : .72);
    if (its[0]) { const e = ent(its[0].en, t, its[0].t, cx, cy); if (e && t < its[0].t + .9) ring(cx, cy, 80 + (t - its[0].t) * 900, clamp(1 - (t - its[0].t) / .6) * .9, '#fff'); drawItem(its[0], t, cx, cy, hs * (1 + .015 * Math.sin(t * 3)), 0); sparks(t, its[0].t + .1, cx, cy, 6, hs * .62, sc.idx + 3) }
    const n = its.length - 1; its.slice(1).forEach((it, i) => { const a = -Math.PI / 2 + (i + .5) * TAU / Math.max(n, 1) + (n === 1 ? 2.2 : 0) + t * .06, rx = V ? W * .36 : W * .3, ry = V ? H * .2 : H * .27;
      drawItem(it, t, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, B * .34, i + 1) });
    if (sc.text) { const e = spr(t, sc.t0 + .35, .5, 12); if (e > 0) { const yy = V ? c.y1 - 70 : c.y1 - 30; const th2 = sc.text.replace(/\*/g, ''); const w = measure(`900 ${Math.round(B * .07)}px Vz`, th2) + 70; card(cx, yy, Math.min(w, W * .9), B * .13, '#ffe15a', -.03, 1, e); ctx.save(); ctx.translate(cx, yy + 4); ctx.scale(e, e); ctx.rotate(-.03); drawText(sc.text, 0, 0, B * .07, W * .85, { hlBg: '#ff3b4a' }); ctx.restore() } }
  },
  duo(t, sc) {
    const c = CONTENT(), th = THEMES[sc.theme], its = sc.items, sz = B * (V ? .62 : .66);
    const P = V ? [[W * .5, c.y0 + 400], [W * .5, c.y1 - 280]] : [[W * .27, H * .47], [W * .73, H * .47]], mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
    its.slice(0, 2).forEach((it, i) => drawItem(it, t, P[i][0], P[i][1], sz, i));
    const t2 = its[1] ? its[1].t : sc.t0 + 1, lk = spr(t, t2 + .05, .45, 13);
    if (lk > 0) { const kind = sc.link || 'vs'; if (kind === 'plus') plusSign(mid[0], mid[1], 70, '#ffe15a', 1, lk); else if (kind === 'arrow') arrow(mid[0], mid[1], 230, V ? Math.PI / 2 : 0, '#ffe15a', 1, lk); else vsBadge(mid[0], mid[1], 100, 1, lk) }
    if (sc.text) { const e = spr(t, sc.t0 + .4, .5, 12); if (e > 0) { card(W / 2, V ? c.y0 + 50 : c.y0 - 10, W * (V ? .8 : .5), B * .12, '#fff', .02, 1, e); ctx.save(); ctx.translate(W / 2, (V ? c.y0 + 50 : c.y0 - 10) + 4); ctx.scale(e, e); drawText(sc.text, 0, 0, B * .06, W * (V ? .76 : .46), {}); ctx.restore() } }
  },
  trio(t, sc) {
    const c = CONTENT(), its = sc.items, n = Math.max(its.length, 1), sz = B * (n > 3 ? (V ? .46 : .36) : V ? .44 : .46);
    its.forEach((it, i) => { let x, y; if (V && n > 3) { const rows = Math.ceil(n / 2); y = c.y0 + 150 + (c.y1 - c.y0 - 190) * (Math.floor(i / 2) + .5) / rows; x = (n % 2 && i === n - 1) ? W * .5 : W * (i % 2 ? .72 : .28) } else if (V) { const rows = n; y = c.y0 + 110 + (c.y1 - c.y0 - 130) * (i + .5) / rows; x = W * (i % 2 ? .66 : .34) } else { x = W * (i + .5) / n; y = H * .46 + (i % 2 ? 40 : -30) }
      drawItem(it, t, x, y, sz, i) });
    if (sc.text) { const e = spr(t, sc.t0 + .3, .5, 12); if (e > 0) { const y = V ? c.y0 + 50 : c.y0 - 10; card(W / 2, y, W * (V ? .82 : .5), B * .12, '#ffe15a', -.02, 1, e); ctx.save(); ctx.translate(W / 2, y + 4); ctx.scale(e, e); drawText(sc.text, 0, 0, B * .06, W * (V ? .78 : .46), {}); ctx.restore() } }
  },
  statement(t, sc) {
    const c = CONTENT(), cx = W / 2, cy = (c.y0 + c.y1) / 2, th = THEMES[sc.theme], size = B * (V ? .115 : .105), maxW = W * (V ? .8 : .52);
    const words = (sc.text || '').split(/\s+/).filter(Boolean).length, tw = sc.textT || [];
    const gap = Math.min(.2, Math.max(sc.t1 - sc.t0 - 1.2, .6) / Math.max(words, 1)); const reveal = i => spr(t, tw[i] !== undefined ? tw[i] : sc.t0 + .3 + i * gap, .5, 14);
    const e0 = spr(t, sc.t0 + .1, .5, 12); const L = wrapTokens(sc.text || '', `900 ${size}px Vz`, maxW), hh = L.lines.length * size * 1.32 + 90, ww = Math.max(...L.lines.map(l => l.w), 200) + 110;
    its_corner(t, sc, c);
    card(cx, cy, ww, hh, sc.card || '#fff', -.025, 1, e0); ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.025); ctx.scale(e0, e0); drawText(sc.text || '', 0, 0, size, maxW, { reveal }); ctx.restore();
    sparks(t, sc.t0 + .2, cx, cy, 8, ww * .6, sc.idx + 11)
  },
  stat(t, sc) {
    const c = CONTENT(), cx = W / 2, cy = (c.y0 + c.y1) / 2, e0 = spr(t, sc.t0 + .15, .45, 12), num = String(sc.number || '');
    const sz = B * (V ? .34 : .3); const w = measure(`900 ${sz}px Vz`, num) + 120; its_corner(t, sc, c);
    card(cx, cy - (V ? 40 : 10), w, sz * 1.45, '#ffe15a', -.04, 1, e0); ctx.save(); ctx.translate(cx, cy - (V ? 36 : 6)); ctx.rotate(-.04); ctx.scale(e0, e0); ctx.font = `900 ${sz}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = D.meta.rtl ? 'rtl' : 'ltr'; ctx.fillStyle = INK; ctx.fillText(num, 0, 10); ctx.restore();
    if (sc.text) { const e1 = spr(t, sc.t0 + .55, .5, 12); const ty = cy + sz * .95; drawText(sc.text, cx, ty, B * .075, W * (V ? .82 : .6), { color: '#fff', stroke: true, reveal: () => e1 }) }
    sparks(t, sc.t0 + .2, cx, cy, 8, w * .6, sc.idx + 21)
  }
};
function its_corner(t, sc, c) { // items peek in from the corners around a text/number card
  const pos = V ? [[W * .17, c.y0 + 110], [W * .84, c.y1 - 90], [W * .8, c.y0 + 90], [W * .16, c.y1 - 100]] : [[W * .12, H * .3], [W * .88, H * .68], [W * .86, H * .28], [W * .12, H * .72]];
  sc.items.slice(0, 4).forEach((it, i) => drawItem(it, t, pos[i][0], pos[i][1], B * (V ? .36 : .38), i + 2))
}

/* ---------- scene, wipe, camera ---------- */
function drawScene(t, sc) {
  CUR = sc; const th = THEMES[sc.theme], lt = t - sc.t0, dur = sc.t1 - sc.t0, z = EDIT ? 1 : lerp(1.0, 1.07, ramp(lt, 0, dur + .6));
  let shake = 0; sc.items.forEach(it => { const d = t - it.t; if (d > 0 && d < .35) shake = Math.max(shake, 8 * (1 - d / .35)) }); if (EDIT) { shake = 0 }
  ctx.save(); ctx.translate(W / 2 + Math.sin(t * 90) * shake, H / 2 + Math.cos(t * 77) * shake); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2 + (V ? 0 : 0));
  if (VOX) vbg(t, VT(sc), sc); else bg(t, th, W * (.3 + .4 * ((sc.idx * .37) % 1)), H * .55, .06 + .03 * (sc.idx % 3));
  decor(t, sc, th); (TPL[sc.tpl] || TPL.hero)(t, sc); ctx.restore()
}
function wipePath(style, p, k) {
  const e = eio(p); ctx.beginPath();
  if (style === 0) { const cx = k % 2 ? W * .85 : W * .15, cy = H * .6, r = e * Math.hypot(W, H) * 1.1; ctx.arc(cx, cy, r, 0, TAU) }
  else if (style === 1) { const sk = H * .35, x = lerp(-sk - 40, W + sk + 40, e); ctx.moveTo(-1, -1); ctx.lineTo(x + sk, -1); ctx.lineTo(x, H + 1); ctx.lineTo(-1, H + 1); ctx.closePath() }
  else { const y = lerp(H + 40, -40, e); ctx.rect(-1, y, W + 2, H + 100) }
}
const WD = .55;
function sceneIndex(t) { let k = 0; for (let i = 0; i < D.scenes.length; i++) if (t >= D.scenes[i].t0 - .1) k = i; return k }
function world(t) {
  const k = sceneIndex(t), sc = D.scenes[k], p = (t - (sc.t0 - .1)) / WD;
  if (k > 0 && p < 1) { drawScene(t, D.scenes[k - 1]); ctx.save(); wipePath(sc.wipe, p, k); ctx.clip(); drawScene(t, sc); ctx.restore();
    if (sc.wipe === 0) { ctx.save(); wipePath(0, p, k); ctx.lineWidth = 30; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore() } }
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
  const c = CH.find(c => t >= c.t0 && t < c.t1); if (!c) return; const fs = V ? 62 : 54, a = clamp((t - c.t0) / .1) * clamp((c.t1 - t) / .12), rtl = D.meta.rtl;
  ctx.save(); ctx.globalAlpha = a; ctx.font = `700 ${fs}px Vz`; ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; const sp = ctx.measureText(' ').width, y = V ? 1590 : H - 105;
  const tot = c.words.reduce((q, w) => q + w.mw, 0) + sp * (c.words.length - 1); let x = rtl ? W / 2 + tot / 2 : W / 2 - tot / 2;
  c.words.forEach(w => { if (rtl) x -= w.mw; const on = t >= w.t0, p = spr(t, w.t0, .5, 16);
    if (w.kw && on) { ctx.save(); ctx.translate(x + w.mw / 2, y); ctx.scale(.8 + .2 * p, .8 + .2 * p); if (VOX) { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 12; ctx.fillStyle = '#b6ff2e'; ctx.fillText(w.txt, -w.mw / 2, 4); ctx.restore() } else { ctx.fillStyle = '#ffc21a'; ctx.beginPath(); ctx.roundRect(-w.mw / 2 - 16, -fs * .78, w.mw + 32, fs * 1.56, 16); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = INK; ctx.fillText(w.txt, -w.mw / 2, 4); ctx.restore() } }
    else { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 14; ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,.38)'; ctx.fillText(w.txt, x, y + 4 - (on ? bump(t, w.t0, 3) * 8 : 0)); ctx.restore() }
    if (rtl) x -= sp; else x += w.mw + sp }); ctx.restore()
}
function uiVox(t) {
  const y0 = V ? 1330 : H - 280, g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(25,15,5,0)'); g.addColorStop(.45, 'rgba(25,15,5,.55)'); g.addColorStop(1, 'rgba(25,15,5,.9)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  const m = V ? 70 : 90, ty = V ? 98 : 70, bw = W - 2 * m; ctx.save(); ctx.fillStyle = '#2a1f14'; ctx.globalAlpha = .75; ctx.font = '700 30px Vz'; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillText(D.meta.topLabel || '', m, ty);
  ctx.font = '900 38px Vz'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText('ذره‌بین', W - m, ty + 2);
  const by = ty + 54; ctx.globalAlpha = .18; ctx.fillRect(m, by, bw, 4); ctx.globalAlpha = .8; const pr = clamp(t / D.meta.total); ctx.fillRect(D.meta.rtl ? m + bw * (1 - pr) : m, by, bw * pr, 4); ctx.restore()
}
function ui(t) {
  if (VOX) return uiVox(t);
  const y0 = V ? 1380 : H - 230, g = ctx.createLinearGradient(0, y0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, H - y0);
  const m = V ? 70 : 90, ty = V ? 98 : 70, bw = W - 2 * m;
  ctx.save(); ctx.font = '700 30px Vz'; ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillText(D.meta.topLabel || '', m, ty);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(W - m - 220, ty - 34, 220, 64, 6); ctx.stroke(); ctx.font = '700 34px Vz'; ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillText('ذره‌بین', W - m - 110, ty + 1);
  const by = ty + 54; ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(m, by, bw, 4); ctx.fillStyle = '#ffc21a'; const pr = clamp(t / D.meta.total); ctx.fillRect(D.meta.rtl ? m + bw * (1 - pr) : m, by, bw * pr, 4); ctx.restore()
}
const GR = []; function mkGrain() { for (let k = 0; k < 8; k++) { const c = document.createElement('canvas'); c.width = 480; c.height = 270; const g = c.getContext('2d'), im = g.createImageData(480, 270), r = rng(300 + k); for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255 } g.putImageData(im, 0, 0); GR.push(c) } }
function finish(t) { if (VOX) return; const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .5, W / 2, H / 2, Math.max(W, H) * .75); v.addColorStop(0, 'rgba(10,6,20,0)'); v.addColorStop(1, 'rgba(10,6,20,.4)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H) }

function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  world(t); ui(t); subs(t); finish(t);
  const T = D.meta.total; if (t > T - .5) { ctx.fillStyle = `rgba(0,0,0,${ramp(t, T - .5, T)})`; ctx.fillRect(0, 0, W, H) }
  if (t < .25) { ctx.fillStyle = `rgba(0,0,0,${1 - ramp(t, 0, .25)})`; ctx.fillRect(0, 0, W, H) }
}
window.frame = function (t) { draw(t); octx.globalAlpha = 1; octx.drawImage(cv, 0, 0); if (MB) { draw(t + .6 / 30); octx.globalAlpha = .5; octx.drawImage(cv, 0, 0); octx.globalAlpha = 1 } };
window.seek = function (t) { draw(t); octx.globalAlpha = 1; octx.drawImage(cv, 0, 0) };
window.loadData = async (DD, only) => {   // shared by the renderer and the in-app preview (only = scene indices whose images are needed)
  D = DD; VOX = (Q.get('style') || D.meta.style) === 'vox'; applyPalette({ ...D.meta, ...(Q.get('palette') ? { palette: Q.get('palette') } : {}), ...(Q.get('base') ? { base: '#' + Q.get('base') } : {}) });
  D.scenes.forEach((s, i) => { s.idx = i }); const srcs = new Set(); D.scenes.forEach((s, i) => { if (only && !only.includes(i)) return; (s.items || []).forEach(i => srcs.add(i.src)); (s.decor || []).forEach(d => srcs.add(d)) });
  await Promise.all([...[...srcs].map(loadImg), document.fonts.load('900 40px Vz'), document.fonts.load('700 40px Vz')]); await document.fonts.ready;
  mkGrain(); mkPaper(); CH.length = 0; buildCaptions(); seek(0); return true
};
window.ready = Q.get('inline') ? new Promise(() => {}) : (async () => loadData(await (await fetch('../episodes/' + EP + '/scenes.json?' + Date.now())).json()))();
