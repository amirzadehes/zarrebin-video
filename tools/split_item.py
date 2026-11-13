"""Apply split requests written by the app: splits/*.json = {"file": "alarm-clock__3.webp", "fa": "ساعت دیواری"}.
One picture leaves its library item and becomes a brand-new item with the given Persian name (English name is translated with Groq).
The image file keeps its name, so every episode that already uses it (scenes.json, pins, backgrounds) keeps working.
An item can never be left without pictures: a request that would empty the old item is ignored. Idempotent: a file that already
sits alone in an item with that Persian name is skipped."""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, 'library', 'catalog.json')
NAME = re.compile(r'^[a-z0-9-]+__\d+\.webp$')
def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d
def translate(fa):
    try:
        import groqlib
        a = groqlib.chat('You translate Persian names of objects into a short, concrete English noun phrase for an image-generation prompt. '
                         'The object is a single physical thing; keep the exact meaning and level of detail of the Persian name. '
                         'Reply with the English phrase only, 1-6 words, lowercase, no quotes, no punctuation.',
                         f'Persian name: {fa}', max_tokens=60, temperature=0).strip().strip('."\'` ').lower().split('\n')[0].strip()
        if 0 < len(a) <= 80: return a
    except (Exception, SystemExit) as e: print('translate failed:', e)
    return fa
def main():
    reqs = sorted(glob.glob(os.path.join(ROOT, 'splits', '*.json')))
    if not reqs: print('no split requests'); return
    cat = load(CATALOG, {'items': {}}); items = cat.setdefault('items', {})
    wanted = load(os.path.join(ROOT, 'wanted.json'), []); pool = load(os.path.join(ROOT, 'generic-pool.json'), [])
    for rp in reqs:
        r = load(rp, {}); os.remove(rp)
        f, fa = r.get('file'), (r.get('fa') or '').strip()
        if not isinstance(f, str) or not NAME.match(f) or not fa: print('skipped (bad request):', repr(r)[:100]); continue
        old = next((it for it in items.values() if f in (it.get('variants') or [])), None)
        if not old: print('skipped (picture is in no item):', f); continue
        if len(old['variants']) < 2:
            print('skipped (item', old['id'], 'has only this picture):', f); continue
        en = translate(fa); base = re.sub(r'[^a-z0-9]+', '-', en.lower()).strip('-') or 'item'; iid = base; k = 2
        taken = set(items) | {w['id'] for w in wanted + pool}
        while iid in taken: iid = f'{base}-{k}'; k += 1
        old['variants'] = [x for x in old['variants'] if x != f]
        items[iid] = {'id': iid, 'en': en, 'fa': fa, 'tags': [], 'has_text_in_image': old.get('has_text_in_image', False), 'variants': [f]}
        print('split', f, ':', old['id'], '->', iid, '|', fa, '->', en)
    cat['items'] = dict(sorted(items.items()))
    json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
main()
