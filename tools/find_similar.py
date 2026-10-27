"""For every item an episode needs, find library images of the same general kind (e.g. every kind of aircraft for 'airplane').
Writes episodes/<ep>/similar.json = {need_id: [library_id, ...]}. Usage: find_similar.py [episode ...]  (default: the 3 most recently analysed episodes)"""
import glob, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import groqlib
def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d
def newest(n=3):
    fs = glob.glob('episodes/*/needs.json'); ts = {}
    for f in fs:
        try: ts[f] = int(subprocess.check_output(['git', 'log', '-1', '--format=%ct', '--', f], text=True).strip() or 0)
        except Exception: ts[f] = 0
    return [f.split('/')[1] for f in sorted(fs, key=lambda f: -ts[f])[:n]]
def run(ep, lib):
    d = f'episodes/{ep}'; needs = (load(f'{d}/needs.json', {}) or {}).get('items') or []
    if not needs or not lib: return
    libtxt = '\n'.join(f"{i}|{v.get('fa','')}|{v.get('en','')}" for i, v in sorted(lib.items()))
    out = {}
    for b in range(0, len(needs), 12):
        part = needs[b:b + 12]
        user = 'تصاویر کتابخانه (شناسه|فارسی|انگلیسی):\n' + libtxt + '\n\nنیازها:\n' + '\n'.join(f"{n['id']}|{n.get('fa','')}|{n.get('en','')}" for n in part)
        try:
            a = groqlib.chat('برای هر «نیاز»، همه‌ی تصویرهای کتابخانه را پیدا کن که از همان دسته‌ی کلی یا نوع شیء هستند (مثلاً برای «هواپیما»: هواپیمای مسافربری، جنگی، باری، قدیمی؛ برای «برگر»: همبرگر، چیزبرگر). '
                             'خود شناسه‌ی نیاز را در خروجی نیاور. اگر چیز مشابهی نیست آرایه‌ی خالی بده. فقط شناسه‌هایی بده که در فهرست کتابخانه هستند. '
                             'خروجی فقط JSON: {"similar":[{"need":"id","ids":["id1","id2"]}]}', user, max_tokens=3000, json_mode=True, temperature=.1)
        except (Exception, SystemExit) as e:
            print('similar: skipped batch:', e); continue
        for o in groqlib.objects(a, 'need'):
            ids = [i for i in (o.get('ids') or []) if i in lib and i != o['need']]
            if ids: out[o['need']] = ids[:12]
    json.dump(out, open(f'{d}/similar.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(ep, 'similar for', len(out), 'of', len(needs), 'needs')
def main():
    cat = load('library/catalog.json', {'items': {}})['items']; lib = {i: v for i, v in cat.items() if v.get('variants')}
    for ep in (sys.argv[1:] or newest()): run(ep, lib)
main()
