"""Rewrite the picture prompts of poster scenes whose prompt is empty or repeats another scene's, from each scene's own narration.
usage: python tools/fix_prompts.py            (handles every fixprompts/<episode>.json: {"idx": [scene numbers]} or {} = all empty/repeated ones)
Only photo.prompt of those scenes changes (nothing else in scenes.json); the trigger file is removed afterwards, so the tool is idempotent."""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import direct_poster as dp


def run(ep, idx=None):
    f = f'episodes/{ep}/scenes.json'
    if not os.path.exists(f): print('no scenes.json for', ep); return False
    D = json.load(open(f, encoding='utf8')); sc = D.get('scenes') or []; W = D.get('words') or []
    texts = [' '.join(w['w'] for w in W if s['t0'] - .01 <= w['t0'] < s['t1']) for s in sc]
    prompts = [(s.get('photo') or {}).get('prompt', '') for s in sc]
    bad = [i for i in (idx if idx else dp.bad_prompts(prompts)) if 0 <= i < len(sc) and texts[i].strip()]
    if not bad: print(ep, ': nothing to fix'); return False
    U = [{'text': t} for t in texts]; brief = dp.bible(U); c = dp.make_cast(U)
    brief = (brief + ('\nCAST (fixed look of recurring characters; copy this description inside every prompt where the character appears):\n' + c if c else '')).strip()
    keep = [p for i, p in enumerate(prompts) if i not in bad]
    got = dp.fix_prompts({i: texts[i] for i in bad}, keep, brief)
    n = 0
    for i, p in got.items():
        sc[i].setdefault('photo', {})['prompt'] = dp.selfcontain(p, texts[i]); n += 1
    json.dump(D, open(f, 'w', encoding='utf8'), ensure_ascii=False)
    print(ep, ': rewrote %d of %d flagged prompts' % (n, len(bad)))
    return n > 0


def main():
    for t in sorted(glob.glob('fixprompts/*.json')):
        ep = os.path.splitext(os.path.basename(t))[0]
        try: q = json.load(open(t, encoding='utf8'))
        except Exception: q = {}
        run(ep, [i for i in (q.get('idx') or []) if isinstance(i, int)] or None); os.remove(t)


if __name__ == '__main__': main()
