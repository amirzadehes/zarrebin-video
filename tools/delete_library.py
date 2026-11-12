"""Apply delete requests written by the app: deletes/*.json = {"files": ["alarm-clock__2.webp", ...]}.
Removes the image files from library/ and from library/catalog.json (an item left without pictures is dropped from the catalog;
its name stays in wanted.json / generic-pool.json, so it simply shows up as "missing" again). Idempotent: a file that is already gone is not an error.
Prints a warning for every episode whose scenes.json still points at a deleted picture."""
import glob, json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIB = os.path.join(ROOT, 'library'); CATALOG = os.path.join(LIB, 'catalog.json')
NAME = re.compile(r'^[a-z0-9-]+__\d+\.webp$')

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def main():
    reqs = sorted(glob.glob(os.path.join(ROOT, 'deletes', '*.json')))
    if not reqs: print('no delete requests'); return
    cat = load(CATALOG, {'items': {}}); items = cat.setdefault('items', {}); gone = set()
    for rp in reqs:
        r = load(rp, {}); os.remove(rp)
        for f in r.get('files') or []:
            if not isinstance(f, str) or not NAME.match(f): print('skipped (not a library file name):', repr(f)[:80]); continue
            p = os.path.join(LIB, f)
            if os.path.exists(p): os.remove(p)
            gone.add(f)
    for iid in list(items):
        v = items[iid].get('variants') or []
        keep = [x for x in v if x not in gone]
        if len(keep) != len(v): items[iid]['variants'] = keep; print('item', iid, ':', len(v), '->', len(keep), 'pictures')
        if not keep and len(v):
            del items[iid]; print('item', iid, 'has no pictures left: removed from the catalog')
    cat['items'] = dict(sorted(items.items()))
    json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    for sp in glob.glob(os.path.join(ROOT, 'episodes', '*', 'scenes.json')):
        try: txt = open(sp, encoding='utf8').read()
        except OSError: continue
        hit = sorted(f for f in gone if 'library/' + f in txt)
        if hit: print('WARNING:', os.path.relpath(sp, ROOT), 'still uses deleted pictures:', ', '.join(hit))
    print('deleted', len(gone), 'file(s)')

if __name__ == '__main__': main()
