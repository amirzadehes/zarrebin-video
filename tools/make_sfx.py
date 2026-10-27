"""Synthesised UI sound effects (pop, whoosh, ding, tick ...) placed on the scene events -> episodes/<ep>/sfx.wav
All sounds are generated in code: free, no licences. usage: python tools/make_sfx.py <episode>"""
import json, sys, wave, glob, os, subprocess
import numpy as np
from scipy.signal import butter, lfilter

SR = 44100
rng = np.random.default_rng(7)

def tt(d): return np.arange(int(d * SR)) / SR
def fade(x, a=.002, r=.01):
    n = len(x); na, nr = int(a * SR), int(r * SR); e = np.ones(n); e[:na] = np.linspace(0, 1, na); e[-nr:] = np.linspace(1, 0, nr); return x * e
def band(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], btype='band'); return lfilter(b, a, x)

def pop(p=1.0):
    t = tt(.16); f = (260 + 640 * np.exp(-t * 38)) * p; ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 24); click = band(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t * 400) * .25
    return fade(x + click) * .9

def whoosh(d=.5, up=True):
    t = tt(d); n = rng.standard_normal(len(t)); cs = [300, 700, 1500, 3000, 6000]; k = len(cs); out = np.zeros(len(t)); pos = np.linspace(0, k - 1, len(t)) if up else np.linspace(k - 1, 0, len(t))
    for i, c in enumerate(cs):
        w = np.clip(1 - np.abs(pos - i), 0, 1); out += band(n, c * .6, c * 1.5) * w
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6; return fade(out * env, .01, .05) * .55

def ding(f0=1318):
    t = tt(.7); x = np.zeros(len(t))
    for m, dcy, g in [(1, 6, 1), (1.5, 9, .45), (2, 14, .3), (3.02, 22, .12)]: x += g * np.sin(2 * np.pi * f0 * m * t) * np.exp(-t * dcy)
    return fade(x, .002, .05) * .5

def tick():
    t = tt(.05); return fade(np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 130) * .3 + band(rng.standard_normal(len(t)), 2500, 8000) * np.exp(-t * 200) * .12, .001, .01) * .8

def thud():
    t = tt(.28); f = 52 + 70 * np.exp(-t * 30); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14); return fade(x + band(rng.standard_normal(len(t)), 80, 400) * np.exp(-t * 40) * .25, .002, .05) * .9

def sparkle():
    out = np.zeros(int(.5 * SR))
    for k, (f, st) in enumerate([(2093, 0), (2637, .06), (3136, .12), (4186, .19)]):
        t = tt(.3); x = np.sin(2 * np.pi * f * t) * np.exp(-t * 16) * .35; a = int(st * SR); out[a:a + len(x)] += x[:len(out) - a]
    return fade(out, .002, .1) * .5

def swoosh_short(): return whoosh(.28, True) * .8

# ---- optional user library: sfx/<category>__<name>.<ext>  (categories: pop whoosh ding tick thud sparkle)
MAXLEN = {'pop': .5, 'whoosh': 1.0, 'ding': 1.2, 'tick': .25, 'thud': .8, 'sparkle': 1.0}
_lib, _cache, _cnt = {}, {}, {}
def _load(path, cat):
    if path in _cache: return _cache[path]
    try:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-t', str(MAXLEN[cat]), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(raw, dtype='<f4').astype(float)
        if len(x) < 100: raise ValueError('empty')
        x = x / max(np.abs(x).max(), 1e-6) * .8; x = fade(x, .002, min(.05, len(x) / SR / 3))
    except Exception as e:
        print('sfx file skipped', path, e); x = None
    _cache[path] = x; return x
def pick(cat, synth, *a, **k):
    fs = _lib.get(cat) or []
    if fs:
        i = _cnt.get(cat, 0); _cnt[cat] = i + 1
        for d in range(len(fs)):
            x = _load(fs[(i + d) % len(fs)], cat)
            if x is not None: return x
    return synth(*a, **k)
def scan():
    for f in sorted(glob.glob('sfx/*__*')):
        c = os.path.basename(f).split('__')[0]
        if c in MAXLEN: _lib.setdefault(c, []).append(f)
    if _lib: print('sfx library:', {c: len(v) for c, v in _lib.items()})
KIND = {'pop': ('pop', 1.0), 'spin': ('pop', 1.25), 'zoom': ('pop', .8), 'left': ('swoosh', 1), 'right': ('swoosh', 1), 'rise': ('swoosh', 1), 'drop': ('drop', 1)}

def main(ep):
    try: req = json.load(open(f'episodes/{ep}/request.json', encoding='utf8'))
    except Exception: req = {}
    if req.get('sfx') is False: print('sfx disabled'); return
    scan()
    D = json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8')); total = D['meta']['total']
    buf = np.zeros(int((total + 1) * SR)); n_ev = 0
    def put(snd, t, g=1.0):
        nonlocal n_ev
        a = int(max(t, 0) * SR)
        if a >= len(buf): return
        b = min(a + len(snd), len(buf)); buf[a:b] += snd[:b - a] * g; n_ev += 1
    for k, sc in enumerate(D['scenes']):
        t0, t1 = sc['t0'], sc['t1']
        if k > 0: put(pick('whoosh', whoosh, .5, up=(k % 2 == 0)), t0 - .15, .8)
        for j, it in enumerate(sc.get('items', [])):
            kind, pitch = KIND.get(it.get('en', 'pop'), ('pop', 1.0)); t = it['t']; pj = pitch * (1 + .07 * ((j + k) % 4))
            if kind == 'pop': put(pick('pop', pop, pj), t, .8)
            elif kind == 'swoosh': put(pick('whoosh', swoosh_short), t - .02, .7); put(pick('pop', pop, .9), t + .22, .35)
            else: put(pick('whoosh', swoosh_short), t - .05, .5); put(pick('thud', thud), t + .26, .7)
            if j == 0 and sc['tpl'] in ('hero',): put(pick('sparkle', sparkle), t + .12, .45)
        if sc['tpl'] == 'statement':
            put(pick('pop', pop, .85), t0 + .1, .7); words = len((sc.get('text') or '').split()); gap = min(.2, max(t1 - t0 - 1.2, .6) / max(words, 1))
            for i in range(min(words, 10)): put(pick('tick', tick), t0 + .3 + i * gap, .5)
        elif sc['tpl'] == 'stat': put(pick('pop', pop, .7), t0 + .15, .8); put(pick('ding', ding), t0 + .3, .8); put(pick('sparkle', sparkle), t0 + .45, .5)
        elif sc['tpl'] == 'hero' and sc.get('text'): put(pick('pop', pop, 1.1), t0 + .35, .5)
        elif sc['tpl'] in ('duo', 'trio') and sc.get('text'): put(pick('pop', pop, 1.05), t0 + .4, .5)
        if sc['tpl'] == 'duo' and len(sc.get('items', [])) > 1: put(pick('ding', ding, 1568), sc['items'][1]['t'] + .06, .45)
    buf = np.tanh(buf * .9) * .85
    b, a = butter(2, 11000 / (SR / 2), btype='low'); buf = lfilter(b, a, buf)
    pcm = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(f'episodes/{ep}/sfx.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('sfx events', n_ev, 'peak %.2f' % np.abs(buf).max(), 'seconds', round(len(buf) / SR, 1))

if __name__ == '__main__': main(sys.argv[1])
