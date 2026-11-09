"""Sounds for the scene background layer (scene.bg), the pinned pictures (scene.pins) and the image-bound effects (item.fx / pin.fx) -> episodes/<ep>/bgfx.wav
All sounds are generated in code: free, no licences. Every event has its own volume (0-100) that the owner sets in the app.
usage: python tools/make_bgfx.py <episode>

Events (times mirror engine/fx.js):
  scene.bg      -> one sound when the motion starts (t0 + bg.start); directional / zoom / pop motions get a softer sound for each of the
                   first copies that enters (max 4). `cover` gets a run of pops that follows the slow-fast-slow arrival curve.
                   bg.sound = whoosh | swipe | airy | low | riser | pop | thud | none, bg.vol = 0-100.
  scene.pins[]  -> a paper "slap" when the picture is stuck on (t0 - .1 + pin.start), pin.vol = 0-100 (default 40).
  item.fx[] / pin.fx[] at (picture time + fx.start), fx.vol = 0-100:
                   steam / smoke (soft hiss), page-turn (paper rustle + flap), tea-ring (soft cup "tok"), aged (slow airy swell), burn (crackling fire),
                   sparkle (glints), shine (swish), crack (glass crack). glow / wiggle / pulse are silent.
No bg / pins / fx in scenes.json -> no file is written (the merge step skips a missing bgfx.wav)."""
import json, sys, wave, os, zlib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sfx as M   # the same synthesis building blocks as the other effects (whoosh, swipe, pop, tick, ...)

SR = M.SR
def clamp(v, a, b): return max(a, min(b, v))
def fnum(v, d):
    try: return float(v)
    except (TypeError, ValueError): return d
def mix(*parts):   # sounds of different lengths summed from their start
    n = max(len(p) for p in parts); out = np.zeros(n)
    for p in parts: out[:len(p)] += p
    return out

# ---------- image-bound effect sounds ----------
def steam_hiss(d):
    d = clamp(d, .8, 4.0); t = M.tt(d); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.4; n = M.noise(len(t))
    return M.fade(M.band(n, 2500, 9000) * env * .5 + M.band(n, 900, 2200) * env * .15, .05, .2) * .7
def paper_flap(d):
    d = clamp(d, .4, 1.6); t = M.tt(d); n = M.noise(len(t)); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2; x = M.band(n, 1800, 7500) * env * .5
    c = int(d * .5 * SR); k = min(int(.04 * SR), len(x) - c); x[c:c + k] += M.band(M.noise(k), 800, 5000) * np.exp(-np.arange(k) / (SR * .01)) * .9       # crack in the middle of the turn
    e = int(d * .92 * SR); k = min(int(.08 * SR), len(x) - e); x[e:e + k] += np.sin(2 * np.pi * 140 * np.arange(k) / SR) * np.exp(-np.arange(k) / (SR * .02)) * .5   # soft landing
    return M.fade(x, .005, .06) * .75
def cup_tok():
    return M.cap(mix(M.thud() * .55, M.tap(.7) * .7), .6)
def crackle(d):   # fire: a low roar with random pops and clicks
    d = clamp(d, .8, 6.0); t = M.tt(d); n = M.noise(len(t)); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** .8
    x = M.band(n, 120, 700) * env * .35 + M.band(n, 2500, 8000) * env * .08
    for _ in range(int(d * 22)):
        a = int(M.rng.random() * (len(t) - 700)); k = int(SR * (.004 + .01 * M.rng.random())); x[a:a + k] += M.band(M.noise(k + 64), 1200, 9000)[:k] * np.exp(-np.arange(k) / (k * .3)) * (.2 + .8 * M.rng.random()) * env[a]
    return M.fade(x, .05, .2) * .8
def glints(n):
    n = int(clamp(n, 2, 5)); out = np.zeros(int((.4 * n + .6) * SR))
    for i in range(n):
        s = M.sparkle() * (1 - .12 * i); a = int(i * .33 * SR); out[a:a + len(s)] += s[:len(out) - a]
    return out
def glass_crack():
    t = M.tt(.5); x = M.band(M.noise(len(t)), 2500, 11000) * np.exp(-t * 60) * .8 + np.sin(2 * np.pi * 900 * t) * np.exp(-t * 120) * .3
    for k, st in enumerate([.05, .11, .19, .28]):
        a = int(st * SR); s = M.tink(2400 + 700 * k)[:int(.12 * SR)] * .35; x[a:a + len(s)] += s[:len(x) - a]
    return M.fade(x, .001, .12) * .8

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
def cover_times(sp):   # same slow-fast-slow curve as engine/fx.js (cvS), a handful of pops spread along it
    Tc = 4.0 / sp; n = int(clamp(round(8 + Tc * 4), 10, 26))
    def S(x): return .25 * x + .75 * (x ** 3 * (x * (x * 6 - 15) + 10))
    def inv(y):
        a, b = 0.0, 1.0
        for _ in range(30):
            m = (a + b) / 2
            if S(m) < y: a = m
            else: b = m
        return (a + b) / 2
    return [(Tc * inv(i / (n - 1)), i / (n - 1)) for i in range(n)], Tc

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
    DEF = {'steam': (.3, 35, 2.5), 'smoke': (.3, 35, 2.5), 'page-turn': (0, 60, 1.1), 'tea-ring': (.2, 50, 0), 'aged': (0, 25, 1.2), 'burn': (.3, 55, 2.2),
           'sparkle': (.2, 40, 0), 'shine': (.3, 40, .9), 'crack': (.3, 60, 0)}
    def fx_sounds(fxs, t_pic):
        for f in fxs or []:
            typ = f.get('type'); dflt = DEF.get(typ)
            if not dflt: continue
            st, v, d = dflt; vol = clamp(fnum(f.get('vol'), v), 0, 100) / 100; t = t_pic + fnum(f.get('start'), st); dur = fnum(f.get('dur'), d) or d
            if typ in ('steam', 'smoke'): put(steam_hiss(dur or 2.5), t, vol)
            elif typ == 'page-turn': put(paper_flap(dur), t, vol)
            elif typ == 'tea-ring': put(cup_tok(), t, vol)
            elif typ == 'aged': put(M.airy(clamp(dur, .6, 3)) * .6, t, vol)
            elif typ == 'burn': put(crackle(dur), t, vol)
            elif typ == 'sparkle': put(glints(fnum(f.get('count'), 5) / 2), t, vol)
            elif typ == 'shine': put(M.swipe(.4), t, vol)
            elif typ == 'crack': put(glass_crack(), t, vol)
    for sc in D['scenes']:
        bg = sc.get('bg')
        if bg and bg.get('src'):
            kind = bg.get('sound', 'whoosh'); vol = clamp(fnum(bg.get('vol'), 60), 0, 100) / 100; t0 = sc['t0'] + max(0, fnum(bg.get('start'), 0))
            if bg.get('motion') == 'cover' and kind != 'none' and vol > 0:
                ts, Tc = cover_times(clamp(fnum(bg.get('speed'), 1), .2, 3))
                for k, (tm, pos) in enumerate(ts): put(M.pop(.8 + .6 * pos) * .8, t0 + tm, vol * (.35 + .65 * np.sin(np.pi * pos) ** .7))   # louder in the fast middle, soft at both ends
                put(M.riser(clamp(Tc * .5, .5, 2.0)) * .6, t0 + Tc * .15, vol * .6)
                put(M.thud() * .8, t0 + Tc + .05, vol * .7)   # the last picture lands
            elif kind != 'none' and vol > 0:
                snd = bg_sound(kind, bg.get('motion', 'down'), clamp(fnum(bg.get('speed'), 1), .2, 3))
                for k, dt in enumerate(entries(bg)): put(snd, t0 + dt, vol * (1, .7, .5, .35)[k])
        for i, p in enumerate(sc.get('pins') or []):
            if not p or not p.get('src'): continue
            ts = sc['t0'] - .1 + clamp(fnum(p.get('start'), i * .12), 0, 30)
            put(M.cap(M.slap(), .6), ts + .05, clamp(fnum(p.get('vol'), 40), 0, 100) / 100)
            fx_sounds(p.get('fx'), ts)
        for it in sc.get('items', []): fx_sounds(it.get('fx'), it['t'])
    if not n_ev: print('bgfx: no background, pin or effect sounds in this episode'); return
    buf = np.tanh(buf * .9) * .9
    pcm = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('bgfx events', n_ev, 'peak %.2f' % np.abs(buf).max(), 'seconds', round(len(buf) / SR, 1))

if __name__ == '__main__': main(sys.argv[1])
