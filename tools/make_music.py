"""Original background music, synthesised with numpy (no licence issues, free).
usage: make_music.py <episode>   -> episodes/<ep>/music.wav (stereo 44.1k, length = voice length + 1.2 s)
The mood comes from request.json 'music' (calm|curious|mystery|upbeat|dramatic|auto|none); auto asks Groq to read the script."""
import json, os, sys, wave
import numpy as np
SR = 44100
MOODS = {
    # bpm, root midi, scale/chords (semitone offsets of triad roots + quality), feel
    'calm':     dict(bpm=72,  root=57, prog=[(0,'maj7'),(5,'maj7'),(7,'sus'),(3,'maj7')], arp=0.5, drums=0,  bass=1, bright=.45),
    'curious':  dict(bpm=100, root=60, prog=[(0,'maj'),(9,'min'),(5,'maj'),(7,'maj')],    arp=1.0, drums=1,  bass=1, bright=.7),
    'upbeat':   dict(bpm=116, root=62, prog=[(0,'maj'),(7,'maj'),(9,'min'),(5,'maj')],    arp=1.0, drums=2,  bass=1, bright=.85),
    'mystery':  dict(bpm=78,  root=57, prog=[(0,'min'),(8,'maj'),(3,'maj'),(10,'maj')],   arp=0.5, drums=0,  bass=1, bright=.4),
    'dramatic': dict(bpm=88,  root=55, prog=[(0,'min'),(8,'maj'),(5,'min'),(7,'maj')],    arp=0.5, drums=1,  bass=1, bright=.55),
}
QUAL = {'maj':[0,4,7],'min':[0,3,7],'maj7':[0,4,7,11],'sus':[0,2,7]}
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def env(n, a, d, s, r_start=None):
    t = np.arange(n) / SR; e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    if r_start is not None:
        rr = np.clip(1 - (t - r_start) / .25, 0, 1); e = e * rr
    return e
def pad(freqs, dur, bright):
    n = int(dur * SR); t = np.arange(n) / SR; y = np.zeros(n)
    for f in freqs:
        for det in (-.004, 0, .004):
            ph = 2 * np.pi * f * (1 + det) * t
            y += np.sin(ph) + .35 * np.sin(2 * ph) * bright + .15 * np.sin(3 * ph) * bright
    y /= max(len(freqs) * 3, 1)
    return y * env(n, .5, 1, 1, dur - .3)
def pluck(f, dur=.9, bright=.7):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2*np.pi*f*t) + .5*bright*np.sin(4*np.pi*f*t)*np.exp(-t*6) + .25*bright*np.sin(6*np.pi*f*t)*np.exp(-t*10)
    return y * np.exp(-t * 4.2) * np.minimum(t * 400, 1)
def bassnote(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2*np.pi*f*t) + .3*np.sin(4*np.pi*f*t)) * env(n, .01, .3, .6, dur - .1)
def kick():
    n = int(.25 * SR); t = np.arange(n) / SR; f = 110 * np.exp(-t * 18) + 45
    return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t * 14)
def hat(rng):
    n = int(.05 * SR); x = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 90)
    return np.diff(x, prepend=0) * .5
def add(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1]: return
    x = x[:buf.shape[1] - i]
    buf[0, i:i+len(x)] += x * gain * (1 - max(pan, 0)); buf[1, i:i+len(x)] += x * gain * (1 + min(pan, 0))
def render(mood, total, seed=7):
    M = MOODS[mood]; rng = np.random.default_rng(seed); beat = 60 / M['bpm']; bar = 4 * beat
    buf = np.zeros((2, int(total * SR) + SR))
    nb = int(total / bar) + 2
    for b in range(nb):
        root_off, q = M['prog'][b % 4]; base = M['root'] + root_off; notes = [base + x for x in QUAL[q]]
        t0 = b * bar
        add(buf, pad([hz(n) for n in notes], bar + .4, M['bright']), t0, .55)
        if M['bass']: 
            add(buf, bassnote(hz(base - 24 + 12), bar * .5), t0, .5); add(buf, bassnote(hz(base - 12 + (7 if M['drums'] else 0)), bar * .5), t0 + bar * .5, .4)
        steps = int(8 * M['arp']) if M['arp'] >= 1 else 4
        step = bar / steps
        for k in range(steps):
            n = notes[[0, 1, 2, 1, 2, 1, 0, 2][k % 8] % len(notes)] + (12 if k % 4 == 2 else 0) + 12
            add(buf, pluck(hz(n), 1.0, M['bright']), t0 + k * step, .32, pan=.35 if k % 2 else -.35)
        if M['drums']:
            for k in range(4):
                if M['drums'] == 2 or k % 2 == 0: add(buf, kick(), t0 + k * beat, .42)
                if M['drums'] == 2 or k % 2 == 1: add(buf, hat(rng), t0 + k * beat + beat / 2, .35, pan=.2)
    y = buf[:, :int(total * SR)]
    # soft low-pass for warmth, fades, gentle limiter
    from scipy.signal import butter, sosfilt
    y = sosfilt(butter(2, 7000 if M['bright'] > .6 else 4500, 'low', fs=SR, output='sos'), y, axis=1)
    n = y.shape[1]; fi = int(2.5 * SR); fo = int(4 * SR)
    y[:, :fi] *= np.linspace(0, 1, fi); y[:, -fo:] *= np.linspace(1, 0, fo)
    y = np.tanh(y / (np.abs(y).max() + 1e-9) * 1.4) / 1.4
    return y * 0.3
def pick_mood(ep, req):
    m = req.get('music', 'auto')
    if m in MOODS: return m
    try:
        sys.path.insert(0, os.path.dirname(__file__)); import groqlib
        txt = open(f'episodes/{ep}/script.txt', encoding='utf8').read()[:3500]
        a = groqlib.chat('You choose background music mood for a podcast explainer video. Answer with exactly one word from: calm, curious, mystery, upbeat, dramatic. '
                         'calm=wellbeing, sleep, relaxed topics; curious=science/facts/everyday trivia; mystery=secrets, history, crime, unknown; upbeat=fun, money, lifestyle, food; dramatic=serious, danger, social issues.',
                         txt, max_tokens=20, temperature=0).strip().lower()
        for k in MOODS:
            if k in a: return k
    except (Exception, SystemExit) as e: print("mood pick failed:", e)
    return 'curious'
def library_track(ep, mood):
    """music files the owner uploaded in the app: music/<mood>__name.mp3 (mood may be 'any')"""
    import glob, hashlib
    fs = sorted(glob.glob(f'music/{mood}__*') + glob.glob('music/any__*'))
    if not fs: fs = sorted(glob.glob('music/*__*'))
    if not fs: return None
    return fs[int(hashlib.md5(ep.encode()).hexdigest(), 16) % len(fs)]
def main(ep):
    req = json.load(open(f'episodes/{ep}/request.json')) if os.path.exists(f'episodes/{ep}/request.json') else {}
    if req.get('music') in ('none', False): print('music off'); return
    T = json.load(open(f'episodes/{ep}/timing.json')); total = T['voice_seconds'] + 1.2
    if req.get('music') == 'synth':
        mood = pick_mood(ep, {**req, 'music': 'auto'}); print('synth music mood:', mood)
        y = render(mood, total); pcm = (np.clip(y, -1, 1) * 32767).astype('<i2').T.copy()
        with wave.open(f'episodes/{ep}/music.wav', 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        return
    mood = pick_mood(ep, req); tr = library_track(ep, mood)
    if not tr: print('no music uploaded yet (app > settings > music) - video will have no background music'); return
    import subprocess
    print('music mood:', mood, '| track:', tr, '| seconds', round(total))
    subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', tr, '-t', str(total), '-ac', '2', '-ar', str(SR),
        '-af', f'loudnorm=I=-24:TP=-3:LRA=7,afade=t=in:d=2.5,afade=t=out:st={max(total - 4, 0)}:d=4', f'episodes/{ep}/music.wav'])
if __name__ == '__main__': main(sys.argv[1])
