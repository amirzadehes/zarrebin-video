"""Apply rename requests written by the app: renames/*.json = {"id": "...", "fa": "نام جدید فارسی"}.
The English name (used in image prompts and by the scene director) is translated from the Persian one with Groq.
Ids and image files never change; only the names in catalog / wanted / generic pool / every episode's needs.json."""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import groqlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d
def save(p, o): json.dump(o, open(p, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
def translate(fa, old_en):
    try:
        a = groqlib.chat('You translate Persian names of objects into a short, concrete English noun phrase for an image-generation prompt. '
                         'The object is a single physical thing; keep the exact meaning and level of detail of the Persian name (e.g. "جایگاه پمپ بنزین" -> "petrol station forecourt with fuel pumps", not just "pump"). '
                         'Reply with the English phrase only, 1-6 words, lowercase, no quotes, no punctuation.',
                         f'Persian name: {fa}\n(previous English name, may be wrong or less precise: {old_en})', max_tokens=60, temperature=0).strip().strip('."\'` ').lower()
        a = a.split('\n')[0].strip()
        if 0 < len(a) <= 80: return a
    except (Exception, SystemExit) as e: print('translate failed:', e)
    return old_en or fa
def main():
    reqs = sorted(glob.glob(os.path.join(ROOT, 'renames', '*.json')))
    if not reqs: print('no rename requests'); return
    cat = load(os.path.join(ROOT, 'library', 'catalog.json'), {'items': {}}); wanted = load(os.path.join(ROOT, 'wanted.json'), []); pool = load(os.path.join(ROOT, 'generic-pool.json'), [])
    needs = {p: load(p, None) for p in glob.glob(os.path.join(ROOT, 'episodes', '*', 'needs.json'))}
    for rp in reqs:
        r = load(rp, {}); iid, fa = r.get('id'), (r.get('fa') or '').strip()
        os.remove(rp)
        if r.get('new') and fa:   # a brand-new item: Persian name typed in the app -> English name + id
            import re
            en = translate(fa, ''); base = re.sub(r'[^a-z0-9]+', '-', en.lower()).strip('-') or 'item'; iid = base; k = 2
            taken = set(cat['items']) | {w['id'] for w in wanted + pool}
            while iid in taken: iid = f'{base}-{k}'; k += 1
            wanted.append({'id': iid, 'en': en, 'fa': fa, 'tags': ['mine']}); print('new item', iid, '|', fa, '->', en)
            ep = r.get('episode')
            if ep and os.path.exists(os.path.join(ROOT, 'episodes', ep, 'needs.json')):
                p2 = os.path.join(ROOT, 'episodes', ep, 'needs.json'); j = needs.get(p2) or load(p2, None)
                if isinstance(j, dict) and isinstance(j.get('items'), list): j['items'].append({'id': iid, 'en': en, 'fa': fa, 'why': 'افزوده‌ی دستی'}); needs[p2] = j
            continue
        if not iid or not fa: continue
        old = (cat['items'].get(iid) or next((w for w in wanted + pool if w['id'] == iid), {})).get('en', '')
        en = r.get('en') or translate(fa, old); print(iid, '|', fa, '->', en)
        hit = False
        if iid in cat['items']: cat['items'][iid].update(fa=fa, en=en); hit = True
        for lst in (wanted, pool):
            for w in lst:
                if w['id'] == iid: w.update(fa=fa, en=en); hit = True
        for j in needs.values():
            for w in (j or {}).get('items', []) if isinstance(j, dict) else []:
                if w.get('id') == iid: w.update(fa=fa, en=en); hit = True
        if not hit: wanted.append({'id': iid, 'en': en, 'fa': fa, 'tags': []})   # a custom item that only lived in the owner's browser
        elif not any(w['id'] == iid for w in wanted + pool) and iid not in cat['items']: wanted.append({'id': iid, 'en': en, 'fa': fa, 'tags': []})
    save(os.path.join(ROOT, 'library', 'catalog.json'), cat); save(os.path.join(ROOT, 'wanted.json'), wanted); save(os.path.join(ROOT, 'generic-pool.json'), pool)
    for p, j in needs.items():
        if j is not None: save(p, j)
main()
