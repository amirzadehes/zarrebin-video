"""Step 3: timing.json + library -> scenes.json (Groq 'scene director' + deterministic compiler).
usage: python tools/direct_scenes.py <episode>"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import groqlib

TPLS = ['hero', 'duo', 'trio', 'statement', 'stat']
ENTS = ['pop', 'left', 'drop', 'spin', 'right', 'rise', 'zoom']

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def norm(s):
    s = s.replace('ي', 'ی').replace('ك', 'ک').replace('‌', '').replace('‏', '')
    return re.sub(r'[^\w]', '', s.lower())

FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
def fadig(x): return x.translate(FA)

def library():
    cat = load('library/catalog.json', {'items': {}})['items']
    return {i: v for i, v in cat.items() if v.get('variants')}

PICK_NOTE = []
SYSTEM = """تو کارگردان هنری یک ویدیوی توضیحی انیمیشنی به سبک کمیک آمریکایی هستی. روایت به جمله‌ها تقسیم شده است (شماره، زمان، متن).
جمله‌های پشت‌سرهم را در «صحنه» گروه‌بندی کن. هر صحنه ۳ تا ۸ ثانیه (معمولاً ۱ تا ۳ جمله) و کل جمله‌ها را بدون فاصله و همپوشانی پوشش بده.
برای هر صحنه یک قالب انتخاب کن:
- hero: یک شیء بزرگ در مرکز (+ حداکثر ۲ شیء کوچک دور آن) و یک برچسب کوتاه
- duo: دو شیء روبه‌رو برای مقایسه یا رابطه (link: vs یا plus یا arrow)
- trio: ۳ یا ۴ شیء پشت‌سرهم برای فهرست‌کردن
- statement: فقط یک جمله‌ی کلیدی بزرگ (متن) با حداکثر ۲ شیء در گوشه‌ها
- stat: یک عدد بزرگ (فقط وقتی عدد واقعی در متن هست) با شرح کوتاه
قواعد: قالب دو صحنه‌ی پشت‌سرهم یکی نباشد. مجموع زمان هر صحنه حداکثر ۸ ثانیه باشد (اگر جمله‌ها بلندند صحنه را کوتاه‌تر ببر). شیء فقط وقتی انتخاب شود که استعاره‌ی تصویری مستقیم و آشکار برای همان لحظه باشد؛ متن صحنه باید ایده‌ی واقعی و مشخصی از همان لحظه باشد، نه جمله‌ی پرکننده مثل «مهم است به یاد داشته باشید». اگر مطمئن نیستی شیء نگذار یا فقط یکی بگذار و ترجیح بده قالب statement باشد. link=vs فقط برای مقایسه‌ی واقعی دو چیز؛ برای افزودن plus و برای نتیجه/جهت arrow. اشیا فقط از فهرست شناسه‌های موجود انتخاب شوند (هیچ شناسه‌ای نسازی). هر شیء باید به معنای همان لحظه‌ی روایت ربط داشته باشد؛
اگر شیء مناسب نبود، قالب statement یا hero با شیء کمتر بگذار. برای هر شیء، در فیلد at یک کلمه (دقیقاً همان‌طور که در جمله آمده) بنویس که با گفتنش شیء وارد می‌شود.
text یک عبارت بسیار کوتاه فارسی (حداکثر ۶ کلمه برای برچسب، حداکثر ۱۰ کلمه برای statement) است و کلمه‌ی مهم را بین دو ستاره بگذار، مثل: *انرژی* مغز.
kw فهرست حداکثر ۳ کلمه‌ی مهم همان صحنه برای هایلایت زیرنویس است (دقیقاً از متن جمله‌ها). decor حداکثر ۲ شناسه برای تزئین پس‌زمینه است (اختیاری، مرتبط با موضوع).
استفاده از تصویرها: ویدیو هرچه تصویرهای بیشتری داشته باشد جذاب‌تر است. تقریباً هر صحنه‌ی غیر از statement باید ۲ تا ۵ شیء مرتبط داشته باشد (hero: یک شیء بزرگ + تا ۳ شیء کوچک؛ trio: ۳ تا ۵ شیء؛ duo دقیقاً ۲ شیء).
هر شیءِ فهرست را باید دست‌کم یک‌بار در کل ویدیو در صحنه‌ای که واقعاً به آن مربوط است بیاوری. شیء نامرتبط را هرگز فقط برای پرکردن نگذار.
اشیای «اولویت‌دار» مال همین قسمت هستند و باید حتماً استفاده شوند؛ اشیای «سایر» فقط اگر دقیقاً مرتبط بودند.
خروجی فقط JSON: {"scenes":[{"from":0,"to":1,"tpl":"hero","items":[{"id":"...","at":"..."}],"text":"...","number":"","link":"vs","decor":[],"kw":[]}]}"""

def direct(ep, T, lib, prio=None):
    S = T['sentences']; scenes = []; prev = ''
    prio = prio or set()
    ids = 'اولویت‌دار: ' + ', '.join(f"{i}={v.get('fa','')}" for i, v in sorted(lib.items()) if i in prio) + '\nسایر: ' + ', '.join(f"{i}={v.get('fa','')}" for i, v in sorted(lib.items()) if i not in prio)
    B = 12
    for b in range(0, len(S), B):
        chunk = S[b:b + B]
        user = 'قالب آخرین صحنه‌ی قبلی: %s\n\nفهرست اشیای موجود (شناسه: نام):\n%s\n%s\nجمله‌ها:\n%s' % (
            prev or '-', ids, ('انتخاب صاحب ویدیو (هرجا متن به نیاز اول اشاره می‌کند از همین تصویرها استفاده کن):\n' + '\n'.join(PICK_NOTE) + '\n') if PICK_NOTE else '', '\n'.join(f"{s['i']} | {s['t0']:.1f}-{s['t1']:.1f}s | {s['text']}" for s in chunk))
        raw = groqlib.chat(SYSTEM, user, max_tokens=3500, json_mode=True, temperature=.4)
        got = [o for o in groqlib.objects(raw, 'from') if isinstance(o.get('from'), int)]
        got = [o for o in got if b <= o['from'] < b + B] or [{'from': b, 'to': min(b + B, len(S)) - 1, 'tpl': 'statement'}]
        scenes += got; prev = got[-1].get('tpl', '')
    return scenes

def cover_missing(T, raw, lib, prio):
    """every priority image of this episode that the director did not use gets placed in the scene whose sentence fits it best"""
    used = {it.get('id') for r in raw for it in (r.get('items') or []) if isinstance(it, dict)}
    miss = sorted(i for i in prio if i in lib and i not in used)
    if not miss: return raw
    S = T['sentences']
    try:
        user = 'تصویرهای استفاده‌نشده:\n' + '\n'.join(f"{i}={lib[i].get('fa','')} ({lib[i].get('en','')})" for i in miss) + '\n\nجمله‌ها:\n' + '\n'.join(f"{s['i']}|{s['text'][:90]}" for s in S)
        a = groqlib.chat('برای هر تصویر استفاده‌نشده بهترین جمله‌ی مرتبط را از فهرست جمله‌ها انتخاب کن. اگر هیچ جمله‌ای واقعاً مرتبط نیست آن تصویر را حذف کن. خروجی فقط JSON: {"place":[{"id":"...","sentence":0}]}',
                         user, max_tokens=2500, json_mode=True, temperature=.2)
        place = [o for o in groqlib.objects(a, 'sentence') if o.get('id') in lib and isinstance(o.get('sentence'), int)]
    except (Exception, SystemExit) as e:
        print('coverage pass skipped:', e); return raw
    add = 0
    for o in place:
        for r in raw:
            if isinstance(r.get('from'), int) and r['from'] <= o['sentence'] <= r.get('to', r['from']):
                its = r.setdefault('items', [])
                if len(its) < 5 and not any(isinstance(x, dict) and x.get('id') == o['id'] for x in its):
                    its.append({'id': o['id'], 'sent': o['sentence']}); add += 1
                    if r.get('tpl') in ('statement', 'stat'): r['_up'] = True
                break
    print('coverage pass: placed', add, 'of', len(miss), 'unused priority images')
    return raw

def compile_scenes(ep, T, raw, lib, req):
    S, Wd = T['sentences'], T['words']; n = len(S); total = round(T['voice_seconds'] + 1.2, 2)
    # 1) make contiguous coverage
    raw = sorted([r for r in raw if isinstance(r.get('from'), int) and 0 <= r['from'] < n], key=lambda r: r['from'])
    cov, cur = [], 0
    for r in raw:
        if r['from'] < cur: continue
        if r['from'] > cur and cov: cov[-1]['to'] = r['from'] - 1
        elif r['from'] > cur: r['from'] = 0
        r['to'] = max(r['from'], min(int(r.get('to', r['from'])), n - 1)); cov.append(r); cur = r['to'] + 1
    if not cov: cov = [{'from': 0, 'to': n - 1, 'tpl': 'statement'}]
    cov[-1]['to'] = n - 1; cov[0]['from'] = 0
    # split overlong scenes (> 9.5 s) at sentence boundaries
    out = []
    for r in cov:
        a, bnd = r['from'], r['to']
        while bnd > a and S[bnd]['t1'] - S[a]['t0'] > 9.5:
            m = a
            while m < bnd and S[m]['t1'] - S[a]['t0'] < 6: m += 1
            if m >= bnd: break
            out.append({**r, 'from': a, 'to': m, 'items': r.get('items', [])[:2], 'tpl': r.get('tpl') if len(out) % 2 == 0 else 'statement'}); a = m + 1
        out.append({**r, 'from': a})
    cov = out
    uses = {}; scenes = []; kwall = set(); THEME = [0, 3, 6, 1, 4, 7, 2, 5]
    for k, r in enumerate(cov):
        t0 = 0.0 if k == 0 else S[r['from']]['t0']; t1 = total if k == len(cov) - 1 else S[cov[k + 1]['from']]['t0']
        r['t0'], r['t1'] = t0, t1
    for k, r in enumerate(cov):
        t0, t1 = r['t0'], r['t1']; tpl = r.get('tpl') if r.get('tpl') in TPLS else 'statement'
        words = [w for w in Wd if r['from'] <= w['s'] <= r['to']]; its = []; last_t = t0
        for j, it in enumerate(r.get('items') or []):
            iid = it.get('id') if isinstance(it, dict) else None
            if iid not in lib or any(x['id'] == iid for x in its): continue
            at = norm(it.get('at', '')); tt = None
            if isinstance(it.get('sent'), int) and 0 <= it['sent'] < n: tt = S[it['sent']]['t0'] + .3
            if at:
                for w in words:
                    if w['t0'] >= last_t - .05 and (at in norm(w['w']) or (len(norm(w['w'])) > 2 and norm(w['w']) in at)): tt = w['t0']; break
            its.append({'id': iid, 't': tt}); 
            if tt is not None: last_t = tt
        # fallback times: spread evenly
        for j, it in enumerate(its):
            if it['t'] is None: it['t'] = round(t0 + .45 + j * max(t1 - t0 - 1.3, .6) / max(len(its), 1), 3)
            it['t'] = round(min(max(it['t'], t0 + .25), max(t1 - .5, t0 + .3)), 3)
        its.sort(key=lambda x: x['t'])
        if its: its[0]['t'] = round(max(t0 + .15, min(its[0]['t'], t0 + .8)), 3)   # first object never leaves the scene empty
        for j in range(1, len(its)): its[j]['t'] = round(max(its[j]['t'], its[j - 1]['t'] + .35), 3)
        for j, it in enumerate(its):
            v = lib[it['id']]['variants']; it['src'] = 'library/' + v[uses.get(it['id'], 0) % len(v)]; uses[it['id']] = uses.get(it['id'], 0) + 1
            it['en'] = ('pop' if j == 0 and tpl == 'hero' else ENTS[(k * 2 + j) % len(ENTS)])
        if r.get('_up') and tpl in ('statement',) and its: tpl = 'hero' if len(its) < 3 else 'trio'
        if tpl == 'duo' and len(its) > 2: tpl = 'trio'
        if tpl == 'hero' and len(its) > 4: tpl = 'trio'
        text = (r.get('text') or '').strip(); number = (r.get('number') or '').strip()
        if tpl == 'stat' and not number: tpl = 'statement'
        if tpl in ('duo',) and len(its) < 2: tpl = 'hero' if its else 'statement'
        if tpl == 'trio' and len(its) < 2: tpl = 'hero' if its else 'statement'
        if tpl == 'hero' and not its: tpl = 'statement'
        if tpl == 'statement' and not text:
            ws = [w['w'] for w in words][:7]; text = ' '.join(ws)
        if tpl == 'statement' and len(text.split()) > 12: text = ' '.join(text.split()[:12])
        sc = {'t0': round(t0, 3), 't1': round(t1, 3), 'tpl': tpl, 'theme': THEME[k % 8], 'wipe': k % 3, 'items': its, 'text': text, 'link': r.get('link') if r.get('link') in ('vs', 'plus', 'arrow') else 'vs'}
        if number: sc['number'] = number
        dec = [lib[d]['variants'][0] for d in (r.get('decor') or []) if d in lib][:2]
        if dec: sc['decor'] = ['library/' + d for d in dec]
        for it in its: it.pop('id', None)
        for kwd in (r.get('kw') or []): kwall.add(norm(str(kwd)))
        scenes.append(sc)
    if T.get('lang', 'fa') == 'fa':
        for w in Wd: w['w'] = fadig(w['w'])
        for sc in scenes:
            sc['text'] = fadig(sc['text']); sc['number'] = fadig(sc['number']) if sc.get('number') else None
            if sc['number'] is None: sc.pop('number')
    for w in Wd: w['kw'] = bool(norm(w['w'])) and any(len(q) > 1 and q in norm(w['w']) for q in kwall)
    meta = {'total': total, 'rtl': T.get('lang', 'fa') == 'fa', 'topLabel': req.get('label') or ep.upper().replace('-', ' '), 'lang': T.get('lang', 'fa'), 'episode': ep, 'style': req.get('style', 'comic'), 'palette': req.get('palette', ''), 'subs': req.get('subs', True), 'base': req.get('base', '')}
    json.dump({'meta': meta, 'words': Wd, 'scenes': scenes}, open(f'episodes/{ep}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
    return meta, scenes

def emit_plan(meta, req):
    chunk = int(req.get('chunk', 20)); fmts = req.get('formats') or ['v', 'h']; import math
    n = math.ceil(meta['total'] / chunk); plan = [{'f': f, 'i': i, 'a': i * chunk, 'b': min((i + 1) * chunk, meta['total'])} for f in fmts for i in range(n)]
    gh = os.environ.get('GITHUB_OUTPUT')
    if gh: open(gh, 'a').write('matrix=' + json.dumps(plan) + '\ntotal=%s\n' % meta['total'])

def main(ep):
    d = f'episodes/{ep}'; T = load(f'{d}/timing.json', None); req = load(f'{d}/request.json', {})
    if req.get('use_plan') and os.path.exists(f'{d}/scenes.json'):   # the owner reviewed / edited scenes.json in the app: keep it as is
        meta = load(f'{d}/scenes.json', {}).get('meta') or {}
        for k in ('style', 'palette', 'base', 'subs'):
            if k in req: meta[k] = req[k]
        D = load(f'{d}/scenes.json', {}); D['meta'] = meta; json.dump(D, open(f'{d}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
        print('using the reviewed scenes.json:', len(D.get('scenes', [])), 'scenes'); emit_plan(meta, req); return
    if not T: sys.exit('timing.json missing; run narrate_tts.py first')
    lib = library()
    needs = load(f'{d}/needs.json', {}).get('items') or []; prio = {n['id'] for n in needs} & set(lib)
    picks = {k: [i for i in v if i in lib] for k, v in (load(f'{d}/picks.json', {}) or {}).items() if isinstance(v, list)}   # images the owner chose for a need (similar ones from the library)
    for v in picks.values(): prio |= set(v)
    PICK_NOTE.clear(); PICK_NOTE.extend(f"«{(next((n.get('fa') for n in needs if n['id'] == k), '') or k)}» ← {', '.join(v)}" for k, v in picks.items() if v)
    if req.get('only_needs'):
        lib = {i: v for i, v in lib.items() if i in prio}; print('using only this episode\'s objects:', len(lib))
    else: print('library images offered to the director:', len(lib), '| priority (this episode):', len(prio))
    raw = load(f'{d}/director.json', None) if req.get('keep_direction') else None
    if raw is None:
        raw = direct(ep, T, lib, prio); raw = cover_missing(T, raw, lib, prio)
        json.dump(raw, open(f'{d}/director.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    meta, scenes = compile_scenes(ep, T, raw, lib, req)
    print('scenes', len(scenes), 'total', meta['total'], 'templates', {t: sum(1 for s in scenes if s['tpl'] == t) for t in TPLS})
    emit_plan(meta, req)

if __name__ == '__main__': main(sys.argv[1])
