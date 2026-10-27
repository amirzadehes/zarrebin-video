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
    try: req = json.load(open(f'episodes/{ep}/request.json', encoding='utf8'))
    except Exception: req = {}
    if req.get('sfx') is False: print('sfx disabled'); return
    D = json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8')); total = D['meta']['total']
    ids = sorted({item_id(it.get('src')) for sc in D['scenes'] for it in sc.get('items', []) if it.get('src')})
    lib = match_library(ids); n_lib = 0
    if lib: print('sfx matched:', {k: os.path.basename(v) for k, v in lib.items()})
    buf = np.zeros(int((total + 1) * SR)); n_ev = 0
    def put(snd, t, g=1.0):
        nonlocal n_ev
        a = int(max(t, 0) * SR)
        if a >= len(buf): return
        b = min(a + len(snd), len(buf)); buf[a:b] += snd[:b - a] * g; n_ev += 1
    for k, sc in enumerate(D['scenes']):
        t0, t1 = sc['t0'], sc['t1']
        if k > 0: put(whoosh(.5, up=(k % 2 == 0)), t0 - .15, .8)
        for j, it in enumerate(sc.get('items', [])):
            kind, pitch = KIND.get(it.get('en', 'pop'), ('pop', 1.0)); t = it['t']; pj = pitch * (1 + .07 * ((j + k) % 4))
            mine = lib.get(item_id(it.get('src'))); x = _load(mine) if mine else None
            if x is not None: put(x, t, .9); n_lib += 1
            elif kind == 'pop': put(pop(pj), t, .8)
            elif kind == 'swoosh': put(swoosh_short(), t - .02, .7); put(pop(.9), t + .22, .35)
            else: put(swoosh_short(), t - .05, .5); put(thud(), t + .26, .7)
            if j == 0 and sc['tpl'] in ('hero',): put(sparkle(), t + .12, .45)
        if sc['tpl'] == 'statement':
            put(pop(.85), t0 + .1, .7); words = len((sc.get('text') or '').split()); gap = min(.2, max(t1 - t0 - 1.2, .6) / max(words, 1))
            for i in range(min(words, 10)): put(tick(), t0 + .3 + i * gap, .5)
        elif sc['tpl'] == 'stat': put(pop(.7), t0 + .15, .8); put(ding(), t0 + .3, .8); put(sparkle(), t0 + .45, .5)
        elif sc['tpl'] == 'hero' and sc.get('text'): put(pop(1.1), t0 + .35, .5)
        elif sc['tpl'] in ('duo', 'trio') and sc.get('text'): put(pop(1.05), t0 + .4, .5)
        if sc['tpl'] == 'duo' and len(sc.get('items', [])) > 1: put(ding(1568), sc['items'][1]['t'] + .06, .45)
    buf = np.tanh(buf * .9) * .85
    b, a = butter(2, 11000 / (SR / 2), btype='low'); buf = lfilter(b, a, buf)
    pcm = (np.clip(buf, -1, 1) * 32767).astype('<i2')
    with wave.open(f'episodes/{ep}/sfx.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print('sfx events', n_ev, 'from library', n_lib, 'peak %.2f' % np.abs(buf).max(), 'seconds', round(len(buf) / SR, 1))

if __name__ == '__main__': main(sys.argv[1])
