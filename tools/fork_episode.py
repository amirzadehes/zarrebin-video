"""Fork an episode: the Instagram version of a finished (YouTube) episode starts as its own folder that already holds the same pictures.

episodes/<new>/fork.json = {"from": "<source episode>"} (written by the app). This copies the source's picture folders (bg, depth, cards, cast) and cast.json
into the new folder, so a scene copied from the source episode finds its pictures under the NEW episode's path (removing a picture in one episode can never delete the other episode's file).
Idempotent: a file that already exists in the new folder is never overwritten. Nothing else is copied (voice, timing, scenes, request stay the new episode's own).
usage: python tools/fork_episode.py <new_episode>; the result line goes to episodes/<new>/fork.log (the app reads it)."""
import json, os, re, shutil, sys, time

SAFE = re.compile(r'^[a-z0-9][a-z0-9-]*$')
DIRS = ['bg', 'depth', 'cards', 'cast']


def main(new):
    d = f'episodes/{new}'
    log = f'{d}/fork.log'
    try:
        if not SAFE.match(new):
            raise ValueError(f'bad episode name: {new}')
        req = json.load(open(f'{d}/fork.json', encoding='utf-8'))
        src = str(req.get('from', ''))
        if not SAFE.match(src) or src == new:
            raise ValueError(f'bad source episode: {src!r}')
        s = f'episodes/{src}'
        if not os.path.isdir(s):
            raise ValueError(f'source episode not found: {src}')
        n = 0
        for sub in DIRS:
            for root, _, files in os.walk(f'{s}/{sub}'):
                rel = os.path.relpath(root, s)
                os.makedirs(f'{d}/{rel}', exist_ok=True)
                for f in files:
                    t = f'{d}/{rel}/{f}'
                    if not os.path.exists(t):
                        shutil.copy2(f'{root}/{f}', t)
                        n += 1
        if os.path.exists(f'{s}/cast.json') and not os.path.exists(f'{d}/cast.json'):
            shutil.copy2(f'{s}/cast.json', f'{d}/cast.json')
            n += 1
        msg = f'OK copied {n} files from {src}'
    except Exception as e:  # the app shows this text
        msg = f'FAILED {e}'
    with open(log, 'w', encoding='utf-8') as f:
        f.write(msg + f'\nts={int(time.time())}\n')
    print(msg)
    return 0 if msg.startswith('OK') else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
