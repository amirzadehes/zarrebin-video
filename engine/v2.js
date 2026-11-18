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
function drawImg(src, x, y, size, rot = 0, a = 1, filter = 'none', sx = 1, sy = 1, shadow = true, vol = 0) {
  const i = IM[src]; if (!i) return; const s = size / Math.max(i.width, i.height);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * sx, s * sy); ctx.globalAlpha = a; if (VOX) filter = (filter !== 'none' ? filter + ' ' : '') + 'sepia(.1) saturate(1.05) contrast(1.05)'; if (filter !== 'none') ctx.filter = filter;
  if (shadow) { if (VOX) { ctx.shadowColor = 'rgba(20,25,45,.32)'; ctx.shadowOffsetX = 6 / s; ctx.shadowOffsetY = 22 / s; ctx.shadowBlur = 34 / s } else { ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowOffsetX = 16 / s; ctx.shadowOffsetY = 20 / s; ctx.shadowBlur = 0 } }
  ctx.drawImage(i, -i.width / 2, -i.height / 2);
  const vl = vol > 0 ? volLayer(src) : null; if (vl) { ctx.shadowColor = 'transparent'; ctx.filter = 'none'; ctx.globalAlpha = a * vol; ctx.drawImage(vl, -i.width / 2, -i.height / 2, i.width, i.height) }   // soft light on top of the picture: it looks round, its outline never changes
  ctx.restore()
}

/* VOLUME of a cut-out picture (library objects): NOT a geometric warp, only shading, so the outline and the face never change.
   From the picture's own alpha: a bevel (distance from the edge, quarter-circle profile) + a broad dome (blurred mask) make a height field; its normals, lit from the top left, give a white (lit) / black (shade)
   overlay that is cached once per picture and laid over it. Photos (nearly fully opaque) get none. Strength per picture: it.vol 0-3, default D.meta.vol, default 2. */
const VOLC = {}, VOLK = [0, .7, 1, 1.4];
function volLayer(src) {
  if (VOLC[src] !== undefined) return VOLC[src]; VOLC[src] = null; const im = IM[src]; if (!im || !('filter' in ctx)) return null;
  try {
    const k = Math.min(1, 320 / Math.max(im.width, im.height)), w = Math.max(8, Math.round(im.width * k)), h = Math.max(8, Math.round(im.height * k)), n = w * h;
    const c0 = document.createElement('canvas'); c0.width = w; c0.height = h; const g0 = c0.getContext('2d', { willReadFrequently: true }); g0.drawImage(im, 0, 0, w, h); const P = g0.getImageData(0, 0, w, h).data;
    const M = new Float32Array(n); let on = 0; for (let i = 0; i < n; i++) { const a = P[i * 4 + 3]; M[i] = a > 127 ? 1 : 0; on += M[i] } if (on < n * .02 || on > n * .97) return null;
    const dist = new Float32Array(n); for (let i = 0; i < n; i++) dist[i] = M[i] ? 1e6 : 0;   // chamfer distance from the nearest empty pixel (the border of the picture is not an edge)
    const A = 1, Bd = 1.414; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = dist[i]; if (x) v = Math.min(v, dist[i - 1] + A); if (y) { v = Math.min(v, dist[i - w] + A); if (x) v = Math.min(v, dist[i - w - 1] + Bd); if (x < w - 1) v = Math.min(v, dist[i - w + 1] + Bd) } dist[i] = v }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = dist[i]; if (x < w - 1) v = Math.min(v, dist[i + 1] + A); if (y < h - 1) { v = Math.min(v, dist[i + w] + A); if (x < w - 1) v = Math.min(v, dist[i + w + 1] + Bd); if (x) v = Math.min(v, dist[i + w - 1] + Bd) } dist[i] = v }
    let dm = 0; for (let i = 0; i < n; i++) if (dist[i] < 1e5 && dist[i] > dm) dm = dist[i]; const R = Math.max(2, Math.min(dm, .13 * Math.max(w, h)));
    let dome = Float32Array.from(M); const rb = Math.max(2, Math.round(.1 * Math.max(w, h))); for (let q = 0; q < 3; q++) dome = boxBlur(dome, w, h, rb);
    const H = new Float32Array(n); for (let i = 0; i < n; i++) { const t = Math.min(1, dist[i] / R); H[i] = (M[i] ? R * Math.sqrt(1 - (1 - t) * (1 - t)) : 0) + .9 * R * dome[i] }
    const o = document.createElement('canvas'); o.width = w; o.height = h; const og = o.getContext('2d'), id = og.createImageData(w, h), O = id.data, Lx = -.55, Ly = -.6, Lz = .58, ln = Math.hypot(Lx, Ly, Lz), lx = Lx / ln, ly = Ly / ln, lz = Lz / ln, f = 1.6 / R;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, gx = (H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)]) * .5 * f, gy = (H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x]) * .5 * f, nl = 1 / Math.hypot(gx, gy, 1);
      const sh = (-gx * nl) * lx + (-gy * nl) * ly + nl * lz - lz, a = sh > 0 ? Math.min(.6, sh * 2) : Math.min(.7, -sh * 2), v = sh > 0 ? 255 : 0, p = i * 4; O[p] = O[p + 1] = O[p + 2] = v; O[p + 3] = Math.round(a * 255) }
    og.putImageData(id, 0, 0);
    const full = document.createElement('canvas'); full.width = im.width; full.height = im.height; const fg = full.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(o, 0, 0, im.width, im.height);
    fg.globalCompositeOperation = 'destination-in'; fg.drawImage(im, 0, 0); return VOLC[src] = full   // only where the picture itself is opaque
  } catch (e) { return null }
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
let LIVE = false; window.setEdit = v => { EDIT = v }; window.setLive = v => { LIVE = !!v }; window.getRec = () => REC;   // LIVE: the in-app layout editor keeps animating the picture effects (depth) from the wall clock; getRec: where each item is drawn (hit testing in preview.html)
function drawItem(it, t, tx, ty, size, k, rx = 0) {
  const L = it.lay && it.lay[FMT], idx = CUR ? CUR.items.indexOf(it) : -1;   // owner's manual placement for this format (fractions of the canvas)
  let rot0 = rx; if (L) { tx += (L.dx || 0) * W; ty += (L.dy || 0) * H; size *= (L.sz || 1); rot0 += L.rot || 0 }
  const e = ent(it.en, t, it.t, tx, ty); if (!e) return;
  if (!EDIT && it.out != null && it.out > it.t + .3 && t >= it.out) { const q = ramp(t, it.out, it.out + .4); if (q >= 1) return; const g = eoq(q); e.a *= 1 - g; e.s *= 1 - .3 * g; e.y -= size * .12 * g }   // owner-set exit time: the picture shrinks and fades away
  const fl = 0, fr = 0;   // library pictures stay exactly where the owner put them: no floating, no wobble
  const sq = 0;   // no squash & stretch either
  const fk = window.FXL && FXL.itemKey ? FXL.itemKey(CUR, idx, it) : null, srcK = fk && IM[fk] ? fk : it.src;   // framed item: the picture is drawn inside its frame
  if (idx >= 0) REC[idx] = { x: tx, y: ty, size, src: srcK };   // hit box and selection outline follow what is really drawn (the frame included, e.g. a card)
  const baseDraw = o => drawImg(srcK, e.x, e.y + fl * size * .02, size * e.s * (o ? o.k : 1), e.r + fr + rot0 + (o ? o.dr : 0), e.a, e.bl ? `blur(${e.bl}px)` : 'none', 1 + sq, 1 - sq, true, srcK === it.src ? VOLK[it.vol != null ? it.vol : D.meta.vol != null ? D.meta.vol : 2] || 0 : 0);
  if (!EDIT && it.fx && it.fx.length && window.FXL) FXL.item(it, t, { x: e.x, y: e.y + fl * size * .02, size: size * e.s, rot: e.r + fr + rot0, a: e.a, sx: 1 + sq, sy: 1 - sq }, baseDraw);   // image-bound effects follow the picture's own motion
  else baseDraw();
  if (!EDIT) impact(t, it.t, tx, ty, size * .5, k * 13 + (CUR ? CUR.idx : 0));
  if (EDIT && EDIT.sel === idx && idx >= 0) { const im = IM[srcK]; if (im) { const m = Math.max(im.width, im.height), w = im.width / m * size, h = im.height / m * size; ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(rot0); ctx.setLineDash([22, 14]); ctx.lineWidth = 7; ctx.strokeStyle = '#00e5ff'; ctx.strokeRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16); ctx.restore() } }
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
/* 3D depth (parallax): scenes/<ep>/depth/<name>.flat.png (made by tools/make_depth.py, white = near; every object is ONE flat depth, so it moves as a rigid piece and is never bent). The photo is warped as ONE continuous picture: every pixel slides by an amount that follows its own
   depth, so near things move more than far things and there are no separate layers, no seams and no repaired background showing at the sides of objects. A pure function of t. */
const DEP = {}, depthPath = s => s.replace(/(^|\/)bg\//, '$1depth/').replace(/\.[a-z0-9]+$/i, '.png'), flatPath = s => depthPath(s).replace(/\.png$/, '.flat.png');   // .flat.png: rigid regions + ramp (tools/make_depth.py); .png: raw model output, the fallback
function boxBlur(a, w, h, r) {   // separable box blur of a float field (edge-clamped), r px
  if (r < 1) return a; const t = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { const o = y * w; let s = 0; for (let x = -r; x <= r; x++) s += a[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { t[o + x] = s / n; s += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)] } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x] } }
  return a
}
function depthLayers(src, win) {   // win = [x0, y0, x1, y1]: the part of the picture that is on screen (fractions); the depth is stretched over THAT part, so a close-up crop still has full near-far range
  const key = win ? src + '|' + win.map(v => v.toFixed(2)).join(',') : src; if (DEP[key] !== undefined) return DEP[key]; DEP[key] = 0; const im = IM[src], fm = IM[flatPath(src)], dm = fm || IM[depthPath(src)]; if (!im || !dm || !('filter' in ctx)) return 0;
  try {
    const m = Math.min(1, (LIVE ? 720 : 1100) / Math.max(im.width, im.height)), w = Math.max(2, Math.round(im.width * m)), h = Math.max(2, Math.round(im.height * m)), n = w * h;   // the live preview works smaller to stay smooth
    const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c };
    const cI = mk(), gI = cI.getContext('2d', { willReadFrequently: true }); gI.drawImage(im, 0, 0, w, h); const P = gI.getImageData(0, 0, w, h).data;
    const cD = mk(), gD = cD.getContext('2d', { willReadFrequently: true }); gD.filter = 'blur(2px)'; gD.drawImage(dm, 0, 0, w, h); const Q = gD.getImageData(0, 0, w, h).data;
    const hist = new Uint32Array(256), wx0 = win ? Math.max(0, Math.floor(win[0] * w)) : 0, wx1 = win ? Math.min(w, Math.ceil(win[2] * w)) : w, wy0 = win ? Math.max(0, Math.floor(win[1] * h)) : 0, wy1 = win ? Math.min(h, Math.ceil(win[3] * h)) : h; let cnt = 0; for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) { hist[Q[(y * w + x) * 4]]++; cnt++ } if (cnt < 16) { hist.fill(0); for (let i = 0; i < n; i++) hist[Q[i * 4]]++; cnt = n }
    let acc = 0, lo = 0, hi = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc < cnt * .02) lo = v; if (acc < cnt * .98) hi = v + 1 }
    if (hi - lo < 70) { lo = Math.max(0, Math.min(lo, 255 - 70)); hi = lo + 70 }   // a nearly flat view is not blown up into big moves
    let d = new Float32Array(n); for (let i = 0; i < n; i++) d[i] = Math.max(0, Math.min(1, (Q[i * 4] - lo) / Math.max(1, hi - lo)));
    if (fm) d = boxBlur(d, w, h, Math.max(1, Math.round(Math.max(w, h) * .0015)));   // flat map: objects are rigid pieces and the ramp beside them is already in the map, so only a hairline of smoothing (a strong blur would bend the objects again)
    else { const r = Math.max(2, Math.round(Math.max(w, h) * .0065)); for (let k = 0; k < 3; k++) d = boxBlur(d, w, h, r) }   // soft depth edges: the picture bends gently where near meets far, it never tears into layers
    const out = mk(), og = out.getContext('2d'), id = og.createImageData(w, h);
    return DEP[key] = { w, h, P, d, out, og, id, vis: win && win.vis }
  } catch (e) { return 0 }
}
/* Calm edges: the 3D motion fades out towards the sides of what is on screen (meta.edge = fraction of the width that stays completely still at each side, default .2; top and bottom use half of it; 0 = off). The pulled / smeared picture shows up
   mostly at the borders, where the shift is largest and the picture has nothing to be pulled from, so there the picture simply stays flat and the 3D grows smoothly towards the middle. Returns {mx, my} per-column / per-row factors 0..1. */
let DMODE = 'layers';   // 3D style: 'layers' (rigid cut-out layers, nothing is stretched) or 'stretch' (the old pixel warp)
let EDG = .2;   // the calm-edge fraction of the picture being drawn (photo.edge, else meta.edge, else .2)
function edgeMask(X) {
  const fr = EDG; if (!(fr > 0) || !X.vis) return null; const key = fr + '|' + X.vis.join(','); if (X.ek === key) return X.em;
  const { w, h } = X, v = X.vis, sm = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t) }, line = (n, a, b, f) => { const o = new Float32Array(n), A = a * n, B = b * n, k = Math.max(1, (B - A) * f); for (let i = 0; i < n; i++) o[i] = sm(Math.min(i - A, B - i) / k); return o };
  X.ek = key; return X.em = { mx: line(w, v[0], v[2], fr), my: line(h, v[1], v[3], fr / 2) }
}
/* Bounded stretching (the principled fix for pulled / bent pictures): a pixel's shift is (ox, oy) * depth, so the picture is stretched by about shift-range * depth-gradient. Wherever a depth map falls off faster than that allows (soft model edges, thin objects, steps between pieces),
   the shift field would be pulled out like rubber. Here the depth is limited, per frame and for THIS move size, to a slope of at most meta.stretch (default .55 = the picture is never stretched more than ~1.5x anywhere): a max-dilation cone, so near things keep their exact depth
   (they stay rigid) and only the farther pixels beside them slope down gently. meta.stretch = 0 turns it off. */
function stretchLimit(X, S) {
  const L = D.meta.stretch != null ? +D.meta.stretch : .55; if (!(L > 0) || !(S > 1)) return X.d;
  const c = L / S, key = Math.round(c * 4000); if (X.lk === key && X.ld) return X.ld;
  const { w, h } = X, o = X.ld || (X.ld = new Float32Array(w * h)); o.set(X.d);
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 1; x < w; x++) { const v = o[r + x - 1] - c; if (v > o[r + x]) o[r + x] = v } for (let x = w - 2; x >= 0; x--) { const v = o[r + x + 1] - c; if (v > o[r + x]) o[r + x] = v } }
  for (let y = 1; y < h; y++) { const r = y * w, q = r - w; for (let x = 0; x < w; x++) { const v = o[q + x] - c; if (v > o[r + x]) o[r + x] = v } }
  for (let y = h - 2; y >= 0; y--) { const r = y * w, q = r + w; for (let x = 0; x < w; x++) { const v = o[q + x] - c; if (v > o[r + x]) o[r + x] = v } }
  X.lk = key; return o
}
/* Layered 3D ("GTA loading screen" look): instead of stretching one picture over the depth map, the picture is cut into 2-3 rigid layers by depth (multi-Otsu on the depth map). Every layer keeps its true colours; the parts that
   a nearer layer covers are filled in behind it (push-pull inpainting), so when the camera moves the near layer slides over the far one and what it uncovers is real picture, never pulled pixels. Nothing is ever stretched. */
function otsu3(d, n) {
  const B = 64, hs = new Float64Array(B); for (let i = 0; i < n; i++) hs[Math.min(B - 1, (d[i] * B) | 0)]++; const Pc = new Float64Array(B), Sc = new Float64Array(B); let a = 0, b = 0;
  for (let k = 0; k < B; k++) { a += hs[k] / n; b += k * hs[k] / n; Pc[k] = a; Sc[k] = b } let best = -1, t = [B / 3, 2 * B / 3];
  for (let i = 1; i < B - 1; i++) for (let j = i + 1; j < B; j++) { const w0 = Pc[i - 1], w1 = Pc[j - 1] - Pc[i - 1], w2 = 1 - Pc[j - 1]; if (w0 < .02 || w1 < .02 || w2 < .02) continue; const m0 = Sc[i - 1] / w0, m1 = (Sc[j - 1] - Sc[i - 1]) / w1, m2 = (Sc[B - 1] - Sc[j - 1]) / w2, v = w0 * m0 * m0 + w1 * m1 * m1 + w2 * m2 * m2; if (v > best) { best = v; t = [i, j] } }
  return [t[0] / B, t[1] / B]
}
function dilateM(m, w, h, r) {   // grow a 0/1 mask by r px (square window, separable)
  const a = new Uint8Array(m.length), o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) { const q = y * w; for (let x = 0; x < w; x++) { let v = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (m[q + k]) { v = 1; break } a[q + x] = v } }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let v = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (a[k * w + x]) { v = 1; break } o[y * w + x] = v }
  return o
}
function inpaintRGB(P, valid, w, h) {   // fill every pixel that is not valid with the colour of the NEAREST valid pixel (two-pass distance sweep), so what a near layer uncovers continues the colours right beside it; returns Float32 rgb (w*h*3)
  const n = w * h, dist = new Float32Array(n), rgb = new Float32Array(n * 3), INF = 1e9; for (let i = 0; i < n; i++) { if (valid[i]) { dist[i] = 0; rgb[i * 3] = P[i * 4]; rgb[i * 3 + 1] = P[i * 4 + 1]; rgb[i * 3 + 2] = P[i * 4 + 2] } else dist[i] = INF }
  const rel = (i, j, c) => { if (dist[j] + c < dist[i]) { dist[i] = dist[j] + c; rgb[i * 3] = rgb[j * 3]; rgb[i * 3 + 1] = rgb[j * 3 + 1]; rgb[i * 3 + 2] = rgb[j * 3 + 2] } };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x > 0) rel(i, i - 1, 1); if (y > 0) { rel(i, i - w, 1); if (x > 0) rel(i, i - w - 1, 1.41); if (x < w - 1) rel(i, i - w + 1, 1.41) } }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (x < w - 1) rel(i, i + 1, 1); if (y < h - 1) { rel(i, i + w, 1); if (x < w - 1) rel(i, i + w + 1, 1.41); if (x > 0) rel(i, i + w - 1, 1.41) } }
  if (dist.some(v => v >= INF)) { let r = 0, g = 0, b = 0, c = 0; for (let i = 0; i < n; i++) if (valid[i]) { r += P[i * 4]; g += P[i * 4 + 1]; b += P[i * 4 + 2]; c++ } c = c || 1; for (let i = 0; i < n; i++) if (dist[i] >= INF) { rgb[i * 3] = r / c; rgb[i * 3 + 1] = g / c; rgb[i * 3 + 2] = b / c } }
  return rgb
}
function inpaintPushPull(P, valid, w, h) {   // push-pull: fill every pixel that is not valid from the valid ones around it; returns Float32 rgb (w*h*3)
  const lv = []; let cw = w, ch = h, s = new Float32Array(w * h * 4); for (let i = 0; i < w * h; i++) { const v = valid[i] ? 1 : 0; s[i * 4] = P[i * 4] * v; s[i * 4 + 1] = P[i * 4 + 1] * v; s[i * 4 + 2] = P[i * 4 + 2] * v; s[i * 4 + 3] = v } lv.push({ w: cw, h: ch, s });
  while (cw > 1 || ch > 1) { const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1), t = new Float32Array(nw * nh * 4), pr = lv[lv.length - 1].s;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) { let r = 0, g = 0, b = 0, wt = 0; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const X1 = Math.min(cw - 1, x * 2 + dx), Y1 = Math.min(ch - 1, y * 2 + dy), k = (Y1 * cw + X1) * 4; r += pr[k]; g += pr[k + 1]; b += pr[k + 2]; wt += pr[k + 3] } const k2 = (y * nw + x) * 4; t[k2] = r / 4; t[k2 + 1] = g / 4; t[k2 + 2] = b / 4; t[k2 + 3] = wt / 4 }
    lv.push({ w: nw, h: nh, s: t }); cw = nw; ch = nh }
  let up = null;   // pull: from the coarsest level down, a pixel keeps its own colour in proportion to how well known it is and takes the rest from the level above
  for (let L = lv.length - 1; L >= 0; L--) { const { w: lw, h: lh, s: ls } = lv[L], res = new Float32Array(lw * lh * 3);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const k = (y * lw + x) * 4, wt = Math.min(1, ls[k + 3] * 1.0), i3 = (y * lw + x) * 3; let r = 0, g = 0, b = 0;
      if (wt > 0) { r = ls[k] / ls[k + 3]; g = ls[k + 1] / ls[k + 3]; b = ls[k + 2] / ls[k + 3] } if (wt < 1 && up) { const u = up.res, fx = Math.max(0, Math.min(up.w - 1, (x + .5) / 2 - .5)), fy = Math.max(0, Math.min(up.h - 1, (y + .5) / 2 - .5)), x0 = fx | 0, y0 = fy | 0, x1 = Math.min(up.w - 1, x0 + 1), y1 = Math.min(up.h - 1, y0 + 1), ax = fx - x0, ay = fy - y0, bl = c => (u[(y0 * up.w + x0) * 3 + c] * (1 - ax) + u[(y0 * up.w + x1) * 3 + c] * ax) * (1 - ay) + (u[(y1 * up.w + x0) * 3 + c] * (1 - ax) + u[(y1 * up.w + x1) * 3 + c] * ax) * ay;   // bilinear, so the fill is smooth, never blocky
        r = r * wt + bl(0) * (1 - wt); g = g * wt + bl(1) * (1 - wt); b = b * wt + bl(2) * (1 - wt) }
      res[i3] = r; res[i3 + 1] = g; res[i3 + 2] = b } up = { w: lw, h: lh, res } }
  return up.res
}
function focusPts(f) { if (!Array.isArray(f) || !f.length) return null; return typeof f[0] === 'number' ? [f] : f.filter(a => Array.isArray(a)) }   // old files kept one spot as [x, y]; now a list of spots
function focusBands(X, pts, band) {   // the person pointed at the main characters (one or more spots): around each spot a region of about the same depth is grown; spots at similar depth share one layer, spots at different depths get a layer each (up to 3); what is nearer than all of them is a layer in front, everything else is the back layer
  const { w, h, d } = X, n = w * h, TOLF = .12, R = [];
  pts.forEach(f => { const sx = Math.max(0, Math.min(w - 1, Math.round(f[0] * w))), sy = Math.max(0, Math.min(h - 1, Math.round(f[1] * h))), vs = [];
    for (let y = Math.max(0, sy - 3); y <= Math.min(h - 1, sy + 3); y++) for (let x = Math.max(0, sx - 3); x <= Math.min(w - 1, sx + 3); x++) vs.push(d[y * w + x]); vs.sort((a, b) => a - b); const d0 = vs[vs.length >> 1], reg = new Uint8Array(n), q = new Int32Array(n); let qh = 0, qt = 0;
    const si = sy * w + sx; reg[si] = 1; q[qt++] = si;
    while (qh < qt) { const i = q[qh++], x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !reg[j] && Math.abs(d[j] - d0) < TOLF) { reg[j] = 1; q[qt++] = j } }
    if (qt >= n * .005) R.push({ d0, reg }) });
  if (!R.length) return false;
  R.sort((a, b) => a.d0 - b.d0); const C = [];   // clusters of regions at similar depth
  R.forEach(r => { const c = C[C.length - 1]; if (c && r.d0 - c.d0 < .1) { for (let i = 0; i < n; i++) if (r.reg[i]) c.reg[i] = 1; c.d0 = (c.d0 + r.d0) / 2 } else C.push({ d0: r.d0, reg: r.reg.slice() }) });
  while (C.length > 3) { let k = 0, bd = 9; for (let i = 1; i < C.length; i++) if (C[i].d0 - C[i - 1].d0 < bd) { bd = C[i].d0 - C[i - 1].d0; k = i } const a = C[k - 1], b = C[k]; for (let i = 0; i < n; i++) if (b.reg[i]) a.reg[i] = 1; a.d0 = (a.d0 + b.d0) / 2; C.splice(k, 1) }
  const topD = C[C.length - 1].d0; let front = 0; band.fill(0);
  for (let i = 0; i < n; i++) { let b = 0; for (let k = 0; k < C.length; k++) if (C[k].reg[i]) b = k + 1; if (!b && d[i] > topD + TOLF) { b = C.length + 1; front++ } band[i] = b }
  if (front < n * .02 || C.length >= 3) for (let i = 0; i < n; i++) if (band[i] === C.length + 1) band[i] = C.length;   // a few small things in front just travel with the nearest character
  return true
}
const HALO_R = +(Q.get('halo') || .009);   // width of that margin as a share of the picture width
function buildLayers(X, focus) {
  const { w, h, P, d } = X, n = w * h; if (n < 64) return null; const band = new Uint8Array(n), FOC = !!focus && focusBands(X, focus, band);
  if (!FOC) { const t = otsu3(d, n); for (let i = 0; i < n; i++) band[i] = d[i] < t[0] ? 0 : d[i] < t[1] ? 1 : 2 }
  const pct = (b, q) => { const hs = new Uint32Array(256); let c = 0; for (let i = 0; i < n; i++) if (band[i] === b) { hs[Math.min(255, (d[i] * 255) | 0)]++; c++ } if (!c) return 0; let a = 0; for (let v = 0; v < 256; v++) { a += hs[v]; if (a >= c * q) return v / 255 } return 1 };
  const TOL = .07; if (!FOC) for (let b = 2; b >= 1; b--) { const lev = pct(b, .9); for (let i = 0; i < n; i++) if (band[i] === b && d[i] < lev - TOL) band[i] = b - 1 }   // the soft ramp beside a near object belongs to the layer behind it, so no background is carried along
  const cnt = [0, 0, 0, 0]; for (let i = 0; i < n; i++) cnt[band[i]]++; if (!FOC) for (let b = 2; b >= 1; b--) if (cnt[b] < n * .02) { for (let i = 0; i < n; i++) if (band[i] === b) band[i] = b - 1; cnt[b - 1] += cnt[b]; cnt[b] = 0 }
  const ids = [0, 1, 2, 3].filter(b => FOC ? cnt[b] > 0 : cnt[b] >= n * .02); if (ids.length < 2) return null;
  const L = [], top = ids[ids.length - 1];
  ids.forEach(b => {
    const isB = new Uint8Array(n), near = new Uint8Array(n), other = new Uint8Array(n); let sf = 0, sc = 0, fv = [];
    for (let i = 0; i < n; i++) { if (band[i] === b) { isB[i] = 1; fv.push(d[i]) } else if (band[i] > b) near[i] = 1; else other[i] = 1 }
    fv.sort((a, c) => a - c); const f = b === ids[0] ? fv[fv.length >> 1] : fv[Math.floor(fv.length * .9)];
    const nearD = dilateM(near, w, h, 3), nearW = b === ids[0] ? dilateM(near, w, h, Math.max(4, Math.round(w * HALO_R))) : null, otherD = dilateM(band.map(v => v !== b ? 1 : 0), w, h, 1), valid = new Uint8Array(n), alpha = new Float32Array(n);   // nearW: a wide margin around the near layers, so the back layer never keeps a rim of the character's own colours (that rim shows up as a ghost halo when the camera moves)
    for (let i = 0; i < n; i++) { valid[i] = isB[i] && !otherD[i] && !(b === ids[0] && nearW[i]) ? 1 : 0; alpha[i] = isB[i] || (b !== top && dilateNear2(i)) ? 1 : 0 }
    function dilateNear2(i) { return nearD[i] && !other[i] }
    const rgb = inpaintRGB(P, valid, w, h); { const ch = [0, 1, 2].map(c => { const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = rgb[i * 3 + c]; return boxBlur(boxBlur(f, w, h, 3), w, h, 3) }); for (let i = 0; i < n; i++) if (!valid[i]) { rgb[i * 3] = ch[0][i]; rgb[i * 3 + 1] = ch[1][i]; rgb[i * 3 + 2] = ch[2][i] } }   // filled areas are painted soft (a gentle blur), real pixels untouched
    const a2 = boxBlur(alpha, w, h, 1), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h), O = im.data;
    for (let i = 0; i < n; i++) { O[i * 4] = rgb[i * 3]; O[i * 4 + 1] = rgb[i * 3 + 1]; O[i * 4 + 2] = rgb[i * 3 + 2]; O[i * 4 + 3] = b === ids[0] ? 255 : Math.round(Math.min(1, a2[i] * 1.15) * 255) }
    g.putImageData(im, 0, 0); L.push({ cv, f })
  }); return { L }
}
function layersWarp(X, ox, oy, kq, focus) {
  const fk = focus ? JSON.stringify(focus) : ''; if (X.lyK !== fk) { X.lyK = fk; X.ly = undefined }
  const Y = X.ly !== undefined ? X.ly : (X.ly = (() => { try { return buildLayers(X, focus) } catch (e) { return null } })()); if (!Y) return null;
  const { w, h } = X, g = X.og, cx = w / 2, cy = h / 2; g.clearRect(0, 0, w, h);
  Y.L.forEach((l, i) => { const q = (1 + kq * l.f) * (i === 0 ? 1.03 : 1); g.save(); g.translate(cx + ox * l.f, cy + oy * l.f); g.scale(q, q); g.translate(-cx, -cy); g.drawImage(l.cv, 0, 0); g.restore() });
  return X.out
}
function depthWarp(X, ox, oy, kq) {   // X: depthLayers result; every pixel moves by (ox, oy) * its depth (image px) and is scaled about the centre by 1 + kq * depth; returns the canvas
  const { w, h, P } = X, EM = edgeMask(X), MX = EM ? EM.mx : null, MY = EM ? EM.my : null, d = stretchLimit(X, Math.max(Math.abs(ox) + Math.abs(kq) * w / 2, Math.abs(oy) + Math.abs(kq) * h / 2)), O = X.id.data, cx = w / 2, cy = h / 2, mx = w - 1, my = h - 1, n = w * h; let i = 0;
  const D = X.D || (X.D = new Float32Array(n)); D.fill(-1);   // depth as it lies AFTER the move (forward splat, nearest wins), so a small near object is found where it has moved to
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const f = d[y * w + x], m = MX ? MX[x] * MY[y] : 1, q = 1 + kq * m * f, X1 = Math.round(cx + (x - cx) * q + ox * m * f), Y1 = Math.round(cy + (y - cy) * q + oy * m * f); if (X1 >= 0 && X1 < w && Y1 >= 0 && Y1 < h) { const j = Y1 * w + X1; if (f > D[j]) D[j] = f } }
  for (let y = 0; y < h; y++) { const o = y * w; let x = 0; while (x < w) { if (D[o + x] >= 0) { x++; continue } let e = x; while (e < w && D[o + e] < 0) e++; const a = x > 0 ? D[o + x - 1] : -1, b = e < w ? D[o + e] : -1, v = a < 0 ? (b < 0 ? 0 : b) : b < 0 ? a : Math.min(a, b); for (let k = x; k < e; k++) D[o + k] = v; x = e } }   // holes (uncovered background) take the farther of their two neighbours
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const f = D[i], m = MX ? MX[x] * MY[y] : 1, q = 1 + kq * m * f; let sx = cx + (x - cx - ox * m * f) / q, sy = cy + (y - cy - oy * m * f) / q;
    sx = sx < 0 ? 0 : sx > mx ? mx : sx; sy = sy < 0 ? 0 : sy > my ? my : sy;
    const x0 = sx | 0, y0 = sy | 0, x1 = x0 < mx ? x0 + 1 : x0, y1 = y0 < my ? y0 + 1 : y0, fx = sx - x0, fy = sy - y0, a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, e = fx * fy,
      p00 = (y0 * w + x0) * 4, p10 = (y0 * w + x1) * 4, p01 = (y1 * w + x0) * 4, p11 = (y1 * w + x1) * 4, o = i * 4;
    O[o] = P[p00] * a + P[p10] * b + P[p01] * c + P[p11] * e; O[o + 1] = P[p00 + 1] * a + P[p10 + 1] * b + P[p01 + 1] * c + P[p11 + 1] * e; O[o + 2] = P[p00 + 2] * a + P[p10 + 2] * b + P[p01 + 2] * c + P[p11 + 2] * e; O[o + 3] = 255
  }
  X.og.putImageData(X.id, 0, 0); return X.out
}
/* 3D camera (WebGL, optional): the same depth map as above, but the picture is seen through a real moving camera. A fragment shader marches each pixel's ray through the depth field (near = white), so near things shift more than far ones, objects hide what is behind them, and the camera can pivot about a focus plane (the subject holds still, near and far move opposite ways). Optional soft focus falls off with distance from that plane. A pure function of t. The strength is the depth level (meta.depth / photo.depth, 0 = no depth motion); meta.cam3 / photo.cam3 picks the move; any WebGL problem falls back to the CPU warp above. */
let GLR;
function glRig() {
  if (GLR !== undefined) return GLR; GLR = null;
  try {
    const cv = document.createElement('canvas'), g = cv.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true }); if (!g) return null;
    const sh = (ty, src) => { const o = g.createShader(ty); g.shaderSource(o, src); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o };
    const pr = g.createProgram();
    g.attachShader(pr, sh(g.VERTEX_SHADER, 'attribute vec2 a;varying vec2 q;void main(){q=vec2(.5+.5*a.x,.5-.5*a.y);gl_Position=vec4(a,0.,1.);}'));
    g.attachShader(pr, sh(g.FRAGMENT_SHADER, `precision highp float;varying vec2 q;uniform sampler2D C,Dm;uniform vec2 c;uniform float kq,pv,foc,bl,ar;uniform vec4 vs;uniform vec2 ef;float mk=1.;
float sm1(float t){t=clamp(t,0.,1.);return t*t*(3.-2.*t);}
vec2 P(float h){float s=(h-pv)*mk;return vec2(.5)+(q-vec2(.5)-c*s)/(1.+kq*s);}
void main(){
  if(ef.x>0.){mk=sm1(min(q.x-vs.x,vs.z-q.x)/max(.001,(vs.z-vs.x)*ef.x))*sm1(min(q.y-vs.y,vs.w-q.y)/max(.001,(vs.w-vs.y)*ef.x*.5));}
  float hit=0.,hp=1.;float gp=texture2D(Dm,P(1.)).r-1.;
  if(gp>=0.){hit=1.;}else{
    for(int i=1;i<=56;i++){float hc=1.-float(i)/56.;float gc=texture2D(Dm,P(hc)).r-hc;
      if(gc>=0.){float a=hp,b=hc;for(int k=0;k<6;k++){float m=.5*(a+b);if(texture2D(Dm,P(m)).r-m>=0.)b=m;else a=m;}hit=b;break;}
      hp=hc;}
  }
  vec2 pp=P(hit);vec3 col=texture2D(C,pp).rgb;
  if(bl>0.){float r=bl*abs(texture2D(Dm,pp).r-foc);
    if(r>.0004){vec3 acc=col;for(int k=1;k<=12;k++){float fk=float(k),an=fk*2.39996,rr=r*sqrt(fk/12.);acc+=texture2D(C,pp+vec2(cos(an),sin(an)*ar)*rr).rgb;}col=acc/13.;}}
  gl_FragColor=vec4(col,1.);}`));
    g.linkProgram(pr); if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(pr));
    const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    g.useProgram(pr); const al = g.getAttribLocation(pr, 'a'); g.enableVertexAttribArray(al); g.vertexAttribPointer(al, 2, g.FLOAT, false, 0, 0);
    const u = {}; ['C', 'Dm', 'c', 'kq', 'pv', 'foc', 'bl', 'ar', 'vs', 'ef'].forEach(n => u[n] = g.getUniformLocation(pr, n));
    g.uniform1i(u.C, 0); g.uniform1i(u.Dm, 1); g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    return GLR = { cv, g, u }
  } catch (e) { return null }
}
function glTex(R, PX) {   // the colour and depth textures of one picture, made once
  if (PX.gl) return PX.gl; const g = R.g, mk = (unit, fmt, data) => { const t = g.createTexture(); g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
    g.texImage2D(g.TEXTURE_2D, 0, fmt, PX.w, PX.h, 0, fmt, g.UNSIGNED_BYTE, data); return t };
  const d8 = new Uint8Array(PX.w * PX.h); for (let i = 0; i < d8.length; i++) d8[i] = Math.round(PX.d[i] * 255);
  return PX.gl = { c: mk(0, g.RGBA, new Uint8Array(PX.P.buffer, PX.P.byteOffset, PX.P.length)), d: mk(1, g.LUMINANCE, d8) }
}
function depthGL(PX, cx, cy, kq, pv, bl) {   // cx, cy: camera shift as fractions of the picture width / height; kq: dolly; pv: the depth that stays still (0 = far, 1 = near); bl: soft-focus size (0 = off). Returns a canvas, or 0 to let the caller use the CPU warp
  const R = glRig(); if (!R) return 0; try {
    const g = R.g, T = glTex(R, PX); if (R.cv.width !== PX.w || R.cv.height !== PX.h) { R.cv.width = PX.w; R.cv.height = PX.h } g.viewport(0, 0, PX.w, PX.h);
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, T.c); g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, T.d);
    g.uniform2f(R.u.c, cx, cy); g.uniform1f(R.u.kq, kq); g.uniform1f(R.u.pv, pv); g.uniform1f(R.u.foc, pv); g.uniform1f(R.u.bl, bl); g.uniform1f(R.u.ar, PX.w / PX.h); { const fr = EDG, v = PX.vis || [0, 0, 1, 1]; g.uniform4f(R.u.vs, v[0], v[1], v[2], v[3]); g.uniform2f(R.u.ef, PX.vis ? fr : 0, 0) }
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4); return R.cv
  } catch (e) { GLR = null; return 0 }
}
const CAMS = ['', 'auto', 'push', 'pull', 'orbit', 'truck', 'crane'];   // cam3 1-6
function camMove(cm, pc, sc, EDITING, TH, mo) {   // -> {cx, cy, ez, pv}: cx / cy in units of the depth strength, ez the dolly, pv the focus plane that stays still
  const sg = sc.idx % 2 ? -1 : 1, e = pc * pc * (3 - 2 * pc);
  if (EDITING) return { cx: Math.sin(TH * .8), cy: .3 * Math.sin(TH * .55), ez: .5 * Math.sin(TH * .8 + 1), pv: cm === 1 ? 0 : .5 };
  if (cm === 2) return { cx: .3 * sg * lerp(-1, 1, e), cy: 0, ez: lerp(-.6, .6, e), pv: .45 };   // push in: the subject plane holds, near grows faster than far
  if (cm === 3) return { cx: .3 * sg * lerp(1, -1, e), cy: 0, ez: lerp(.6, -.6, e), pv: .45 };   // pull back
  if (cm === 4) return { cx: 1.5 * sg * Math.sin((e - .5) * Math.PI), cy: .35 * Math.cos(e * Math.PI), ez: 0, pv: .55 };   // orbit about the subject plane
  if (cm === 5) return { cx: 1.4 * sg * lerp(-1, 1, e), cy: 0, ez: 0, pv: .5 };   // truck: slide sideways
  if (cm === 6) return { cx: 0, cy: 1.2 * lerp(-1, 1, e), ez: 0, pv: .5 };   // crane: rise (or sink)
  return { cx: lerp(-1, 1, pc) * sg, cy: .3 * Math.sin(pc * Math.PI * 2), ez: (pc - .5) * (mo === 'out' ? -1 : 1), pv: 0 }   // auto: the old sweep, but through the real camera
}
function bgPic(p, t, sc, gateAlways) {   // one background picture (the scene's own, or an extra one from sc.photos) with its start/end by word and entry/exit effects
  const im = p.src && IM[p.src]; if (!im) return; const gate = gateAlways || p.t != null || p.out != null, ps0 = p.t != null ? p.t : sc.t0, pe = p.out != null ? p.out : 1e9, ENT = .75, EXT = .55;
  if (!(EDIT || (t >= ps0 - 1e-6 && t < pe + EXT))) return;
  const ein = (t - ps0) / ENT, eout = t > pe ? 1 - (t - pe) / EXT : 1, kin = p.en || 'fade', kout = p.ex || 'fade'; ctx.save();
  if ((p.t != null || gateAlways) && ein < 1 && !EDIT) phReveal(ein, kin, false); else if (p.out != null && t > pe && !EDIT) { if (kout === 'none') { ctx.beginPath(); ctx.rect(0, 0, 0, 0); ctx.clip() } else phReveal(eout, kout, true) }
  const lt = t - Math.max(ps0, sc.t0), pc = clamp(lt / Math.max(.8, sc.t1 - Math.max(ps0, sc.t0) + WD));
  const mo = p.motion && p.motion !== 'auto' ? p.motion : ['in', 'out', 'left', 'right'][(sc.idx + (p.mi || 0)) % 4]; let z = 1.05, ox = 0;
  const dl = p.drift != null ? p.drift : D.meta.drift != null ? D.meta.drift : 0, DA = EDIT ? 0 : [0, 3, 6, 10][dl] || 0, TH = EDIT ? performance.now() / 1000 : t;   // micro hand-held drift of the whole picture (px)
  if (EDIT || mo === 'none') z = 1; else if (mo === 'in') z = lerp(1.04, 1.15, pc); else if (mo === 'out') z = lerp(1.15, 1.04, pc); else if (mo === 'left') { z = 1.1; ox = lerp(.03, -.03, pc) } else if (mo === 'right') { z = 1.1; ox = lerp(-.03, .03, pc) }
  if (DA) z = Math.max(z, 1.02 + DA * .0015);
  const jx = DA ? DA * (2 * jit(t, 1) + .6 * Math.sin(t * .9)) : 0, jy = DA ? DA * (2 * jit(t, 7) + .6 * Math.cos(t * .7)) : 0;
  const fx = p.fx == null ? .5 : p.fx, fy = p.fy == null ? .5 : p.fy, k = Math.max(W / im.width, H / im.height) * z, dw = im.width * k, dh = im.height * k;
  const x = clamp((W - dw) * fx + ox * W + jx, Math.min(0, W - dw), 0), y = clamp((H - dh) * fy + jy, Math.min(0, H - dh), 0);
  const dpl = p.depth != null ? p.depth : D.meta.depth != null ? D.meta.depth : 2, PA = EDIT && !LIVE ? 0 : [0, .03, .05, .075][dpl] || 0, PX = PA ? depthLayers(p.src, (() => { const kb = Math.max(W / im.width, H / im.height) * 1.1, vw = Math.min(1, W / (im.width * kb)), vh = Math.min(1, H / (im.height * kb)), x0 = (1 - vw) * fx, y0 = (1 - vh) * fy, m = .07; const r = [Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(1, x0 + vw + m), Math.min(1, y0 + vh + m)]; r.vis = [x0, y0, x0 + vw, y0 + vh]; return r })()) : 0;
  if (PX) {   // 3D: the depth bands slide by different amounts (the far band stays), a pure function of the scene progress
    const cx = EDIT ? Math.sin(TH * .8) : lerp(-1, 1, pc) * (sc.idx % 2 ? -1 : 1), cy = EDIT ? Math.sin(TH * .55) : Math.sin(pc * Math.PI * 2), amp = PA * W, ez = EDIT ? .5 * Math.sin(TH * .8 + 1) : (pc - .5) * (mo === 'out' ? -1 : 1);   // ez: dolly, the near bands grow (or shrink) faster than the far ones, with every kind of zoom
    const cm = p.cam3 || D.meta.cam3 || 1, dfl = p.dof != null ? p.dof : D.meta.dof != null ? D.meta.dof : 0;   // the 3D camera move (0 / 1 = auto: the rigid CPU warp, exactly as before the WebGL camera; the WebGL camera only runs for the explicit moves 2-6, because its ray march stretches faces and clips thin heads at soft depth edges) and soft focus
    EDG = p.edge != null ? +p.edge : D.meta.edge != null ? +D.meta.edge : .2;
    DMODE = p.dmode || D.meta.dmode || 'layers';
    const put = (g, ox0, oy0) => {
      let src = 0; if (cm > 1 && cm < CAMS.length) { const C = camMove(cm, pc, sc, EDIT, TH, mo); src = depthGL(PX, amp * C.cx / dw, amp * C.cy / dh, PA * 1.8 * C.ez, C.pv, [0, .004, .008, .014][dfl] || 0) }
      g.drawImage(src || (DMODE === 'layers' && layersWarp(PX, amp * cx * PX.w / dw, amp * .3 * cy * PX.h / dh, PA * 1.8 * ez, focusPts(p.focus))) || depthWarp(PX, amp * cx * PX.w / dw, amp * .3 * cy * PX.h / dh, PA * 1.8 * ez), ox0, oy0, dw, dh)
    };
    if (!(FLYC && FLYC.sc === sc && FLYC.go(PX, x, y, dw, dh, PA * 1.8 * ez, amp * cx * PX.w / dw, amp * .3 * cy * PX.h / dh, focusPts(p.focus)))) put(ctx, x, y)
  } else ctx.drawImage(im, x, y, dw, dh);
  ctx.restore()
}
function posterBg(t, sc) {
  const p = sc.photo || {}, im = p.src && IM[p.src], useCol = sc.bgc && (!im || sc.bgc.on), hasPic = im && !useCol, extra = (sc.photos || []).filter(q => q && q.src && IM[q.src]);
  ctx.fillStyle = '#14100e'; ctx.fillRect(-300, -300, W + 600, H + 600);
  const gate = p.t != null || p.out != null;
  if (useCol) posterColor(t, sc);
  else if (!hasPic || gate) { if (sc.bgc) posterColor(t, sc); else { const g0 = ctx.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#2b2118'); g0.addColorStop(1, '#14100e'); ctx.fillStyle = g0; ctx.fillRect(-300, -300, W + 600, H + 600) } }   // gradient (or the colour background) lies beneath until the picture arrives
  if (hasPic) bgPic(p, t, sc, false);
  if (!useCol) extra.slice().sort((a, b) => (a.t == null ? sc.t0 : a.t) - (b.t == null ? sc.t0 : b.t)).forEach((q, n) => { q.mi = q.mi == null ? n + 1 : q.mi; bgPic(q, t, sc, true) })   // later pictures arrive on top of the earlier ones
  if (FLYC && FLYC.sc === sc && FLYC.used) return;   // fly-through: the next picture carries its own vignette
  let g = ctx.createLinearGradient(0, 0, 0, H * .3); g.addColorStop(0, 'rgba(10,6,2,.55)'); g.addColorStop(1, 'rgba(10,6,2,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * .3);
  g = ctx.createLinearGradient(0, H * (V ? .62 : .6), 0, H); g.addColorStop(0, 'rgba(10,6,2,0)'); g.addColorStop(1, 'rgba(10,6,2,.72)'); ctx.fillStyle = g; ctx.fillRect(0, H * (V ? .62 : .6), W, H);
}
TPL.poster = function (t, sc) {   // library pictures only (the owner places them with the usual tools); the layers of text are drawn by posterText
  const its = sc.items || []; if (!its.length) return; const cx = W / 2, cy = H * (V ? .55 : .54), hs = B * (V ? .62 : .56);
  const vo = heroVary(sc, its); drawItem(its[0], t, cx + vo.dx, cy, hs, 0, vo.rot);
  const n = its.length - 1; its.slice(1).forEach((it, i) => { const a = -Math.PI / 2 + (i + .5) * TAU / Math.max(n, 1) + (n === 1 ? 2.2 : 0), rx = V ? W * .34 : W * .3, ry = V ? H * .17 : H * .24; drawItem(it, t, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, B * .3, i + 1) })
};
function posterChips(text, size, maxW, cx, top, t, t0, align, o) {   // o: {col: text colour, bg: chip colour or 'none', hl: highlight chip colour}
  o = o || {}; const BL = o.bd != null, ga = ctx.globalAlpha, tcol = o.col || '#fff', hcol = o.hl || ORG, chip = o.bg === 'none' ? null : (o.bg || 'rgba(14,10,7,.84)');   // headline on dark chips, *word* on an orange chip; returns its height
  const font = `900 ${size}px Vz`, L = wrapTokens(text, font, maxW), lh = size * 1.5, rtl = D.meta.rtl, padX = size * .38; let idx = 0, cc = 0;
  let wn = 0; L.lines.forEach(ln => { ln.cs = cc; ln.w0 = wn; ln.ws.forEach(k => { k.cs = cc; k.wi = wn++; cc += k.txt.length }) });   // o.bd (blur reveal): seconds since the key text started; every word fades in from blurred, one after the other   // o.tp < 1: typing / erasing, only the first tp * total characters are drawn
  const shown = o.tp != null && o.tp < 1 ? Math.ceil(o.tp * cc) : Infinity;
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.direction = rtl ? 'rtl' : 'ltr';
  L.lines.forEach((ln, li) => {
    if (shown <= ln.cs) return; const p = BL ? 1 : spr(t, t0 + li * .14, .55, 13); if (p <= 0) return; const y = top + lh * (li + .5), w = ln.w + 2 * padX;
    const right = align === 'center' ? cx + w / 2 : align === 'right' ? cx : cx - w;   // box edge: right edge of the chip for 'right'
    const x0 = align === 'center' ? cx - w / 2 : align === 'right' ? cx - w : cx;
    ctx.save(); ctx.translate((x0 + w / 2), y); ctx.scale(.85 + .15 * Math.min(p, 1.1), .85 + .15 * Math.min(p, 1.1)); ctx.globalAlpha = ga * (BL ? ramp(o.bd - ln.w0 * .18, 0, .35) : clamp(p * 1.8));
    if (chip) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.fillStyle = chip; ctx.beginPath(); ctx.roundRect(-w / 2, -lh * .46, w, lh * .92, size * .22); ctx.fill(); ctx.shadowColor = 'transparent' }
    let x = rtl ? w / 2 - padX : -w / 2 + padX;
    ln.ws.forEach(k => { const kw = k.w; if (rtl) x -= kw; const nc = Math.min(k.txt.length, shown - k.cs);
      if (nc > 0) { const part = nc < k.txt.length, tx = part ? k.txt.slice(0, nc) : k.txt, pw = part ? ctx.measureText(tx).width : kw, xs = rtl ? x + kw - pw : x;   // a partly typed word sticks to its start edge (right edge in Persian)
        if (BL) { const wr = eoc(ramp(o.bd - k.wi * .18, 0, .5)); ctx.save(); ctx.globalAlpha *= wr; if (wr < 1) ctx.filter = 'blur(' + ((1 - wr) * size * .3).toFixed(1) + 'px)'; ctx.translate(0, (1 - wr) * size * .25) }
        if (k.hl) { ctx.fillStyle = hcol; ctx.beginPath(); ctx.roundRect(xs - size * .22, -lh * .4, pw + size * .44, lh * .8, size * .18); ctx.fill() }
        if (!chip) { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3 }
        ctx.fillStyle = tcol; ctx.fillText(tx, xs, 3); ctx.shadowColor = 'transparent'; if (BL) ctx.restore() }
      if (rtl) x -= L.sp; else x += kw + L.sp });
    ctx.restore(); idx++ });
  ctx.restore(); return L.lines.length * lh
}
let LREC = []; window.getLayRec = () => LREC;   // editor: where the extra text layers / bubbles are drawn [{kind, i, x, y, w, h}], draggable in the preview
const editBox = (kind, i, x, y, w, h, col) => { LREC.push({ kind, i, x, y, w, h }); ctx.save(); ctx.setLineDash([18, 12]); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.strokeRect(x - w / 2 - 8, y - h / 2 - 8, w + 16, h + 16); ctx.restore() };
let KREC = null; window.getKeyRec = () => KREC;   // where the key text is drawn in the editor: {x, y, w, h} (centre, px)
function posterText(t, sc) {
  const lt = t - sc.t0, m = V ? 70 : 90, rtl = D.meta.rtl, kp = sc.keyPos && sc.keyPos[FMT], k = sc.keySize || 1; let y = V ? 250 : 180;
  const num = String(sc.number == null ? '' : sc.number).trim();
  if (num) { const e = spr(t, sc.t0 + .15, .5, 12), size = B * (V ? .24 : .2); ctx.save(); ctx.font = `900 ${size}px Vz`; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
    ctx.translate(rtl ? W - m : m, y + size * .55); ctx.scale(.7 + .3 * Math.min(e, 1.1), .7 + .3 * Math.min(e, 1.1)); ctx.globalAlpha = clamp(e * 1.6); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fff'; ctx.fillText(num, 0, 0); ctx.restore(); y += size * 1.12 }
  if (sc.text && tOn(sc)) {
    const size = B * (V ? .062 : .055) * k, maxW = W * (V ? .86 : .6), t0 = sc.tIn != null ? sc.tIn : sc.t0 + (num ? .5 : .3), st = { col: sc.tcol, bg: sc.tbg, hl: sc.thl }, A = sc.tAnim || 'blur', AO = sc.tAnimOut || (A === 'blur' ? 'fade' : 'type'), nch = sc.text.replace(/[\s*]/g, '').length, ps = EDIT ? { dx: 0, dy: 0, s: 1, al: 1, tp: 1 } : lyrPose(t, t0, sc.tOut != null ? sc.tOut : 1e9, A, AO, nch);   // key text: typed letter by letter and erased again (choose another animation in the app); in the editor it is always shown
    if (ps) { ctx.save(); ctx.translate(W / 2 + ps.dx, H / 2 + ps.dy); ctx.scale(ps.s, ps.s); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha = ps.al; const tt = A === 'pop' ? t0 : t - 5;
      st.tp = ps.tp; st.bd = !EDIT && A === 'blur' ? t - t0 : undefined; const L = wrapTokens(sc.text, `900 ${size}px Vz`, maxW), hh = L.lines.length * size * 1.5, bw = Math.max(...L.lines.map(l => l.w)) + 2 * size * .38;
      if (kp) posterChips(sc.text, size, maxW, kp.x * W, kp.y * H - hh / 2, t, tt, 'center', st); else posterChips(sc.text, size, maxW, rtl ? W - m : m, y, t, tt, rtl ? 'right' : 'left', st)
      if (EDIT) { const bx = kp ? kp.x * W : rtl ? W - m - bw / 2 : m + bw / 2, by = kp ? kp.y * H : y + hh / 2; KREC = { x: bx, y: by, w: bw, h: hh }; ctx.save(); ctx.setLineDash([22, 14]); ctx.lineWidth = 6; ctx.strokeStyle = '#ffd400'; ctx.strokeRect(bx - bw / 2 - 10, by - hh / 2 - 10, bw + 20, hh + 20); ctx.restore() }   // the editor can drag the key text (preview.html)
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
function lyrPose(t, t0, out, ain, aout, n) {   // n: number of characters (for the typing / erasing speed); the result's tp (0..1) is the share of the characters that are shown
  const d = t - t0; if (d < 0) return null; let dx = 0, dy = 0, s = 1, al = 1, tp = 1; const nn = n || 20; const e = eio(d / .45), A = ain || 'pop';
  if (A === 'left') { dx = -(1 - e) * W * .8; al = clamp(d / .15) } else if (A === 'right') { dx = (1 - e) * W * .8; al = clamp(d / .15) } else if (A === 'up') { dy = -(1 - e) * H * .45; al = clamp(d / .15) } else if (A === 'down') { dy = (1 - e) * H * .45; al = clamp(d / .15) }
  else if (A === 'zoom') { s = lerp(.15, 1, Math.min(spr(t, t0, .55, 13), 1.12)); al = clamp(d / .12) }
  else if (A === 'slam') { s = d < .16 ? lerp(2.6, 1, eio(d / .16)) : 1 + .05 * Math.exp(-(d - .16) * 11) * Math.cos((d - .16) * 38); al = clamp(d / .06); if (d >= .16 && d < .42) { const q = Math.sin(d * 150) * 7 * (1 - (d - .16) / .26); dx = q; dy = q * .6 } }
  else if (A === 'fade') al = clamp(d / .35);
  else if (A === 'type') tp = clamp(d / Math.min(2.4, Math.max(.5, nn * .05)));   // typed letter by letter
  if (t > out && aout === 'type') { tp = Math.min(tp, 1 - clamp((t - out) / Math.min(1.4, Math.max(.3, nn * .03)))); if (tp <= 0) return null }   // erased from the end, like the backspace key
  else if (t > out) { const x = eio((t - out) / .35), O = aout || 'fade'; if (O === 'none' || x >= 1) return null;
    if (O === 'left') dx -= x * W * .8; else if (O === 'right') dx += x * W * .8; else if (O === 'up') dy -= x * H * .45; else if (O === 'down') dy += x * H * .45; else if (O === 'zoom') s *= lerp(1, .15, x);
    al *= (O === 'fade' || O === 'zoom') ? 1 - x : 1 - x * x * x }
  return { dx, dy, s, al, tp }
}
/* world map for the 'map' style of place layers: Natural Earth countries (TopoJSON, world-atlas). Local copy assets/geo/countries-50m.json (workflow "Fetch world map"), else the jsDelivr CDN. */
let GEO = null, MAPC = null;
function topoRings(topo, name) {
  const tr = topo.transform, sc = tr ? tr.scale : [1, 1], tl = tr ? tr.translate : [0, 0];
  const arcs = topo.arcs.map(a => { let x = 0, y = 0; return a.map(q => { if (tr) { x += q[0]; y += q[1]; return [x * sc[0] + tl[0], y * sc[1] + tl[1]] } return [q[0], q[1]] }) });
  const arc = i => i >= 0 ? arcs[i] : arcs[~i].slice().reverse(), ring = ids => { let pts = []; ids.forEach((i, k) => { const a = arc(i); pts = pts.concat(k ? a.slice(1) : a) }); return pts };
  const obj = topo.objects[name] || topo.objects[Object.keys(topo.objects)[0]], out = [];
  obj.geometries.forEach(g => { if (g.type === 'Polygon') g.arcs.forEach(r => out.push(ring(r))); else if (g.type === 'MultiPolygon') g.arcs.forEach(po => po.forEach(r => out.push(ring(r)))) }); return out
}
async function loadGeo() {
  if (GEO !== null) return; GEO = false;
  for (const u of ['../assets/geo/countries-50m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json']) {
    try { const r = await fetch(u); if (!r.ok) continue; const rings = topoRings(await r.json(), 'countries');
      GEO = rings.map(pts => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; pts.forEach(q => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1] }); return { pts, x0, x1, y0, y1 } }); return } catch (e) { }
  }
}
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + Math.max(-85, Math.min(85, lat)) * Math.PI / 360)) * 180 / Math.PI;
/* the map inside a card (origin = card centre, size w x h): zooms from a wide view (L.start degrees across, default 60) to L.zoom degrees (default 6) onto [lon, lat] */
function mapView(c, d, L, w, h) {
  const lon = +L.lon, lat = +L.lat, z = eio(ramp(d, .15, 1.9)), s0 = +(L.start || 60), s1 = +(L.zoom || 6), span = Math.exp(lerp(Math.log(s0), Math.log(s1), z)), ppd = w / span;
  const cLon = lerp(lon - s0 * .1, lon, z), cLat = lerp(lat + s0 * .05, lat, z), cY = mercY(cLat), X = q => (q - cLon) * ppd, Y = q => -(mercY(q) - cY) * ppd;
  c.save(); c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip();
  const gs = span > 40 ? 10 : span > 14 ? 5 : span > 5 ? 2 : 1; c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath();
  for (let q = Math.floor((cLon - span) / gs) * gs; q <= cLon + span; q += gs) { c.moveTo(X(q), -h / 2); c.lineTo(X(q), h / 2) }
  for (let q = Math.floor((cLat - span) / gs) * gs; q <= cLat + span; q += gs) { c.moveTo(-w / 2, Y(q)); c.lineTo(w / 2, Y(q)) } c.stroke();
  if (GEO) { const vx0 = cLon - (w / 2) / ppd, vx1 = cLon + (w / 2) / ppd, dy = (h / 2) / ppd, vy0 = cLat - dy * 1.3, vy1 = cLat + dy * 1.3; c.fillStyle = 'rgba(255,255,255,.2)'; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = Math.max(1.2, w * .003); c.lineJoin = 'round';
    GEO.forEach(r => { if (r.x1 < vx0 || r.x0 > vx1 || r.y1 < vy0 || r.y0 > vy1) return; c.beginPath(); let lx = 0, ly = 0, n = 0;
      r.pts.forEach(q => { const x = X(q[0]), y = Y(q[1]); if (!n) { c.moveTo(x, y); lx = x; ly = y; n = 1 } else if (Math.abs(x - lx) + Math.abs(y - ly) > 1.5) { c.lineTo(x, y); lx = x; ly = y } }); c.closePath(); c.fill(); c.stroke() }) }
  else if (GEO === null) loadGeo();   // not loaded yet (the editor draws again by itself)
  c.restore(); return { x: X(lon), y: Y(lat) }
}
/* PLACE + DATE layer: {kind:'place', style:'pin'|'map', text:'اصفهان', date:'۱۵۹۸ میلادی', t, out, hold, x, y, size, col, acc, lon, lat, zoom, start}
   pin: a pin drops and rings spread, the name is revealed from the reading side, the year rolls up like an odometer while a marker slides on a small timeline.
   map: a map card zooms in from a wide view onto [lon, lat], the pin lands, then the name and the rolling year.
   After `hold` seconds (pin 3.2, map 4.8) it shrinks to a chip at the top that stays until `out` (default: end of the scene). x / y: centre of the whole group (fractions of the frame, draggable in the preview), size: scale. */
const eio5 = p => { p = clamp(p); return p < .5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2 };   // slow start, fast middle, slow arrival
function curYear(shamsi) { try { if (shamsi) { const y = +new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric' }).formatToParts(new Date()).find(q => q.type === 'year').value.replace(/\D/g, ''); if (y > 1300) return y } } catch (e) { } return new Date().getFullYear() - (shamsi ? 621 : 0) }
const PIN_ICO1 = new Path2D('M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'), PIN_ICO2 = new Path2D('M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z');
function placeFx(t, sc, L, li) {
  const t0 = L.t != null ? L.t : sc.t0 + .3, end = L.out != null ? L.out : sc.t1 + .3, mp = L.style === 'map', d = EDIT ? 3.2 + (mp ? 1.4 : 0) - .3 : t - t0; if (!EDIT && (d < 0 || t > end)) return;
  const name = String(L.text || '').trim(), P = (L.pos && L.pos[FMT]) || L, k = L.size || 1, kt = L.tsize || 1, rtl = D.meta.rtl, cx = (P.x == null ? .5 : P.x) * W, hold = L.hold != null ? L.hold : (mp ? 4.8 : 3.2), fade = EDIT ? 1 : clamp((end - t) / .3);
  const BIG = L.big === true, g = !BIG ? 0 : EDIT ? 1 : (L.chip === false ? 1 : 1 - ramp(d, hold, hold + .4)), cp = !BIG ? (EDIT ? 1 : eoc(ramp(d, 0, .5))) : EDIT ? 0 : ramp(d, hold + .1, hold + .5),   // the big pin / map animation is opt-in now (L.big = true); by default only the small chip shows
    ac = L.acc || ORG, tc = L.col || '#fff', nz = name ? Math.round(B * (mp ? .1 : .13) * kt) : 0, dz = Math.round(B * .062 * kt), ph = dz * 1.9;
  const CALS = L.cal === 's' || (!L.cal && /شمسی/.test(String(L.date || ''))), nowYear = curYear(CALS), date = String(L.date || '').trim(), ym = date.replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).match(/\d{3,4}/), yr = ym ? +ym[0] : null, fm = String(L.from || '').replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).match(/\d{3,4}/), fy = fm ? +fm[0] : (yr != null ? nowYear : null), suf = L.cal ? (L.cal === 's' ? 'شمسی' : 'میلادی') : date.replace(/[\d۰-۹]{3,4}/, '').trim();   // no start date = the current year (of the chosen calendar); the end of the ruler is always the current year
  const dir = rtl ? 'rtl' : 'ltr', shadow = (b = 24) => { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = b; ctx.shadowOffsetY = 6 }, full = yr ? faDigits(yr) + (suf ? ' ' + suf : '') : date;
  const tw = measure(`900 ${nz}px Vz`, name), pw = measure(`900 ${dz}px Vz`, full) + dz * 2.2, TW = B * .52 * k, cw = mp ? Math.min(B * .86 * k, W * .96) : 0, chh = cw * .56;
  let o0, o1, o2, o3, Hg;   // vertical layout of the group, from its top
  if (mp) { o0 = chh / 2; o1 = chh + nz * .75; o2 = o1 + nz * .55 + ph * .7; o3 = 0; Hg = date ? o2 + ph / 2 : o1 + nz * .55 }
  else { const pr0 = B * .022 * k; o0 = pr0; o1 = o0 + pr0 + B * .07 * k + nz * .62; o2 = o1 + nz * 1.05; o3 = date && yr ? o2 + ph * 1.05 : 0; Hg = date ? (yr ? o3 + 40 : o2 + ph / 2) : o1 + nz * .6 }
  const top = P.y == null ? (V ? 98 : 70) + 54 + 38 : P.y * H - Hg / 2, cyc = top + Hg / 2, y0 = top + o0, y1 = top + o1, y2 = top + o2, y3 = top + o3;
  if (EDIT && BIG) { const bw = Math.max(mp ? cw : 0, tw, date ? pw : 0, yr && !mp ? TW : 0) + 50; editBox('layer', li, cx, cyc, bw, Hg + 20, '#00e5ff') }
  const nameDraw = (e1) => { if (e1 <= 0 || !name) return; ctx.save(); ctx.beginPath(); const pad = nz * .3, cwid = (tw + 2 * pad) * e1; ctx.rect(rtl ? cx + tw / 2 + pad - cwid : cx - tw / 2 - pad, y1 - nz, cwid, nz * 2); ctx.clip();
    ctx.font = `900 ${nz}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = dir; shadow(26); ctx.lineJoin = 'round'; ctx.lineWidth = nz * .14; ctx.strokeStyle = INK; ctx.strokeText(name, cx, y1); ctx.shadowColor = 'transparent'; ctx.fillStyle = tc; ctx.fillText(name, cx, y1); ctx.restore() };
  const pillDraw = (e2, cnt) => { if (e2 <= 0) return; ctx.save(); ctx.globalAlpha *= clamp(e2 * 1.6); ctx.translate(cx, y2 + (1 - Math.min(e2, 1)) * 16); shadow(18); ctx.fillStyle = 'rgba(20,16,14,.62)'; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    ctx.font = `900 ${dz}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = dir; ctx.fillStyle = '#fff'; ctx.fillText(cnt, 0, 4); ctx.restore() };
  const cnt = (a, b) => yr ? faDigits(Math.round(lerp(fy, yr, eoc(ramp(d, a, b))))) + (suf ? ' ' + suf : '') : date;
  if (g > 0) {
    ctx.save(); ctx.globalAlpha = g * fade;
    if (mp) {
      const e0 = clamp(d / .3), hasLL = L.lon != null && L.lat != null && L.lon !== '' && L.lat !== '';
      ctx.save(); ctx.globalAlpha *= e0; ctx.translate(cx, top + chh / 2);
      const mc = MAPC || (MAPC = document.createElement('canvas')), mw = Math.round(cw), mh = Math.round(chh); if (mc.width !== mw || mc.height !== mh) { mc.width = mw; mc.height = mh }
      const mx = mc.getContext('2d'); mx.setTransform(1, 0, 0, 1, 0, 0); mx.globalCompositeOperation = 'source-over'; mx.clearRect(0, 0, mw, mh); mx.save(); mx.translate(mw / 2, mh / 2);
      const pt = hasLL ? mapView(mx, d, L, mw, mh) : { x: 0, y: 0 }; mx.restore();
      mx.globalCompositeOperation = 'destination-in'; mx.save(); mx.translate(mw / 2, mh / 2); mx.scale(1, mh / mw); const fg = mx.createRadialGradient(0, 0, mw * .28, 0, 0, mw * .5); fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); mx.fillStyle = fg; mx.fillRect(-mw / 2, -mw / 2, mw, mw); mx.restore();
      shadow(22); ctx.drawImage(mc, -cw / 2, -chh / 2, cw, chh); ctx.shadowColor = 'transparent';
      const pd = d - 1.9, pr = cw * .022, fall = pd < 0 ? -9999 : pd < .3 ? -(1 - (pd / .3) * (pd / .3)) * chh * .5 : -Math.exp(-(pd - .3) * 8) * Math.abs(Math.sin((pd - .3) * 14)) * 16;
      for (let j = 0; j < 3; j++) { const rd = pd - (.3 + j * .22); if (rd > 0 && rd < 1.2) { ctx.save(); ctx.globalAlpha *= (1 - rd / 1.2) * .8; ctx.beginPath(); ctx.arc(pt.x, pt.y, lerp(pr, cw * .2, eoc(rd / 1.2)), 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = ac; ctx.stroke(); ctx.restore() } }
      if (pd >= 0) { ctx.beginPath(); ctx.arc(pt.x, pt.y + fall, pr, 0, TAU); ctx.fillStyle = ac; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke() }
      ctx.restore();
      nameDraw(eio(ramp(d, 2.2, 2.85))); if (date) pillDraw(spr(t - t0, 2.7, .5, 13) * (EDIT ? 1 : 1), cnt(2.8, 3.9));
    } else {
      const pr = B * .022 * k, fall = d < .4 ? -(1 - (d / .4) * (d / .4)) * 300 : -Math.exp(-(d - .4) * 8) * Math.abs(Math.sin((d - .4) * 14)) * 26;
      for (let j = 0; j < 3; j++) { const rd = d - (.4 + j * .22); if (rd > 0 && rd < 1.2) { ctx.save(); ctx.globalAlpha *= (1 - rd / 1.2) * .75; ctx.beginPath(); ctx.arc(cx, y0, lerp(pr, B * .3 * k, eoc(rd / 1.2)), 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = ac; ctx.stroke(); ctx.restore() } }
      ctx.save(); ctx.globalAlpha *= clamp(d / .1); shadow(16); ctx.beginPath(); ctx.arc(cx, y0 + fall, pr, 0, TAU); ctx.fillStyle = ac; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
      const ll = B * .07 * k * eoc(ramp(d, .45, .8)); if (ll > 0) { ctx.beginPath(); ctx.moveTo(cx, y0 + pr + 4); ctx.lineTo(cx, y0 + pr + 4 + ll); ctx.lineWidth = 4; ctx.strokeStyle = ac; ctx.stroke() }
      nameDraw(eio(ramp(d, .7, 1.35))); if (date) pillDraw(spr(d, 1.25, .5, 13), cnt(1.3, 2.4));
      if (date && yr) { const a3 = clamp((d - 1.5) / .4), mn = Math.min(fm ? fy : yr, yr), mxy = Math.max(fm ? fy : yr, yr), stp = fm ? ((mxy - mn) > 400 ? 500 : (mxy - mn) > 150 ? 100 : (mxy - mn) > 60 ? 50 : 10) : (yr >= 1000 ? 200 : 100), lo = fm ? Math.floor(mn / stp) * stp : Math.floor(yr / 100) * 100, hi = fm ? Math.max(Math.ceil(mxy / stp) * stp, lo + stp) : lo + stp, p0 = fm ? (fy - lo) / (hi - lo) : 0, pos = (yr - lo) / (hi - lo), m = lerp(p0, pos, eio(ramp(d, 1.7, 2.7))), xx = f => rtl ? cx + TW / 2 - TW * f : cx - TW / 2 + TW * f;
        if (a3 > 0) { ctx.save(); ctx.globalAlpha *= a3; shadow(10); const tl = (lw, col) => { ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(xx(0), y3); ctx.lineTo(xx(1), y3); for (let q = 0; q <= 4; q++) { ctx.moveTo(xx(q / 4), y3 - 11); ctx.lineTo(xx(q / 4), y3 + 11) } ctx.stroke() }; ctx.lineCap = 'round'; tl(9, 'rgba(20,16,14,.75)'); tl(4, '#fff');
          ctx.shadowColor = 'transparent'; ctx.beginPath(); ctx.arc(xx(m), y3, 13, 0, TAU); ctx.fillStyle = ac; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
          ctx.font = `700 30px Vz`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillText(faDigits(lo), xx(0), y3 + 34); ctx.fillText(faDigits(hi), xx(1), y3 + 34); ctx.restore() } }
    }
    ctx.restore()
  }
  if (cp > 0 && L.chip !== false) {   // the small chip (pin icon + place and date); enters like the corner label: slides down a little, blurred -> sharp
    /* the year rolls from the start date to the end date (like the big version did); the width is fixed so the chip never jumps */
    const cz = Math.round(B * .046 * kt), val = yr ? (EDIT ? yr : lerp(fy, yr, eio5(ramp(d, 1, 3.8)))) : null, txt = [name, date ? (BIG ? full : (yr ? faDigits(Math.round(val)) + (suf ? ' ' + suf : '') : date)) : ''].filter(Boolean).join('  ·  '), t0s = [name, date ? (yr ? faDigits(fy) + (suf ? ' ' + suf : '') : date) : ''].filter(Boolean).join('  ·  '), cwid = Math.max(measure(`900 ${cz}px Vz`, txt), measure(`900 ${cz}px Vz`, t0s), measure(`900 ${cz}px Vz`, [name, date ? full : ''].filter(Boolean).join('  ·  '))) + cz * 2.7, ch = cz * 1.9, cy2 = (V ? 98 : 70) + 54 + 38 + ch / 2, ccx = Math.max(cwid / 2 + 24, Math.min(W - cwid / 2 - 24, cx));   // fixed height at the top like before; kept inside the frame
    if (EDIT && !BIG) editBox('layer', li, ccx, cy2, cwid, ch, '#00e5ff');
    ctx.save(); ctx.globalAlpha = cp * fade; if (BIG) { ctx.translate(cx, cy2 + (1 - cp) * 24); ctx.scale(.8 + .2 * cp, .8 + .2 * cp) } else { ctx.translate(ccx, cy2 - (1 - cp) * 14); if (cp < 1) ctx.filter = 'blur(' + ((1 - cp) * 8).toFixed(1) + 'px)' }
    shadow(14); ctx.fillStyle = 'rgba(20,16,14,.68)'; ctx.beginPath(); ctx.roundRect(-cwid / 2, -ch / 2, cwid, ch, ch / 2); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.stroke();
    ctx.save(); ctx.translate(rtl ? cwid / 2 - cz * 1.15 : -cwid / 2 + cz * 1.15, -cz * .02); const ks = cz * .95 / 24; ctx.scale(ks, ks); ctx.translate(-12, -12); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = L.acc || '#fff'; ctx.stroke(PIN_ICO1); ctx.stroke(PIN_ICO2); ctx.restore();   // map-pin icon (Tabler outline)
    ctx.font = `900 ${cz}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = dir; ctx.fillStyle = tc; ctx.fillText(txt, rtl ? -cz * .55 : cz * .55, 3); ctx.restore()
    if (!BIG && date && yr && fy != null && fy !== yr) {   // the ruler under the chip: the dot slides from the start year to the end year at its true place; it fades out once the year has arrived
      const ra0 = EDIT ? 1 : ramp(d, .6, 1.1), rA = EDIT ? 1 : ra0 * (1 - ramp(d, 4.6, 5.2));
      if (rA > 0) {
        const hiY = Math.max(nowYear, fy, yr), mnY = Math.min(fy, yr), span = hiY - mnY, stp = span > 1500 ? 500 : span > 600 ? 200 : span > 250 ? 100 : span > 120 ? 50 : span > 50 ? 20 : 10, loY = Math.floor(mnY / stp) * stp, RW = Math.min(W * .86, Math.max(cwid, W * .6)),
          pos = v => { const f = (v - loY) / (hiY - loY); return rtl ? RW / 2 - RW * f : -RW / 2 + RW * f }, rcx = Math.max(RW / 2 + 24, Math.min(W - RW / 2 - 24, ccx));
        ctx.save(); ctx.globalAlpha = cp * fade * rA; ctx.translate(rcx, cy2 + ch / 2 + cz * 1.05 - (1 - ra0) * 8); shadow(8); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-RW / 2, 0); ctx.lineTo(RW / 2, 0); for (let q = 0; q <= 4; q++) { const x = -RW / 2 + RW * q / 4; ctx.moveTo(x, -cz * .3); ctx.lineTo(x, cz * .3) } ctx.stroke();
        ctx.beginPath(); ctx.arc(pos(EDIT ? yr : val), 0, cz * .3, 0, TAU); ctx.fillStyle = L.acc || ORG; ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.font = `700 ${Math.round(cz * .62)}px Vz`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.direction = 'rtl'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(faDigits(loY), pos(loY), cz * .55); ctx.fillText(faDigits(hiY), pos(hiY), cz * .55); ctx.restore()
      }
    }
  }
}
function posterLayers(t, sc) {
  (sc.layers || []).forEach((L, li0) => {
    if (!L || (L.kind === 'place' ? !String(L.text || '').trim() && !String(L.date || '').trim() : !String(L.text || '').trim())) return; if (L.kind === 'place') { placeFx(t, sc, L, li0); return } const t0 = L.t != null ? L.t : sc.t0 + .3, out = L.out != null ? L.out : 1e9, P = (L.pos && L.pos[FMT]) || L, st = L.kind === 'stamp', A = L.anim || (st ? 'slam' : 'pop');
    const ps = EDIT ? { dx: 0, dy: 0, s: 1, al: 1, tp: 1 } : lyrPose(t, t0, out, A, L.animOut, String(L.text).replace(/[\s*]/g, '').length); if (!ps) return; const k = L.size || 1, rtl = D.meta.rtl, cx = (P.x == null ? .5 : P.x) * W, cy = (P.y == null ? (st ? .38 : .5) : P.y) * H;
    if (EDIT) { let bw, bh; if (L.kind === 'number') { const z = B * (V ? .24 : .2) * k; bw = z * .62 * String(L.text).trim().length; bh = z * 1.1 } else if (st) { const sp0 = stampSprite(String(L.text).trim(), Math.round(B * .1 * k), L.col || '#e0352b', rtl); bw = sp0.w; bh = sp0.h } else { const z = B * (V ? .062 : .055) * k, W0 = wrapTokens(L.text, `900 ${z}px Vz`, W * (V ? .86 : .6)); bw = Math.max(...W0.lines.map(l => l.w)) + z * .76; bh = W0.lines.length * z * 1.5 } editBox('layer', li0, cx, cy, bw, bh, '#00e5ff') }
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
    ctx.save(); ctx.translate(cx + ps.dx, cy + ps.dy); ctx.scale(ps.s, ps.s); ctx.translate(-cx, -cy); ctx.globalAlpha = ps.al; posterChips(L.text, size, maxW, cx, cy - hh / 2, t, A === 'pop' ? t0 : t - 5, 'center', { col: L.col, bg: L.bg, hl: L.hl, tp: ps.tp }); ctx.restore()
  })
}
/* speech bubbles: sc.bubbles = [{text, shape:'speech'|'thought'|'shout'|'box', tail:'dl'|'d'|'dr'|'ul'|'u'|'ur'|'l'|'r'|'none', x,y, size, col, bg, hl, t, out, anim, animOut}] */
function bubblePath(shape, w, h, tail, B) {
  const r = Math.min(h / 2, B * .035) * (shape === 'box' ? .35 : 1), L = B * .075, tb = B * .028, T = { dl: [-.5, 1, 0, 1, -.35], d: [0, 1, 0, 1, 0], dr: [.5, 1, 0, 1, .35], ul: [-.5, -1, 0, -1, -.35], u: [0, -1, 0, -1, 0], ur: [.5, -1, 0, -1, .35], l: [-1, 0, -1, 0, -.35], r: [1, 0, 1, 0, .35] }[tail];
  return { r, L, tb, T }
}
function posterBubbles(t, sc) {
  (sc.bubbles || []).forEach((Bb, bi0) => {
    if (!Bb || !String(Bb.text || '').trim()) return; const t0 = Bb.t != null ? Bb.t : sc.t0 + .3, out = Bb.out != null ? Bb.out : 1e9, A = Bb.anim || 'pop', P = (Bb.pos && Bb.pos[FMT]) || Bb;
    const ps = EDIT ? { dx: 0, dy: 0, s: 1, al: 1, tp: 1 } : lyrPose(t, t0, out, A, Bb.animOut); if (!ps) return; const k = Bb.size || 1, rtl = D.meta.rtl, cx = (P.x == null ? .5 : P.x) * W, cy = (P.y == null ? .3 : P.y) * H, shape = Bb.shape || 'speech', tail = Bb.tail || (shape === 'box' || shape === 'shout' ? 'none' : 'dl');
    const bim = Bb.img && IM[Bb.img];
    if (bim) {   // the owner's own bubble picture (cut out, empty); only the text is ours. Bb.tb = text area as fractions of the picture [x,y,w,h]
      const bw = W * (V ? .56 : .3) * k, bh = bw * bim.height / bim.width; if (EDIT) editBox('bubble', bi0, cx, cy, bw, bh, '#ff4fd8'); const fl = !!Bb.flip, q2 = A === 'pop' ? .7 + .3 * Math.min(spr(t, t0, .5, 12), 1.1) : 1, tb = Bb.tb || [.14, .16, .72, .5], rx = fl ? 1 - tb[0] - tb[2] : tb[0];
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
    if (EDIT) editBox('bubble', bi0, cx, cy, w, h, '#ff4fd8');
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
let ZB;
function zoomBlur(p) {   // the zoom punch gets short radial streaks: a few copies of the frame, each a little bigger and faded, centred on the picture (pure function of the punch strength; meta.zoomblur 0-3, default 1)
  const lv = D.meta.zoomblur != null ? +D.meta.zoomblur : 1, k = [0, .5, 1, 1.6][lv] || 0; if (!k || p < .01) return;
  if (!ZB || ZB.width !== W || ZB.height !== H) { ZB = document.createElement('canvas'); ZB.width = W; ZB.height = H }
  const z = ZB.getContext('2d'); z.setTransform(1, 0, 0, 1, 0, 0); z.clearRect(0, 0, W, H); z.drawImage(cv, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = .2;
  for (let i = 1; i <= 5; i++) { const s = 1 + p * k * i / 5 * 1.3; ctx.setTransform(s, 0, 0, s, W / 2 * (1 - s), H / 2 * (1 - s)); ctx.drawImage(ZB, 0, 0) }
  ctx.restore()
}
function drawScene(t, sc) {
  CUR = sc; KREC = null; LREC = []; if (EDIT) for (const k in REC) delete REC[k]; const th = THEMES[sc.theme], lt = t - sc.t0, dur = sc.t1 - sc.t0, kc = sc.idx % 4, pc = ramp(lt, 0, dur + .6);
  // camera: each scene gets its own move (push in / pull out, with a slow pan) so consecutive scenes never feel identical
  const KK = sc.kick || 'both'; let punch = 0; if (POSTER && !EDIT && (KK === 'punch' || KK === 'both')) sc.items.forEach(it => { const d = t - it.t; if (d > 0 && d < .5) punch = Math.max(punch, .045 * Math.exp(-d * 8)) });
  const z = EDIT ? 1 : POSTER ? 1 + punch : (kc % 2 ? lerp(1.08, 1.0, pc) : lerp(1.0, 1.08, pc)) * (1 + beatZ(t)), px = EDIT || POSTER ? 0 : [-1, 1, 0, 0][kc] * lerp(-16, 16, pc), py = EDIT || POSTER ? 0 : [0, 0, -1, 1][kc] * lerp(-14, 14, pc);
  let shake = 0; sc.items.forEach(it => { const d = t - it.t; if (d > 0 && d < .35) shake = Math.max(shake, 8 * (1 - d / .35)) }); if (EDIT || D.meta.shake === false || (KK !== 'shake' && KK !== 'both')) { shake = 0 }   // meta.shake === false switches the entry shake off for the whole episode
  ctx.save(); ctx.translate(W / 2 + px + Math.sin(t * 90) * shake, H / 2 + py + Math.cos(t * 77) * shake); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2 + (V ? 0 : 0));
  const TF = POSTER ? null : tfOf(sc);
  if (POSTER) posterBg(t, sc); else if (TF) tfBg(t, sc, th, TF); else { bgLayer(t, sc, th); if (window.FXL && sc.bg && sc.bg.src) FXL.bg(t, sc) }   // optional background picture layer (engine/fx.js)
  if (window.FXL && sc.pins && sc.pins.length) FXL.pins(t, sc, false);   // optional framed pictures pinned to the backdrop
  decor(t, sc, th); const KC = POSTER ? false : keyCustom(sc); (POSTER ? TPL.poster : (TPL[sc.tpl] || TPL.hero))(t, KC ? Object.assign(Object.create(sc), { keyOn: false }) : sc); if (window.FXL && sc.pins && sc.pins.length) FXL.pins(t, sc, true); if (KC) keyCard(t, sc); if (POSTER) { posterAtm(t, sc); posterText(t, sc) } ctx.restore(); if (TF) tfCounter(t, sc, TF)   // pins marked 'top' (stamps, arrows) lie over the pictures
  if (POSTER && !EDIT && punch > .01 && !FLYX) zoomBlur(punch)
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
/* FLY-THROUGH between scenes (instead of the wipe): the pictures sit one behind the other. The camera zooms into a point of the leaving picture (its focal point) and the next
   picture, which lives at that point, grows until it fills the frame. Enable for the whole episode with meta.fly = true (or ?fly=1), per scene with sc.fly = true / false
   (the scene the camera flies INTO). The focal point is read from the leaving scene: sc.focal = {x, y} (fractions) or its photo.focus[0]; default: just above the centre. meta.flyK / sc.flyK = zoom factor (default 8). */
let FLYX = false;
const FLY_PRE = .55, FLY_POST = .55;
function flyOn(k) { const sc = D.scenes[k]; return k > 0 && (sc.fly != null ? !!sc.fly : (Q.get('fly') === '1' || D.meta.fly === true)) }
function flyPre(k) { const a = D.scenes[k - 1], b = D.scenes[k]; return Math.min(FLY_PRE, Math.max(.2, (b.t0 - a.t0) * .3)) }
function flyReady(k) { const p = D.scenes[k - 1].photo; return !p || !p.src || !!IM[p.src] }
function flyIndex(t) { for (let k = 1; k < D.scenes.length; k++) { const sc = D.scenes[k]; if (flyOn(k) && t >= sc.t0 - flyPre(k) && t < sc.t0 + FLY_POST && flyReady(k)) return k } return -1 }
function flyFocal(sc) { const f = sc.focal; return [clamp(f && f.x != null ? f.x : .5, .4, .6) * W, clamp(f && f.y != null ? f.y : .5, .4, .6) * H] }   // default: straight ahead (centre); sc.focal may steer the camera a little
let FLYC = null;
/* TRUE DOLLY: the camera itself travels forward. The next picture is simply THERE, full frame, behind the leaving one. The leaving picture is cut into depth layers (back / middle / front, from its depth map);
   with the camera moving forward a layer at distance d looks d / (d - z) times larger, so the near layers rush past and out of the frame first, then the back layer; each is gone once the camera has passed it,
   and the next picture is uncovered exactly as it will be shown, nothing is enlarged and no frame is ever visible. */
function flyDraw(t, k) {
  const sc = D.scenes[k], pv = D.scenes[k - 1], a = sc.t0 - flyPre(k), u = eio((t - a) / (flyPre(k) + FLY_POST)), tn = Math.max(t, sc.t0);
  const C = [W / 2, H / 2], F = flyFocal(pv), cam = [(F[0] - C[0]) * u * .8, (F[1] - C[1]) * u * .8];   // sc.focal steers the camera a little; default: straight ahead
  const pvx = Object.assign(Object.create(pv), { text: '', number: '', layers: [], bubbles: [], keyOn: false });   // the leaving picture's captions clear away as the camera starts to move
  FLYC = { sc: pvx, used: false, go(PX, x, y, dw, dh, kq0, ox0, oy0, focus) {
    layersWarp(PX, ox0, oy0, kq0, focus); const Y = PX.ly; if (!Y || !Y.L.length) return false; this.used = true;
    const dist = l => 1 + (1 - l.f) * 1.2, edge = i => i === 0 ? .35 : .06, zend = Math.max(...Y.L.map((l, i) => dist(l) - edge(i))) + .1, z = zend * u;
    const keep = [CUR, KREC, LREC], fl = FLYC; FLYC = null; drawScene(tn, sc); FLYC = fl; CUR = keep[0]; KREC = keep[1]; LREC = keep[2];   // the next picture, full frame, already in place
    Y.L.forEach((l, i) => {
      const d = dist(l), den = d - z; if (den <= edge(i)) return;   // passed by the camera
      const s = d / den, al = clamp((den - edge(i)) / (i === 0 ? .6 : .2)), q = (1 + kq0 * l.f) * (i === 0 ? 1.03 : 1);
      ctx.save(); ctx.globalAlpha *= al; ctx.translate(C[0] * (1 - s) - cam[0] * s, C[1] * (1 - s) - cam[1] * s); ctx.scale(s, s); ctx.translate(x, y); ctx.scale(dw / PX.w, dh / PX.h);
      ctx.translate(PX.w / 2 + ox0 * l.f, PX.h / 2 + oy0 * l.f); ctx.scale(q, q); ctx.translate(-PX.w / 2, -PX.h / 2); ctx.drawImage(l.cv, 0, 0); ctx.restore()
    }); return true
  } };
  FLYX = true; ctx.save(); drawScene(t, pvx); ctx.restore(); const used = FLYC.used; FLYC = null;
  if (!used) { FLYX = false; return flyDrawFlat(t, k) }   // no depth map for the leaving picture: fall back to the flat zoom
  FLYX = false
}
function flyDrawFlat(t, k) {
  const sc = D.scenes[k], pv = D.scenes[k - 1], K = +(sc.flyK || D.meta.flyK || 8), a = sc.t0 - flyPre(k), u = eio((t - a) / (flyPre(k) + FLY_POST)), S = Math.pow(K, u), kf = 1 / K;
  const C = [W / 2, H / 2], F = flyFocal(pv), g = (1 - u) / S, cx = F[0] - (F[0] - C[0]) * g, cy = F[1] - (F[1] - C[1]) * g;   // camera centre: the focal point glides straight to the middle of the screen while the zoom grows
  const s1 = S * kf, t0x = C[0] * (1 - S) + S * (C[0] - cx), t0y = C[1] * (1 - S) + S * (C[1] - cy), t1x = C[0] * (1 - s1) + S * (F[0] - cx), t1y = C[1] * (1 - s1) + S * (F[1] - cy);
  FLYX = true;
  ctx.save(); ctx.translate(t0x, t0y); ctx.scale(S, S); drawScene(t, pv); ctx.restore();
  const q = eoc(ramp(u, 0, .22)), rw = W * q, rh = H * q, rx = (W - rw) / 2, ry = (H - rh) / 2;   // the next picture opens like a window at the focal point
  ctx.save(); ctx.translate(t1x, t1y); ctx.scale(s1, s1); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip(); drawScene(Math.max(t, sc.t0), sc); ctx.restore();   // before its own start the next scene is frozen at its first frame, so its picture is already there
  ctx.save(); ctx.translate(t1x, t1y); ctx.scale(s1, s1); ctx.globalAlpha = 1 - ramp(u, .55, .95); ctx.lineWidth = 7 / s1; ctx.strokeStyle = '#fff'; ctx.strokeRect(rx, ry, rw, rh); ctx.restore();
  FLYX = false
}
function world(t) {
  const fk = flyIndex(t); if (fk > 0) return flyDraw(t, fk);
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
function busy(t) {   // a picture or word is arriving, or the scene has just changed: fast things on screen, so the motion blur gets more samples
  const sc = D.scenes[sceneIndex(t)]; if (!sc) return false; if (t - sc.t0 < .6 && t - sc.t0 > -.1) return true;
  const near = q => q && q.t != null && t - q.t > -.05 && t - q.t < .6; return (sc.items || []).some(near) || [sc.photo, ...(sc.photos || [])].some(near)
}
window.frame = function (t) {   // 180-degree-style shutter: the frame is the average of sub-frames over a short span (4 while things arrive, 2 otherwise)
  const n = MB && flyIndex(t) < 0 ? (busy(t) ? 4 : 2) : 1;   // no sub-frame blur inside a fly-through: the zoom is too fast and the copies would show as ghosts
  for (let i = 0; i < n; i++) { draw(n === 1 ? t : t + i * (.6 / 30) / (n - 1)); octx.globalAlpha = 1 / (i + 1); octx.drawImage(cv, 0, 0) } octx.globalAlpha = 1
};
window.seek = function (t) { draw(t); octx.globalAlpha = 1; octx.drawImage(cv, 0, 0) };
window.loadData = async (DD, only) => {   // shared by the renderer and the in-app preview (only = scene indices whose images are needed)
  D = DD; POSTER = D.meta.mode === 'poster'; VOX = POSTER || (Q.get('style') || D.meta.style) === 'vox'; SYM = Q.get('symbols') === '1' || D.meta.symbols === true; VARY = Q.get('vary') !== '0' && D.meta.vary !== false; TITLES = Q.get('titles') === '1' || D.meta.titles === true; applyPalette({ ...D.meta, ...(Q.get('palette') ? { palette: Q.get('palette') } : {}), ...(Q.get('base') ? { base: '#' + Q.get('base') } : {}) });
  D.scenes.forEach((s, i) => { s.idx = i }); const srcs = new Set(); D.scenes.forEach((s, i) => { if (only && !only.includes(i)) return; (s.items || []).forEach(i => { srcs.add(i.src); (i.fx || []).forEach(f => { if (f && f.type === 'bubble' && f.file) srcs.add(f.file) }) }); (s.bubbles || []).forEach(b => { if (b && b.img) srcs.add(b.img) }); (s.photos || []).forEach(q => { if (q && q.src) srcs.add(q.src) }); (s.decor || []).forEach(d => srcs.add(d)); if (s.bg && s.bg.src) srcs.add(s.bg.src); if (s.photo && s.photo.src) srcs.add(s.photo.src); (s.pins || []).forEach(p => { if (p && p.src) srcs.add(p.src) }) });
  const dsrc = new Set(); D.scenes.forEach((s, i) => { if (only && !only.includes(i)) return; [s.photo, ...(s.photos || [])].forEach(q => { if (q && q.src && /(^|\/)bg\//.test(q.src)) { dsrc.add(flatPath(q.src)); dsrc.add(depthPath(q.src)) } }) }); for (const k in DEP) delete DEP[k]; for (const k in VOLC) delete VOLC[k];
  await Promise.all([...[...srcs].map(loadImg), ...[...dsrc].map(loadImg), document.fonts.load('900 40px Vz'), document.fonts.load('700 40px Vz')]); await document.fonts.ready;
  if (window.FXL) await FXL.prepare([...srcs]);
  if (D.scenes.some(q => (q.layers || []).some(l => l && l.kind === 'place' && l.style === 'map'))) await loadGeo();
  mkGrain(); mkPaper(); CH.length = 0; buildCaptions(); buildBeats(); seek(0); return true
};
window.ready = Q.get('inline') ? new Promise(() => {}) : (async () => loadData(await (await fetch('../episodes/' + EP + '/scenes.json?' + Date.now())).json()))();
