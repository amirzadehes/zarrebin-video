"""Synthesised UI sound effects placed on the scene events -> episodes/<ep>/sfx.wav
All sounds are generated in code: free, no licences. usage: python tools/make_sfx.py <episode>

Variety: every event type has a pool of different sounds (pitch / length / filter differ); the pick is random but seeded
by the episode name (same episode -> same result), and the same sound never plays twice in a row.
Density: events closer than MIN_GAP seconds are dropped (low-priority ones first) so the track stays calm under the voice."""
import json, sys, wave, glob, os, subprocess, zlib
import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
rng = np.random.default_rng(7)   # re-seeded per episode in main()
MIN_GAP = .3

def tt(d): return np.arange(int(d * SR)) / SR
def fade(x, a=.002, r=.01):
    n = len(x); na, nr = max(int(a * SR), 1), max(int(r * SR), 1); e = np.ones(n); e[:na] = np.linspace(0, 1, na); e[-nr:] = np.linspace(1, 0, nr); return x * e
def band(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], btype='band'); return lfilter(b, a, x)
def noise(n): return rng.standard_normal(n)
def sweep(f): return np.sin(2 * np.pi * np.cumsum(f) / SR)

# ---------- pops (an object appears) ----------
def pop(p=1.0):
    t = tt(.16); f = (260 + 640 * np.exp(-t * 38)) * p; x = sweep(f) * np.exp(-t * 24); click = band(noise(len(t)), 1500, 6000) * np.exp(-t * 400) * .25
    return fade(x + click) * .9
def bloop(p=1.0):
    t = tt(.15); f = (230 + 700 * np.exp(-t * 26)) * p; return fade(sweep(f) * np.exp(-t * 20) + .15 * sweep(f * 2) * np.exp(-t * 35)) * .9
def bubble(p=1.0):
    t = tt(.13); f = (380 + 1900 * (t / .13) ** 1.4) * p; return fade(sweep(f) * np.exp(-t * 24) * (1 - np.exp(-t * 400))) * .75
def tap(p=1.0):
    t = tt(.09); return fade(np.sin(2 * np.pi * 520 * p * t) * np.exp(-t * 70) + band(noise(len(t)), 2000, 7000) * np.exp(-t * 300) * .3) * .9
def snap(p=1.0):
    t = tt(.1); return fade(band(noise(len(t)), 1800 * p, 9000) * np.exp(-t * 150) * .8 + np.sin(2 * np.pi * 700 * p * t) * np.exp(-t * 90) * .3) * .85
def boing(p=1.0):
    t = tt(.34); f = 210 * p * (1 + .55 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 7)); return fade(sweep(f) * np.exp(-t * 9)) * .75

# ---------- whooshes / swipes (scene changes, objects flying in) ----------
def whoosh(d=.5, up=True):
    t = tt(d); n = noise(len(t)); cs = [300, 700, 1500, 3000, 6000]; k = len(cs); out = np.zeros(len(t)); pos = np.linspace(0, k - 1, len(t)) if up else np.linspace(k - 1, 0, len(t))
    for i, c in enumerate(cs):
        w = np.clip(1 - np.abs(pos - i), 0, 1); out += band(n, c * .6, c * 1.5) * w
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6; return fade(out * env, .01, .05) * .55
def swipe(d=.22):
    t = tt(d); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.2; return fade(band(noise(len(t)), 1500, 9000) * env, .005, .05) * .6
def airy(d=.6):
    t = tt(d); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2; return fade(band(noise(len(t)), 3500, 11000) * env, .02, .08) * .5
def low_whoosh(d=.55):
    t = tt(d); env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.8; return fade(band(noise(len(t)), 120, 900) * env * 1.6, .02, .08) * .6
def riser(d=.6):
    t = tt(d); n = noise(len(t)); lo = 300 + 5000 * (t / d) ** 2; out = np.zeros(len(t)); step = 800
    for a in range(0, len(t) - step, step): out[a:a + step] = band(n[a:a + step * 2][:step], max(lo[a] * .5, 100), lo[a] * 1.5 + 200)
    return fade(out * (t / d) ** 1.5 * 1.6, .02, .03) * .5
def swoosh_short(): return whoosh(.28, True) * .8

# ---------- impacts / landings ----------
def thud():
    t = tt(.28); f = 52 + 70 * np.exp(-t * 30); x = sweep(f) * np.exp(-t * 14); return fade(x + band(noise(len(t)), 80, 400) * np.exp(-t * 40) * .25, .002, .05) * .9
def boom():
    t = tt(.55); f = 42 + 90 * np.exp(-t * 20); return fade(sweep(f) * np.exp(-t * 6) + band(noise(len(t)), 60, 300) * np.exp(-t * 14) * .3, .003, .12) * .85
def slap():
    t = tt(.16); return fade(band(noise(len(t)), 400, 3200) * np.exp(-t * 55) + sweep(70 + 90 * np.exp(-t * 40)) * np.exp(-t * 28) * .6, .001, .04) * .85

# ---------- accents (hero first item, stat, duo meeting) ----------
def ding(f0=1318):
    t = tt(.7); x = np.zeros(len(t))
    for m, dcy, g in [(1, 6, 1), (1.5, 9, .45), (2, 14, .3), (3.02, 22, .12)]: x += g * np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * dcy)
    return fade(x, .002, .05) * .5
def tink(f0=2400):
    t = tt(.35); x = np.sin(2 * np.pi * f0 * t) * np.exp(-t * 18) + .4 * np.sin(2 * np.pi * f0 * 2.76 * t) * np.exp(-t * 30); return fade(x, .001, .05) * .45
def chime(f0=1760):
    t = tt(.9); x = sum(g * np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * d) for m, g, d in [(1, 1, 4), (1.5, .5, 5), (2, .3, 7)]); return fade(x, .004, .15) * .4
def sparkle():
    out = np.zeros(int(.5 * SR))
    for k, (f, st) in enumerate([(2093, 0), (2637, .06), (3136, .12), (4186, .19)]):
        t = tt(.3); x = np.sin(2 * np.pi * f * t) * np.exp(-t * 16) * .35; a = int(st * SR); out[a:a + len(x)] += x[:len(out) - a]
    return fade(out, .002, .1) * .5

# ---------- ticks (statement words) ----------
def tick():
    t = tt(.05); return fade(np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 130) * .3 + band(noise(len(t)), 2500, 8000) * np.exp(-t * 200) * .12, .001, .01) * .8
def tock():
    t = tt(.06); return fade(np.sin(2 * np.pi * 880 * t) * np.exp(-t * 85) * .5, .001, .01) * .8
def blip():
    t = tt(.07); return fade(np.sin(2 * np.pi * 1400 * t) * np.exp(-t * 60) * .4, .001, .01) * .8

POOLS = {
    'pop':    [pop, bloop, bubble, tap, snap, boing],
    'swoosh': [swoosh_short, swipe, lambda: whoosh(.3, False) * .8],
    'land':   [thud, boom, slap],
    'accent': [ding, tink, chime],
    'tick':   [tick, tock, blip],
    'wipe0':  [lambda: whoosh(.5, True), lambda: whoosh(.55, False)],     # circle
    'wipe1':  [swipe, lambda: whoosh(.4, True)],                          # slant
    'wipe2':  [lambda: whoosh(.5, True), riser],                          # rise
    'wipe3':  [swipe, airy],                                              # blinds
    'wipe4':  [low_whoosh, lambda: whoosh(.45, False)],                   # split
    'wipe5':  [airy, lambda: whoosh(.5, True)],                           # diamond
}
_last = {}
def pick(pool, *a):
    fs = POOLS[pool]; i = int(rng.integers(len(fs)))
    if len(fs) > 1 and _last.get(pool) == i: i = (i + 1 + int(rng.integers(len(fs) - 1))) % len(fs)
    _last[pool] = i; f = fs[i]
    try: x = f(*a)
    except TypeError: x = f()
    return cap(x, .6 if pool.startswith(('wipe', 'swoosh')) else .9)   # band-passed noise peaks high: keep every sound at a similar level
def cap(x, m):
    p = np.abs(x).max(); return x * (m / p) if p > m else x
def jit(g=1.0, spread=.12): return g * (1 + spread * (rng.random() * 2 - 1))

KIND = {'pop': ('pop', 1.0), 'spin': ('pop', 1.25), 'zoom': ('pop', .8), 'left': ('swoosh', 1), 'right': ('swoosh', 1), 'rise': ('swoosh', 1), 'drop': ('drop', 1)}

# ---- optional user library: sfx/<description>.<ext>. The file NAME says what the sound is
# (e.g. metal-trash-can-filled.mp3). When an on-screen object matches a file, that sound plays when it appears.
import re
MAXSEC = 3.5
_cache = {}
def _load(path):
    if path in _cache: return _cache[path]
    try:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-t', str(MAXSEC), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype='<f4').astype(float)
        if len(x) < 100: raise ValueError('empty')
        x = x / max(np.abs(x).max(), 1e-6) * .8; x = fade(x, .003, min(.15, len(x) / SR / 3))
    except Exception as e:
        print('sfx file skipped', path, e); x = None
    _cache[path] = x; return x
def _toks(t):
    out = set()
    for w in re.split(r'[^a-z0-9]+', t.lower()):
        if len(w) > 2: out.add(w[:-1] if w.endswith('s') and len(w) > 3 else w)
    return out
def item_id(src): return os.path.basename(src or '').split('__')[0]
def match_library(ids):
    """-> {item id: sfx file}"""
    files = sorted(f for f in glob.glob('sfx/*') if os.path.isfile(f))
    if not files or not ids: return {}
    names = {f: os.path.splitext(os.path.basename(f))[0].replace('__', ' ') for f in files}
    m = {}
    for i in ids:  # keyword overlap
        best = None; bs = 0
        for f, n in names.items():
            sc = len(_toks(i) & _toks(n))
            if sc > bs: best, bs = f, sc
        if best: m[i] = best
    try:  # semantic match by AI (e.g. "bin" ~ "trash can"); falls back to keywords
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import groqlib
        r = groqlib.chat('You match on-screen objects to sound-effect files. Each file name describes the sound. For each object id return the file whose sound clearly belongs to that object (the object makes that sound), or null when none fits. Do not force weak matches. Reply JSON {"object id": "file name or null"}.',
            json.dumps({'objects': ids, 'files': list(names.values())}, ensure_ascii=False), json_mode=True, temperature=0)
        j = json.loads(r); byname = {v: k for k, v in names.items()}
        for i in ids:
            v = j.get(i)
            if v is None or v == 'null': m.pop(i, None)
            elif v in byname: m[i] = byname[v]
    except (Exception, SystemExit) as e: print('sfx AI match skipped:', str(e)[:100])
    return m

def main(ep):
    global rng
    try: req = json.load(open(f'episodes/{ep}/request.json', encoding='utf8'))
    except Exception: req = {}
    if req.get('sfx') is False: print('sfx disabled'); return
    rng = np.random.default_rng(zlib.crc32(ep.encode()))   # same episode -> same choices; another episode -> another mix
    D = json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8')); total = D['meta']['total']
    ids = sorted({item_id(it.get('src')) for sc in D['scenes'] for it in sc.get('items', []) if it.get('src')})
    lib = match_library(ids); n_lib = 0
    if lib: print('sfx matched:', {k: os.path.basename(v) for k, v in lib.items()})
    buf = np.zeros(int((total + 1) * SR)); n_ev = 0; n_skip = 0; times = []
    gap = float(req.get('sfx_gap', MIN_GAP))
    def put(snd, t, g=1.0, pri=1):
        """pri 2 = always plays; pri 1 = dropped when another event is within `gap`; pri 0 = needs a 2x gap"""
        nonlocal n_ev, n_skip
        if pri < 2 and any(abs(t - u) < gap * (2 if pri == 0 else 1) for u in times): n_skip += 1; return
        a = int(max(t, 0) * SR)
        if a >= len(buf): return
        b = min(a + len(snd), len(buf)); buf[a:b] += snd[:b - a] * g; n_ev += 1; times.append(t)
    for k, sc in enumerate(D['scenes']):
        t0, t1 = sc['t0'], sc['t1']; tpl = sc['tpl']
        if k > 0: put(pick('wipe%d' % (sc.get('wipe', 0) % 6)), t0 - .15, jit(.8), 2)
        for j, it in enumerate(sc.get('items', [])):
            kind, pitch = KIND.get(it.get('en', 'pop'), ('pop', 1.0)); t = it['t']; pj = pitch * (1 + .07 * ((j + k) % 4)) * jit(1, .06)
            mine = lib.get(item_id(it.get('src'))); x = _load(mine) if mine else None
            if x is not None: put(x, t, .9, 2); n_lib += 1
            elif kind == 'pop': put(pick('pop', pj), t, jit(.8))
            elif kind == 'swoosh': put(pick('swoosh'), t - .02, jit(.7)); put(pick('pop', .9), t + .22, jit(.35), 0)
            else: put(pick('swoosh'), t - .05, jit(.5)); put(pick('land'), t + .26, jit(.7))
            if j == 0 and tpl == 'hero': put(sparkle(), t + .12, .4, 0)
        if tpl == 'statement':
            put(pick('pop', .85), t0 + .1, jit(.7)); words = len((sc.get('text') or '').split()); g2 = min(.2, max(t1 - t0 - 1.2, .6) / max(words, 1))
            for i in range(0, min(words, 6), 2): put(pick('tick'), t0 + .3 + i * g2, jit(.45), 0)   # every other word, at most 3 ticks
        elif tpl == 'stat': put(cap(riser(.45), .6), t0 - .3, .5, 1); put(pick('pop', .7), t0 + .15, jit(.8), 2); put(pick('accent'), t0 + .3, jit(.7), 2); put(sparkle(), t0 + .45, .4, 0)
        elif tpl == 'hero' and sc.get('text'): put(pick('pop', 1.1), t0 + .35, jit(.5), 0)
        elif tpl in ('duo', 'trio') and sc.get('text'): put(pick('pop', 1.05), t0 + .4, jit(.5), 0)
        if tpl == 'duo' and len(sc.get('items', [])) > 1: put(pick('land'), sc['items'][1]['t'] + .06, jit(.5), 1)   # the two objects meet (matches the impact burst)
    buf = np.tanh(buf * .9) * .85
    b, a = butter(2, 11000 / (SR / 2), btype='low'); buf = lfilter(b, a, buf)
    pcm = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(f'episodes/{ep}/sfx.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('sfx events', n_ev, 'dropped (too dense)', n_skip, 'from library', n_lib, 'peak %.2f' % np.abs(buf).max(), 'seconds', round(len(buf) / SR, 1))

if __name__ == '__main__': main(sys.argv[1])
