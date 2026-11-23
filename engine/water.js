/* Zarrebin engine — rising water per scene (scene.water). Loaded BEFORE v2.js; uses its globals (ctx, W, H, D, EDIT, clamp) when called.
   Pure function of t (no wall clock, seeded bubbles), so parallel chunk rendering stays frame-exact.
   scene.water = { on:1, L:liters, sc:'log'|'lin', at:seconds after the scene start (missing = auto: the spoken word «لیتر»), dur:rise seconds (3),
                   op:opacity .2-1 (.62), amp:wave height .3-2.5 (1), spd:wave speed .3-2.5 (1), foam:1, bub:1, lab:1 (liters counter), ly:counter height 0-1 (.27), col:'blue'|'teal'|'green'|'warm' }
   Drawn right after the scene backdrop: pictures, headline and captions float above the water, the liters counter is drawn last (WATER.label). */
window.WATER = (() => {
  const COL = { blue: ['#8fd3ff', '#2f8fd6', '#0a3a6b'], teal: ['#8ff0e0', '#1fb0a2', '#075a58'], green: ['#b6f0a0', '#4fae4a', '#1b5a2a'], warm: ['#ffe0a0', '#e0922f', '#7a3a10'] };
  const hz = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) };
  const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), eo = x => 1 - Math.pow(1 - x, 3);
  const faN = n => Math.round(n).toLocaleString('en').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]).replace(/,/g, '٬');
  const on = sc => { const w = sc && sc.water; return w && typeof w === 'object' && w.on && +w.L >= 0 ? w : null };
  const level = (w, L) => w.sc === 'lin' ? cl(L / 80000) : L <= 0 ? 0 : Math.log10(1 + L) / Math.log10(1 + 100000);
  const num = (v, d, a, b) => v == null || v === '' || !isFinite(+v) ? d : cl(+v, a, b);
  /* when the rise starts: manual (`at`), else just before the narrator says «لیتر» in this scene, else shortly after the scene starts */
  function t0Of(sc, w) {
    const dur = num(w.dur, 3, .6, 12);
    if (w.at != null && w.at !== '' && isFinite(+w.at)) return sc.t0 + Math.max(0, +w.at);
    const k = (D.words || []).find(x => x.t0 >= sc.t0 - .05 && x.t0 < sc.t1 && /لیتر/.test(String(x.w || '')));
    return k ? Math.max(sc.t0 + .15, k.t0 - dur * .65) : sc.t0 + .6;
  }
  function state(t, sc, w) {
    const dur = num(w.dur, 3, .6, 12), ts = t0Of(sc, w), k = cl((t - ts) / dur), e = EDIT ? 1 : eo(k);
    return { k, e, ts, dur, lv: level(w, +w.L) * e };
  }
  const surf = (x, tt, Y, amp, off, f) => Y + Math.sin(x * f + tt * 1.6 + off) * amp + Math.sin(x * f * 2 - tt * 2.3 + off * 2) * amp * .5 + Math.sin(x * f * .35 + tt * .9) * amp * .9;

  function draw(t, sc) {
    const w = on(sc); if (!w) return; const s = state(t, sc, w); if (s.lv < .004) return;
    const op = num(w.op, .62, .2, 1), ampM = num(w.amp, 1, .3, 2.5), spd = num(w.spd, 1, .3, 2.5), tt = (EDIT ? sc.t0 + 4 : t) * spd, c = COL[w.col] || COL.blue, u = Math.min(W, H) / 1080;
    const Y = H - H * s.lv, amp = H * .012 * ampM * (1.5 - .5 * s.k) * (.55 + .8 * Math.min(1, s.lv * 2)), f = .0058 / u;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, H + 2); for (let x = 0; x <= W; x += 4) ctx.lineTo(x, surf(x, tt, Y - amp * .8, amp * .8, 1.7, f)); ctx.lineTo(W, H + 2); ctx.closePath();
    ctx.globalAlpha = op * .55; ctx.fillStyle = c[0]; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, H + 2); for (let x = 0; x <= W; x += 4) ctx.lineTo(x, surf(x, tt, Y, amp, 0, f)); ctx.lineTo(W, H + 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, Y - amp, 0, H); g.addColorStop(0, c[0]); g.addColorStop(.35, c[1]); g.addColorStop(1, c[2]);
    ctx.globalAlpha = op; ctx.fillStyle = g; ctx.fill(); ctx.save(); ctx.clip(); ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {   // slanted light shafts
      const cx = ((i * .27 * W + tt * (.04 + i * .015) * W) % (W * 1.4)) - W * .2, rg = ctx.createLinearGradient(cx, Y, cx + 60 * u, H);
      rg.addColorStop(0, 'rgba(255,255,255,.2)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(cx, Y); ctx.lineTo(cx + 100 * u, Y); ctx.lineTo(cx + 300 * u, H); ctx.lineTo(cx + 110 * u, H); ctx.closePath(); ctx.fill()
    }
    ctx.strokeStyle = 'rgba(215,245,255,.13)'; ctx.lineWidth = 2 * u;   // drifting caustic lines
    for (let j = 0; j < 8; j++) { ctx.beginPath(); for (let x = 0; x <= W; x += 8) { const y = Y + (80 + j * 150) * u + Math.sin(x * .016 / u + tt * 1.2 + j) * 22 * u; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) } ctx.stroke() }
    const nb = Math.round(26 * num(w.bub, 1, 0, 2)) * (W > H ? 1.5 : 1) | 0;
    for (let i = 0; i < nb; i++) {   // bubbles rise from the bottom and pop at the surface
      const sp = (50 + hz(i * 3.1) * 140) * u, r = (3 + hz(i * 5.7) * 10) * u, cyc = H * 1.05, y = H + 20 - ((tt * sp + hz(i * 9.3) * cyc) % cyc), x = hz(i * 2.3) * W + Math.sin(tt * 2 + i) * 14 * u;
      if (y > Y + 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.strokeStyle = 'rgba(240,252,255,.75)'; ctx.lineWidth = 1.6 * u; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fill() }
    }
    ctx.restore();
    if (num(w.foam, 1, 0, 1)) {   // foam crest + a soft highlight under it
      ctx.beginPath(); for (let x = 0; x <= W; x += 4) { const y = surf(x, tt, Y, amp, 0, f); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      ctx.strokeStyle = 'rgba(240,252,255,.95)'; ctx.lineWidth = 5 * u; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); for (let x = 0; x <= W; x += 4) { const y = surf(x, tt, Y, amp, 0, f) + 11 * u; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 9 * u; ctx.stroke()
    }
    ctx.restore()
  }
  /* the liters counter: counts up with the water */
  function label(t, sc) {
    const w = on(sc); if (!w || w.lab === 0 || w.lab === '0') return; const s = state(t, sc, w), v = +w.L * s.e, u = Math.min(W, H) / 1080;
    if (+w.L === 0 && s.k <= 0) return; if (s.k <= 0 && !EDIT) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 4 * u; ctx.fillStyle = '#fff';
    const y = H * num(w.ly, .27, .05, .95), a = clamp(s.k * 6, 0, 1); ctx.globalAlpha = EDIT ? 1 : a;
    ctx.font = `900 ${96 * u}px Vz`; ctx.fillText(+w.L === 0 ? '۰' : faN(v), W / 2, y); ctx.font = `700 ${42 * u}px Vz`; ctx.fillText('لیتر آب', W / 2, y + 82 * u); ctx.restore()
  }
  return { draw, label, on, state, faN };
})();
