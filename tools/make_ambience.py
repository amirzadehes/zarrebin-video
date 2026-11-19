"""Ambience beds (wind, crowd, fire, ...) laid under the voice.
usage: python tools/make_ambience.py assign <episode>   the director picks one bed per scene (only where the scene has no 'amb' yet) -> scenes.json
       python tools/make_ambience.py build  <episode>   mixes the beds -> episodes/<ep>/ambience.wav (stereo 44.1k, length = video length)

scenes.json: meta.ambClips = [{"src": slug of a file in ambience/, "t0": start s, "t1": end s, "vol": percent (default 100)}]
  meta.ambVol = percent for the whole episode (default 100); meta.amb === false switches the layer off.
  'assign' writes ambClips once (when the key is missing; an empty list means the owner removed them all and is kept). The owner edits the clips in the app,
  and hears them in the preview (engine/preview.html uses the same fades and level). A change of bed cross-fades, beds are normalised quiet (a bed under a voice)."""
import re, glob, json, math, os, subprocess, sys, tempfile

SR = 44100
XF = 2.5        # soft fade in / out of every bed and cross-fade between two beds (seconds); first bed fades in over 1.5 s, last out over 3 s
LOOP_XF = 1.5   # cross-fade inside a bed that has to be repeated
LUFS = -31      # a bed sits well below the voice


def slugs(): return sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob('ambience/*.mp3'))


def load(ep): return json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8'))


def assign(ep):
    S = [x for x in slugs() if not re.search(r'-\d$', x) and not x.startswith('u-')]   # the director picks topics; the -2/-3 recordings are alternatives the owner can choose by hand
    if not S: print('ambience: no beds in ambience/ yet (run the workflow "Fetch ambience beds")'); return
    D = load(ep); M = D['meta']
    if M.get('amb') is False: print('ambience: switched off'); return
    if 'ambClips' in M: print('ambience: clips already there (' + str(len(M['ambClips'])) + '), left as the owner has them'); return
    sys.path.insert(0, os.path.dirname(__file__)); import groqlib
    sc = D['scenes']
    def desc(i):
        ph = sc[i].get('photo') or {}
        return '%d | %s | %s' % (i, (sc[i].get('text') or '')[:60], str(ph.get('prompt') or '')[:230])
    system = ('You are the sound designer of a narrated documentary-style video. For each scene choose ONE quiet ambience bed that matches the place and weather of the scene, from the list. '
              'Rules: use few distinct beds and keep the SAME bed for consecutive scenes of the same place (continuity matters more than variety); '
              'beds named mood-* are for abstract moments with no real place or sound (a dream, a vision, a soul ascending, awe, grief, prophecy): use them for such scenes instead of "none"; choose "none" when nothing fits or the scene is graphic; never invent names. Answer JSON only: {"scenes":[{"i":0,"amb":"slug"}]}.\nBeds: ' + ', '.join(S))
    try:
        raw = groqlib.chat(system, 'Scenes (index | on-screen text | picture description):\n' + '\n'.join(desc(i) for i in range(len(sc))), max_tokens=1800, json_mode=True, temperature=.2)
        got = {}
        for o in groqlib.objects(raw, 'i'):
            try: got[int(o['i'])] = str(o.get('amb') or 'none').strip().lower()
            except Exception: pass
    except (Exception, SystemExit) as e:
        print('ambience: director failed, no clips written:', str(e)[:140]); return
    T = float(M.get('total') or sc[-1]['t1']); clips = []
    for i, s_ in enumerate(sc):
        v = got.get(i, 'none')
        if v not in S: continue
        if clips and clips[-1]['src'] == v and clips[-1]['_last'] == i - 1: clips[-1]['t1'] = float(s_['t1']); clips[-1]['_last'] = i
        else: clips.append({'src': v, 't0': float(s_['t0']), 't1': float(s_['t1']), '_last': i})
    for c in clips:   # exact scene boundaries: the fades happen during the camera move between the scenes (see eff())
        c['t0'] = round(c['t0'], 2); c['t1'] = round(min(T, c['t1']), 2); c['vol'] = 100; del c['_last']
    M['ambClips'] = clips
    json.dump(D, open(f'episodes/{ep}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('ambience: wrote', len(clips), 'clips:', ', '.join('%s %.0f-%.0fs' % (c['src'], c['t0'], c['t1']) for c in clips))


def dur(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).decode().strip())


def bed(slug, d, gain, fade_in, fade_out, out):
    """one continuous bed of length d: the file repeated with cross-fades if it is shorter, normalised, faded, scaled"""
    src = f'ambience/{slug}.mp3'; L = dur(src)
    n = 1 if d <= L else int(math.ceil((d - LOOP_XF) / max(L - LOOP_XF, 1))) + 1
    cmd = ['ffmpeg', '-loglevel', 'error', '-y']
    for _ in range(n): cmd += ['-i', src]
    if n == 1: chain = '[0:a]anull[x]'
    else:
        chain = ''; last = '[0:a]'
        for k in range(1, n):
            nm = '[x]' if k == n - 1 else f'[c{k}]'
            chain += f'{last}[{k}:a]acrossfade=d={LOOP_XF}:c1=tri:c2=tri{nm};'; last = nm
        chain = chain.rstrip(';')
    fi, fo = min(fade_in, d / 2), min(fade_out, d / 2)
    chain += f';[x]atrim=0:{d:.3f},asetpts=PTS-STARTPTS,loudnorm=I={LUFS}:TP=-6:LRA=11,volume={gain:.3f},afade=t=in:d={fi:.2f}:curve=qsin,afade=t=out:st={max(d - fo, 0):.3f}:d={fo:.2f}:curve=qsin,aresample={SR}[o]'
    subprocess.check_call(cmd + ['-filter_complex', chain, '-map', '[o]', '-ac', '2', out])


def eff(M, S, a, b, T):
    """(start, end, fade-in, fade-out): a bed that starts / ends exactly at a scene boundary fades during the camera move between the two scenes
    (fly-through window: 0.55 s before and 0.55 s after the boundary; without fly-through 0.25 s / 0.45 s). Same rule as engine/preview.html ambEff()."""
    fi = min(1.5 if a <= .01 else XF, (b - a) / 2); fo = min(3.0 if b >= T - .01 else XF, (b - a) / 2)
    def bd(x):
        for k in range(1, len(S)):
            if abs(float(S[k]['t0']) - x) < .15: return k
        return -1
    def win(k):
        on = bool(S[k]['fly']) if S[k].get('fly') is not None else M.get('fly') is True
        pre = min(.55, max(.2, (float(S[k]['t0']) - float(S[k - 1]['t0'])) * .3)) if on else .25; post = .55 if on else .45
        return float(S[k]['t0']) - pre, float(S[k]['t0']) + post
    k = bd(a) if a > .01 else -1
    if k > 0: w = win(k); a, fi = w[0], w[1] - w[0]
    k = bd(b)
    if k > 0 and b < T - .01: w = win(k); b, fo = w[1], w[1] - w[0]
    return a, b, fi, fo


def build(ep):
    D = load(ep); M = D['meta']; T = float(M.get('total') or 0)
    if M.get('amb') is False: print('ambience: switched off'); return
    have = set(slugs()); mv = float(M.get('ambVol', 100)) / 100; segs = []
    for c in M.get('ambClips') or []:
        try: a, b, g = float(c['t0']), float(c['t1']), float(c.get('vol', 100)) / 100 * mv
        except Exception: continue
        if c.get('src') in have and b > a and g > 0: segs.append({'slug': c['src'], 't0': a, 't1': b, 'g': g, 'raw': (a, b)})
    if not segs: print('ambience: no clips, no ambience.wav'); return
    if not T: T = max(s['t1'] for s in segs)
    tmp = tempfile.mkdtemp(); ins = []; fc = ''
    for k, s in enumerate(segs):
        a, b, fi, fo = eff(M, D['scenes'], s['t0'], s['t1'], T); a = max(0.0, a); b = min(T, b); out = os.path.join(tmp, f'b{k}.wav')
        if b - a < .3: continue
        bed(s['slug'], b - a, s['g'], min(fi, (b - a) / 2), min(fo, (b - a) / 2), out); ins.append((out, a))   # the same fades as the in-app preview
    for k, (f, a) in enumerate(ins): fc += f'[{k}:a]adelay={int(a * 1000)}|{int(a * 1000)}[d{k}];'
    mix = ''.join(f'[d{k}]' for k in range(len(ins)))
    fc += f'{mix}amix=inputs={len(ins)}:normalize=0:duration=longest,apad=whole_dur={T:.3f},atrim=0:{T:.3f}[o]'
    cmd = ['ffmpeg', '-loglevel', 'error', '-y']
    for f, a in ins: cmd += ['-i', f]
    subprocess.check_call(cmd + ['-filter_complex', fc, '-map', '[o]', '-ac', '2', '-ar', str(SR), f'episodes/{ep}/ambience.wav'])
    print('ambience: built', len(ins), 'clips ->', f'episodes/{ep}/ambience.wav', '|', ', '.join(f"{s['slug']} {s['t0']:.0f}-{s['t1']:.0f}s" for s in segs))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('assign', 'build'): sys.exit(__doc__)
    {'assign': assign, 'build': build}[sys.argv[1]](sys.argv[2])
