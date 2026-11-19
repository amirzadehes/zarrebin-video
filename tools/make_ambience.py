"""Ambience beds (wind, crowd, fire, ...) laid under the voice.
usage: python tools/make_ambience.py assign <episode>   the director picks one bed per scene (only where the scene has no 'amb' yet) -> scenes.json
       python tools/make_ambience.py build  <episode>   mixes the beds -> episodes/<ep>/ambience.wav (stereo 44.1k, length = video length)

scenes.json fields (all optional, the app edits them):
  scene.amb      slug of a file in ambience/ ('none' = silence for this scene; missing = not chosen yet)
  scene.ambVol   percent for this scene (default 100)
  meta.ambVol    percent for the whole episode (default 100); meta.amb === false switches the layer off
Neighbouring scenes with the same bed share ONE continuous clip; a change of bed cross-fades. Beds are normalised quiet (a bed under a voice)."""
import glob, json, math, os, subprocess, sys, tempfile

SR = 44100
XF = 1.2        # cross-fade between two beds / fade at the ends (seconds)
LOOP_XF = 1.5   # cross-fade inside a bed that has to be repeated
LUFS = -31      # a bed sits well below the voice


def slugs(): return sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob('ambience/*.mp3'))


def load(ep): return json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8'))


def assign(ep):
    S = slugs()
    if not S: print('ambience: no beds in ambience/ yet (run the workflow "Fetch ambience beds")'); return
    D = load(ep)
    if D['meta'].get('amb') is False: print('ambience: switched off'); return
    todo = [i for i, sc in enumerate(D['scenes']) if 'amb' not in sc]
    if not todo: print('ambience: every scene already has a choice'); return
    sys.path.insert(0, os.path.dirname(__file__)); import groqlib
    def desc(i):
        sc = D['scenes'][i]; ph = sc.get('photo') or {}
        return '%d | %s | %s' % (i, (sc.get('text') or '')[:60], str(ph.get('prompt') or '')[:230])
    system = ('You are the sound designer of a narrated documentary-style video. For each scene choose ONE quiet ambience bed that matches the place and weather of the scene, from the list. '
              'Rules: use few distinct beds and keep the SAME bed for consecutive scenes of the same place (continuity matters more than variety); '
              'choose "none" when nothing fits or the scene is abstract/graphic; never invent names. Answer JSON only: {"scenes":[{"i":0,"amb":"slug"}]}.\nBeds: ' + ', '.join(S))
    try:
        raw = groqlib.chat(system, 'Scenes (index | on-screen text | picture description):\n' + '\n'.join(desc(i) for i in todo), max_tokens=1500, json_mode=True, temperature=.2)
        got = {}
        for o in groqlib.objects(raw, 'i'):
            try: got[int(o['i'])] = str(o.get('amb') or 'none').strip().lower()
            except Exception: pass
    except (Exception, SystemExit) as e:
        print('ambience: director failed, scenes stay without a bed:', str(e)[:140]); return
    n = 0
    for i in todo:
        v = got.get(i, 'none'); D['scenes'][i]['amb'] = v if v in S else 'none'; n += v in S
    json.dump(D, open(f'episodes/{ep}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('ambience: assigned', n, 'of', len(todo), 'scenes')


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
    chain += f';[x]atrim=0:{d:.3f},asetpts=PTS-STARTPTS,loudnorm=I={LUFS}:TP=-6:LRA=11,volume={gain:.3f},afade=t=in:d={fi:.2f},afade=t=out:st={max(d - fo, 0):.3f}:d={fo:.2f},aresample={SR}[o]'
    subprocess.check_call(cmd + ['-filter_complex', chain, '-map', '[o]', '-ac', '2', out])


def build(ep):
    D = load(ep); M = D['meta']; T = float(M.get('total') or 0)
    if M.get('amb') is False: print('ambience: switched off'); return
    have = set(slugs()); segs = []
    for sc in D['scenes']:
        a = sc.get('amb')
        if not a or a == 'none' or a not in have: segs.append(None); continue
        g = float(sc.get('ambVol', 100)) / 100 * float(M.get('ambVol', 100)) / 100
        if segs and segs[-1] and segs[-1]['slug'] == a: segs[-1]['t1'] = float(sc['t1']); segs[-1]['g'] = (segs[-1]['g'] + g) / 2
        else: segs.append({'slug': a, 't0': float(sc['t0']), 't1': float(sc['t1']), 'g': g})
    segs = [s for s in segs if s and s['g'] > 0]
    if not segs: print('ambience: nothing chosen, no ambience.wav'); return
    if not T: T = max(s['t1'] for s in segs)
    tmp = tempfile.mkdtemp(); ins = []; fc = ''
    for k, s in enumerate(segs):
        a = max(0.0, s['t0'] - XF / 2); b = min(T, s['t1'] + XF / 2); out = os.path.join(tmp, f'b{k}.wav')
        bed(s['slug'], b - a, s['g'], XF if a > 0 else .6, XF if b < T else 2.5, out); ins.append(out)
        fc += f'[{k}:a]adelay={int(a * 1000)}|{int(a * 1000)}[d{k}];'
    mix = ''.join(f'[d{k}]' for k in range(len(segs)))
    fc += f'{mix}amix=inputs={len(segs)}:normalize=0:duration=longest,apad=whole_dur={T:.3f},atrim=0:{T:.3f}[o]'
    cmd = ['ffmpeg', '-loglevel', 'error', '-y']
    for f in ins: cmd += ['-i', f]
    subprocess.check_call(cmd + ['-filter_complex', fc, '-map', '[o]', '-ac', '2', '-ar', str(SR), f'episodes/{ep}/ambience.wav'])
    print('ambience: built', len(segs), 'continuous beds ->', f'episodes/{ep}/ambience.wav', '|', ', '.join(f"{s['slug']} {s['t0']:.0f}-{s['t1']:.0f}s" for s in segs))


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('assign', 'build'): sys.exit(__doc__)
    {'assign': assign, 'build': build}[sys.argv[1]](sys.argv[2])
