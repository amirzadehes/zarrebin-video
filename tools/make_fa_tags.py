"""Give every library image a Persian name (if missing) and Persian search tags (synonyms) so the owner can find it in the app by typing Persian.
Stored in library/catalog.json: item['fa'] and item['fa_tags']. Only items that lack them (or whose fa changed) are sent to Groq."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import groqlib
P = 'library/catalog.json'
def main():
    cat = json.load(open(P, encoding='utf8')); items = cat['items']
    todo = [i for i, v in items.items() if v.get('variants') and (not v.get('fa') or not v.get('fa_tags') or v.get('fa_tags_for') != v.get('fa'))]
    print('items needing Persian tags:', len(todo)); n = 0
    for b in range(0, len(todo), 20):
        part = todo[b:b + 20]
        user = '\n'.join(f"{i}|{items[i].get('en','')}|{items[i].get('fa','')}|{', '.join(items[i].get('tags') or [])}" for i in part)
        try:
            a = groqlib.chat('برای هر تصویر کتابخانه (شناسه|نام انگلیسی|نام فارسی فعلی|تگ‌های انگلیسی) یک نام فارسیِ کوتاه و طبیعی (اگر نام فارسی فعلی خالی است) و ۵ تا ۸ تگ فارسی برای جست‌وجو بده: مترادف‌ها، نام‌های دیگر و دسته‌ی کلی '
                             '(مثلاً برای هواپیمای مسافربری: هواپیما، پرواز، جت، مسافربری، فرودگاه، آسمان). فقط کلمه‌ی فارسی. اگر نام فارسی فعلی هست همان را در fa برگردان. '
                             'خروجی فقط JSON: {"items":[{"id":"...","fa":"...","fa_tags":["..."]}]}', user, max_tokens=4000, json_mode=True, temperature=.2)
        except (Exception, SystemExit) as e:
            print('batch skipped:', e); continue
        for o in groqlib.objects(a, 'id'):
            it = items.get(o.get('id'))
            if not it: continue
            if not it.get('fa') and o.get('fa'): it['fa'] = o['fa'].strip()
            tg = [t.strip() for t in (o.get('fa_tags') or []) if isinstance(t, str) and t.strip()][:10]
            if tg: it['fa_tags'] = tg; it['fa_tags_for'] = it.get('fa'); n += 1
    json.dump(cat, open(P, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('tagged', n)
main()
