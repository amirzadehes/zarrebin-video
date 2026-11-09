"""Sounds for the scene background layer (scene.bg) and the image-bound effects (item.fx) -> episodes/<ep>/bgfx.wav
All sounds are generated in code: free, no licences. Every event has its own volume (0-100) that the owner sets in the app.
usage: python tools/make_bgfx.py <episode>

Events (times mirror engine/fx.js):
  scene.bg      -> one sound when the motion starts (t0 + bg.start); directional / zoom / pop motions get a softer sound for each of the
                   first copies that enters (max 4). bg.sound = whoosh | swipe | airy | low | riser | pop | thud | none, bg.vol = 0-100.
  item.fx[]     -> steam (soft hiss), page-turn (paper rustle + flap), clock-rewind (accelerating ticks + whirr) at item.t + fx.start, fx.vol = 0-100.
No bg / fx in scenes.json -> no file is written (the merge step skips a missing bgfx.wav)."""
import json, sys, wave, os, zlib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sfx as M   # the same synthesis building blocks as the other effects (whoosh, swipe, pop, tick, ...)

SR = M.SR
def clamp(v, a, b): return max(a, min(b, v))
def fnum(v, d):
    try: return float(v)
    except (TypeError, ValueError): return d

# ---------- image-bound effect sounds ----------
def steam_hiss(d):
    d = clamp(d, .8, 4.0); t = M.tt(d); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.4; n = M.noise(len(t))
    return M.fade(M.band(n, 2500, 9000) * env * .5 + M.band(n, 900, 2200) * env * .15, .05, .2) * .7
def paper_flap(d):
    d = clamp(d, .4, 1.6); t = M.tt(d); n = M.noise(len(t)); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2; x = M.band(n, 1800, 7500) * env * .5
    c = int(d * .5 * SR); k = min(int(.04 * SR), len(x) - c); x[c:c + k] += M.band(M.noise(k), 800, 5000) * np.exp(-np.arange(k) / (SR * .01)) * .9       # crack in the middle of the turn
    e = int(d * .92 * SR); k = min(int(.08 * SR), len(x) - e); x[e:e + k] += np.sin(2 * np.pi * 140 * np.arange(k) / SR) * np.exp(-np.arange(k) / (SR * .02)) * .5   # soft landing
    return M.fade(x, .005, .06) * .75
def rewind_ticks(d):
    d = clamp(d, .8, 6.0); out = np.zeros(int((d + .3) * SR)); n = int(d * 9) + 4
    for k in range(n):
        p = k / (n - 1); tk = d * (1 - (1 - p) ** 1.7)   # the ticks speed up like a winding clock
        snd = M.tick() if k % 2 == 0 else M.tock(); a = int(tk * SR); b = min(a + len(snd), len(out)); out[a:b] += snd[:b - a] * (.5 + .5 * p)
    t = M.tt(len(out) / SR); m = min(len(t), len(out)); env = np.clip(t[:m] / d, 0, 1) ** 1.5 * np.clip((d + .3 - t[:m]) / .3, 0, 1)
    out[:m] = out[:m] * .9 + M.band(M.noise(m), 600, 4500) * env * .18   # rising whirr under the ticks
    return M.fade(out, .003, .08) * .8

# ---------- background layer ----------
def bg_sound(kind, motion, speed):
    d = float(clamp(.55 / max(speed, .2) ** .5, .28, .9)); up = motion in ('up', 'zoom', 'fillin', 'pop')
    f = {'whoosh': lambda: M.whoosh(d, up), 'swipe': lambda: M.swipe(.28), 'airy': lambda: M.airy(d), 'low': lambda: M.low_whoosh(d),
         'riser': lambda: M.riser(d), 'pop': lambda: M.pop(1.0), 'thud': lambda: M.thud()}.get(kind)
    return M.cap(f(), .6) if f else None
def entries(bg):
    mot = bg.get('motion', 'down'); sp = clamp(fnum(bg.get('speed'), 1), .2, 3); N = int(clamp(round(fnum(bg.get('count'), 3)), 1, 20)); hold = bool(bg.get('hold'))
    if mot in ('down', 'up', 'left', 'right'): gap = .2 / sp if hold else (3.2 / sp) / N
    elif mot == 'zoom': gap = .2 / sp if hold else (3.6 / sp) / N
    elif mot == 'pop': gap = .2 / sp
    else: return [0.0]          # fill / fillin / scroll: a single sound at the start
    return [i * gap for i in range(min(N, 4))]

def main(ep):
    out = f'episodes/{ep}/bgfx.wav'
    if os.path.exists(out): os.remove(out)   # never merge a stale file from an earlier run
    try: req = json.load(open(f'episodes/{ep}/request.json', encoding='utf8'))
    except Exception: req = {}
    if req.get('sfx') is False: print('bgfx disabled (sfx off)'); return
    D = json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8')); total = D['meta']['total']
    M.rng = np.random.default_rng(zlib.crc32((ep + '|bg').encode()))   # same episode -> same sounds
    buf = np.zeros(int((total + 3) * SR)); n_ev = 0
    def put(snd, t, g):
        nonlocal n_ev
        if snd is None or g <= 0 or t >= total: return
        a = int(max(t, 0) * SR); b = min(a + len(snd), len(buf))
        if a >= len(buf): return
        buf[a:b] += snd[:b - a] * g; n_ev += 1
    for sc in D['scenes']:
        bg = sc.get('bg')
        if bg and bg.get('src'):
            kind = bg.get('sound', 'whoosh'); vol = clamp(fnum(bg.get('vol'), 60), 0, 100) / 100
            if kind != 'none' and vol > 0:
                t0 = sc['t0'] + max(0, fnum(bg.get('start'), 0)); snd = bg_sound(kind, bg.get('motion', 'down'), clamp(fnum(bg.get('speed'), 1), .2, 3))
                for k, dt in enumerate(entries(bg)): put(snd, t0 + dt, vol * (1, .7, .5, .35)[k])
        for it in sc.get('items', []):
            for f in it.get('fx') or []:
                typ = f.get('type'); dflt = {'steam': (.3, 35, 2.5), 'page-turn': (0, 60, 1.1), 'clock-rewind': (.3, 55, 2.6)}.get(typ)
                if not dflt: continue
                st, v, d = dflt; vol = clamp(fnum(f.get('vol'), v), 0, 100) / 100; t = it['t'] + fnum(f.get('start'), st); dur = fnum(f.get('dur'), d)
                if typ == 'steam': put(steam_hiss(dur), t, vol)
                elif typ == 'page-turn': put(paper_flap(dur), t, vol)
                else: put(rewind_ticks(dur), t, vol)
    if not n_ev: print('bgfx: no background or effect sounds in this episode'); return
    buf = np.tanh(buf * .9) * .9
    pcm = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('bgfx events', n_ev, 'peak %.2f' % np.abs(buf).max(), 'seconds', round(len(buf) / SR, 1))

if __name__ == '__main__': main(sys.argv[1])
