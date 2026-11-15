"""Poster mode director: timing.json -> scenes.json where every scene has ONE full-bleed picture (made by the owner from the prompt this tool writes)
plus text layers (small label, optional big number, headline with a *highlighted* word).
usage: python tools/direct_poster.py <episode>
Library pictures are NOT chosen here: the owner can still add them (and pinned cards, effects, sounds) per scene in the app's review panel.
A reviewed scenes.json (request.json use_plan) is kept as is by direct_scenes.main, exactly like the classic mode."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import groqlib
import direct_scenes as ds

SYSTEM = """تو کارگردان هنری یک ویدیوی توضیحی عمودی هستی. در این سبک هر صحنه فقط یک تصویر تمام‌صفحه دارد و روی آن چند خط نوشته می‌آید.
روایت به تکه‌های کوتاه تقسیم شده است (شماره، زمان، متن). تکه‌های پشت‌سرهم را در «صحنه» گروه‌بندی کن و همه‌ی تکه‌ها را بدون فاصله و همپوشانی پوشش بده؛ هر تکه در دقیقاً یک صحنه باشد.
مرز صحنه‌ها را خطِ موضوعی داستان تعیین می‌کند، نه زمان: هر صحنه یک لحظه یا یک ایده‌ی تصویری است. وقتی مکان، زمان، شخصیت، رویداد یا موضوع عوض شد صحنه‌ی تازه شروع کن؛ تا وقتی چند جمله درباره‌ی همان تصویر حرف می‌زنند، در همان صحنه بمانند. پس صحنه می‌تواند کوتاه (حدود ۲ ثانیه) یا بلند باشد، ولی هرگز بیش از @MAX@ ثانیه.
برای هر صحنه این‌ها را بنویس:
- elements: فهرست انگلیسیِ چیزهای عینی و دیدنیِ بومِ صحنه که در متن نام برده شده (آدم‌ها، گروه‌ها، مکان، فصل/ماه، کشور) — بدون اشیای کوچک جدا که در props می‌آیند. حتماً از همان متن بردار، نه از حدس خودت؛ مثلاً ["children carrying lanterns", "Roman soldier", "roast goose dinner", "Germany in November"].
- prompt: توضیح انگلیسیِ یک تصویر برای ابزار تصویرسازی (۲ تا ۴ جمله). یک صحنه‌ی واحد و روشن که همه‌ی elements را به‌صورت عینی و همان‌طور که در متن آمده نشان بدهد (اگر متن چند چیز را نام می‌برد، همه را در همان تصویر بیاور؛ یک آدم تنها با لباس ترکیبی نساز): چه کسی یا چه چیزی، کجا، چه کاری می‌کند، نور و حال‌وهوا و زاویه‌ی دوربین. موضوع اصلی را در میانه‌ی کادر بگذار.
  خودِ موضوع و رویداد را نقاشی کن، نه گوینده را: هرگز راوی، گوینده، مجری یا «narrator» در تصویر نگذار و هیچ شخصیت یا چیزی از خودت اختراع نکن که در متن یا خلاصه‌ی داستان نیست. اگر جمله مقدمه‌ی گوینده است (مثل «امروز می‌خوام ... رو تعریف کنم»)، تصویر خودِ ماجرا یا نمادِ اصلی آن باشد.
  دوره‌ی زمانی را از خود داستان بردار: اگر ماجرا تاریخی است لباس و وسیله‌ها همان دوره باشند؛ هرگز «modern» یا «today» ننویس مگر خودِ آن صحنه واقعاً امروزی باشد (دوره‌ی هر صحنه را از خلاصه‌ی داستان و متن همان صحنه بگیر). اگر یک شخصیت چند بار می‌آید، هر بار با همان مشخصات بنویس (سن، لباس، رنگ) تا تصویرها شبیه هم شوند.
  در تصویر هیچ نوشته، حرف، عدد یا لوگو نباشد.
- props: حداکثر ۲ شیء کوچک و مستقل که در متن همین صحنه نام برده شده و بهتر است جدا ساخته و روی عکس گذاشته شوند (غذا، ابزار، حیوان، شیء نمادین؛ نه آدم و نه مکان). اشیای props را در prompt صحنه نیاور. هر کدام: {"fa":"نام فارسی کوتاه و مشخص مثل غاز کبابی","word":"کلمه‌ای دقیقاً از متن همین صحنه که با گفتنش شیء ظاهر می‌شود","prompt":"توصیف انگلیسی کامل و پرجزئیات فقط همان شیء"}. توصیف prop باید غنی و جذاب باشد: جنس و رنگ‌ها، حالت و ترکیب‌بندی، چیزهای همراهش (مثلاً غاز کبابی طلایی و براق روی سینی چوبی روستایی با کلم قرمز، سیب پخته، نان و جعفری، با بخار ملایم)، نه فقط نام شیء. اگر شیء کوچکی نیست props را خالی بگذار.
- kicker: برچسب کوتاه انگلیسی با حروف بزرگ، حداکثر ۴ کلمه، مثل «ROME · 4TH CENTURY» یا «THE SHAH · 1970s». اگر چیز مشخصی ندارد خالی بگذار.
- text: تیتر کوتاه فارسی محاوره‌ای (حداکثر ۷ کلمه) و کلمه‌ی مهم را بین دو ستاره بگذار، مثل: برگه‌ی *بدون خریدار*. اگر صحنه نیازی به تیتر ندارد خالی بگذار. تیتر تکرار کلمه‌به‌کلمه‌ی جمله نباشد؛ خلاصه یا نکته‌ی اصلی باشد.
- number: فقط اگر سال یا عدد مهمی واقعاً در متن آمده (مثلاً ۱۹۷۲)، همان را بنویس؛ وگرنه خالی.
- kw: حداکثر ۳ کلمه‌ی مهم همان صحنه برای هایلایت زیرنویس (دقیقاً از متن جمله‌ها).
صحنه‌ی اول قلاب (hook) است: text آن یک سؤال یا جمله‌ی کنجکاوی‌برانگیز باشد.
خروجی فقط JSON: {"scenes":[{"from":0,"to":1,"elements":[],"props":[],"prompt":"...","kicker":"...","text":"...","number":"","kw":[]}]}"""


MAX_SCENE = 14.0   # hard cap only; the scene boundaries follow the story line (the director decides)
PUNCT = tuple('.!?؟،,;؛…')


def units(T, maxlen=6.5):
    """short pieces of narration (the director's unit): break at a sentence change or a punctuation mark once >= ~2 s, and always before maxlen seconds"""
    W = T['words']; out, cur = [], []
    for w in W:
        if cur and w['s'] != cur[-1]['s'] and cur[-1]['t1'] - cur[0]['t0'] >= 1.5: out.append(cur); cur = []
        cur.append(w); d = w['t1'] - cur[0]['t0']
        if d >= maxlen or (w['w'].rstrip('"»”)').endswith(PUNCT) and d >= 2.2): out.append(cur); cur = []
    if cur: out.append(cur)
    total = round(T['voice_seconds'] + 1.2, 2); U = []
    for i, c in enumerate(out): U.append({'i': i, 't0': 0.0 if i == 0 else c[0]['t0'], 'text': ' '.join(x['w'] for x in c)})
    for i, u in enumerate(U): u['t1'] = U[i + 1]['t0'] if i + 1 < len(U) else total
    return U


BIBLE = """متن یک ویدیوی توضیحی را می‌خوانی. برای تصویرسازها یک خلاصه‌ی انگلیسیِ کوتاه بنویس (حداکثر ۶ خط، متن ساده): موضوع اصلی، دوره‌ی زمانی و مکان (هر دوره‌ی مهم داستان)، شخصیت‌های اصلی با ظاهر ثابت (سن، لباس، رنگ‌ها) و حال‌وهوای تصویری. فقط از چیزهایی بگو که در متن هست."""


def bible(U):
    try: return groqlib.chat(BIBLE, ' '.join(u['text'] for u in U)[:7000], max_tokens=600, temperature=.2).strip()
    except (Exception, SystemExit) as e: print('story brief skipped:', str(e)[:120]); return ''


REPAIR = """یک صحنه‌ی بلند به چند قطعه‌ی پشت‌سرهم تقسیم شده است. برای هر قطعه یک تصویر جدا و متفاوت (لحظه یا زاویه‌ی دیگری از همان ماجرا) بنویس، مطابق چیزی که در متن همان قطعه گفته می‌شود. راوی را نشان نده و چیزی اختراع نکن.
هر قطعه: prompt (انگلیسی، ۲ تا ۳ جمله، بدون نوشته در تصویر)، kicker (برچسب کوتاه انگلیسی با حروف بزرگ یا خالی)، text (تیتر فارسی ≤ ۷ کلمه با *کلمه‌ی مهم* یا خالی)، number (فقط اگر عدد/سال واقعاً در متن هست)، kw (≤ ۳ کلمه از متن).
خروجی فقط JSON: {"parts":[{"prompt":"","kicker":"","text":"","number":"","kw":[]}]} به تعداد قطعه‌ها و به همان ترتیب."""


def cover(raw, n):
    raw = sorted([r for r in raw if isinstance(r.get('from'), int) and 0 <= r['from'] < n], key=lambda r: r['from']); cov, cur = [], 0
    for r in raw:   # contiguous coverage of every unit
        if r['from'] < cur: continue
        if r['from'] > cur and cov: cov[-1]['to'] = r['from'] - 1
        elif r['from'] > cur: r['from'] = 0
        r['to'] = max(r['from'], min(int(r.get('to', r['from'])), n - 1)); cov.append(r); cur = r['to'] + 1
    if not cov: cov = [{'from': 0, 'to': n - 1, 'prompt': ''}]
    cov[-1]['to'] = n - 1; cov[0]['from'] = 0
    return cov


def split_long(raw, S, brief, ss):
    """only a scene longer than the hard cap `ss` is cut (at unit boundaries, pieces of about 60% of the cap); every piece gets its own image prompt"""
    lim, tgt = ss, ss * .6; out = []
    for r in cover(raw, len(S)):
        if S[r['to']]['t1'] - S[r['from']]['t0'] <= lim or r['to'] == r['from']: out.append(r); continue
        parts, a = [], r['from']
        while a <= r['to']:
            b = a
            while b < r['to'] and S[b + 1]['t1'] - S[a]['t0'] <= tgt: b += 1
            parts.append({'from': a, 'to': b}); a = b + 1
        got = []
        try:
            user = 'خلاصه‌ی داستان:\n%s\n\nقطعه‌ها:\n%s' % (brief or '-', '\n'.join('%d | %s' % (k, ' '.join(S[j]['text'] for j in range(p['from'], p['to'] + 1))) for k, p in enumerate(parts)))
            got = [o for o in groqlib.objects(groqlib.chat(REPAIR, user, max_tokens=2200, json_mode=True, temperature=.5), 'prompt') if isinstance(o, dict)]
        except (Exception, SystemExit) as e: print('split repair fallback:', str(e)[:120])
        print('split a %.0f s scene into %d pieces' % (S[r['to']]['t1'] - S[r['from']]['t0'], len(parts)))
        for k, p in enumerate(parts):
            o = got[k] if k < len(got) else {}
            p.update({'prompt': o.get('prompt') or ((r.get('prompt') or '') + (' A different moment and angle of the same scene.' if k and r.get('prompt') else '')), 'kicker': o.get('kicker') or r.get('kicker') or '',
                      'text': o.get('text') or '', 'number': o.get('number') or '', 'kw': o.get('kw') or r.get('kw') or []})
            out.append(p)
    return out


VERIFY = """برای هر صحنه، متن راوی و توصیف تصویر داده می‌شود. بررسی کن توصیف همه‌ی چیزهای عینیِ متن را نشان می‌دهد (آدم‌ها، اشیا، غذا، مکان، فصل، کشور) و چیزی که در متن نیست (مثل پسربچه با لباس سرباز، شمشیر، شخصیت ساختگی) در آن نیست. اگر درست نیست، توصیف را دوباره بنویس (انگلیسی، ۲ تا ۴ جمله، بدون نوشته در تصویر، بدون راوی)؛ اگر درست است همان را برگردان. اشیای کوچک جدا (غذا، ابزار) در توصیف صحنه نیایند؛ جدا ساخته می‌شوند. اگر متن فقط مقدمه‌ی گوینده است، چیزهایی را که در همان جمله نام برده شده نشان بده.
خروجی فقط JSON: {"scenes":[{"i":0,"prompt":"..."}]} به همان ترتیب و تعداد."""


PROPS = """برای هر صحنه متن راوی داده می‌شود. اگر در متن همان صحنه چیز کوچک و مستقلی نام برده شده که بهتر است جدا ساخته و روی عکس گذاشته شود (غذا، ابزار، حیوان، شیء نمادین؛ نه آدم، نه گروه و نه مکان) آن را در props بنویس، حداکثر ۲ مورد. هر مورد:
fa = نام فارسی کوتاه و مشخص (مثل «غاز کبابی»)، word = کلمه‌ای دقیقاً از متن همان صحنه که با گفتنش شیء ظاهر می‌شود، prompt = توصیف انگلیسی کامل و پرجزئیات فقط همان شیء (جنس، رنگ‌ها، حالت، ترکیب‌بندی و چیزهای همراهش؛ مثلاً غاز کبابی طلایی و براق روی سینی چوبی روستایی با کلم قرمز، سیب پخته، نان و جعفری و بخار ملایم).
اگر صحنه چیز کوچک مستقلی ندارد props را خالی بگذار.
خروجی فقط JSON: {"scenes":[{"i":0,"props":[{"fa":"","word":"","prompt":""}]}]} به همان ترتیب."""


def props_pass(got, S, brief):
    """dedicated pass (a small task the model does reliably): small separate objects named in each scene's text"""
    if not got: return got
    try:
        user = 'خلاصه‌ی داستان:\n%s\n\nصحنه‌ها:\n%s' % (brief or '-', '\n'.join('%d | %s' % (k, ' '.join(S[j]['text'] for j in range(o['from'], min(o.get('to', o['from']), len(S) - 1) + 1))) for k, o in enumerate(got)))
        fix = [o for o in groqlib.objects(groqlib.chat(PROPS, user, max_tokens=3000, json_mode=True, temperature=.3), 'props') if isinstance(o, dict)]
        by = {o.get('i'): o.get('props') for o in fix if isinstance(o.get('i'), int)}
        for k, o in enumerate(got):
            if isinstance(by.get(k), list) and by[k]: o['props'] = by[k]
    except (Exception, SystemExit) as e: print('props pass skipped:', str(e)[:120])
    return got


def verify(got, S, brief):
    """second pass: every prompt must show what its own narration names; wrong ones are rewritten"""
    if not got: return got
    try:
        user = 'خلاصه‌ی داستان:\n%s\n\nصحنه‌ها:\n%s' % (brief or '-', '\n'.join('%d | متن: %s | توصیف فعلی: %s | اشیای جدا (نباید در توصیف باشند): %s' % (k, ' '.join(S[j]['text'] for j in range(o['from'], min(o.get('to', o['from']), len(S) - 1) + 1)), str(o.get('prompt', ''))[:500], ', '.join(str(q.get('fa', '')) for q in (o.get('props') or []) if isinstance(q, dict)) or '-') for k, o in enumerate(got)))
        fix = [o for o in groqlib.objects(groqlib.chat(VERIFY, user, max_tokens=3000, json_mode=True, temperature=.2), 'prompt') if isinstance(o, dict)]
        by = {o.get('i'): o.get('prompt') for o in fix if isinstance(o.get('i'), int)}
        for k, o in enumerate(got):
            if by.get(k) and len(str(by[k])) > 20: o['prompt'] = by[k]
    except (Exception, SystemExit) as e: print('verify skipped:', str(e)[:120])
    return got


def direct(T, ss, brief=''):
    S = T['sentences']; scenes = []; prev = ''
    sys_p = SYSTEM.replace('@MAX@', ds.fadig(str(round(ss))))
    B = 14
    for b in range(0, len(S), B):
        chunk = S[b:b + B]
        user = ('خلاصه‌ی کل داستان (برای دوره‌ی زمانی و ظاهر ثابت شخصیت‌ها):\n%s\n\nتوصیف تصویرِ دو صحنه‌ی قبلی:\n%s\n\nتکه‌ها:\n%s' % (
            brief or '-', prev or '-', '\n'.join(f"{s['i']} | {s['t0']:.1f}-{s['t1']:.1f}s | {s['text']}" for s in chunk)))
        try:
            raw = groqlib.chat(sys_p, user, max_tokens=3200, json_mode=True, temperature=.5)
            got = [o for o in groqlib.objects(raw, 'from') if isinstance(o.get('from'), int)]
        except (Exception, SystemExit) as e:   # Groq down / rate limited: never fail the build; two-sentence scenes with empty prompts the owner fills in
            print('poster director fallback for sentences %d-%d (no AI):' % (b, min(b + B, len(S)) - 1), str(e)[:160])
            got = [{'from': i, 'to': min(i + 1, b + B - 1, len(S) - 1), 'prompt': '', 'text': ' '.join(S[i]['text'].split()[:6])} for i in range(b, min(b + B, len(S)), 2)]
        got = [o for o in got if b <= o['from'] < b + B] or [{'from': b, 'to': min(b + B, len(S)) - 1, 'prompt': ''}]
        got = props_pass(got, S, brief); got = verify(got, S, brief)
        scenes += got; prev = '\n'.join('- ' + str(o.get('prompt', ''))[:300] for o in got[-2:])
    return scenes


def add_props(sc, props, Wd, lib):
    """small separate objects: one that already exists in the library (same Persian name) goes straight onto the scene at the spoken word; the others wait in scene.props for the owner to build (prompt) and upload"""
    need = []
    for p in (props or [])[:2]:
        if not isinstance(p, dict) or not str(p.get('fa') or '').strip(): continue
        fa = str(p['fa']).strip(); wn = ds.norm(str(p.get('word') or '')); t = None
        if wn:
            for w in Wd:
                if sc['t0'] - .01 <= w['t0'] < sc['t1'] and wn in ds.norm(w['w']): t = round(max(sc['t0'] + .2, w['t0'] - .05), 3); break
        if t is None: t = round(sc['t0'] + min(1.0, (sc['t1'] - sc['t0']) * .4), 3)
        v = lib.get(ds.norm(fa))
        if v and v.get('variants'): sc['items'].append({'t': t, 'src': 'library/' + v['variants'][0], 'en': 'pop'}); continue
        need.append({'fa': fa, 't': t, 'prompt': re.sub(r'\s+', ' ', str(p.get('prompt') or '')).strip()})
    if need: sc['props'] = need


def compile_scenes(ep, T, raw, req, short):
    S, Wd = T['sentences'], T['words']; n = len(S); total = round(T['voice_seconds'] + 1.2, 2)
    cov = cover(raw, n)
    for k, r in enumerate(cov):
        r['t0'] = 0.0 if k == 0 else S[r['from']]['t0']; r['t1'] = total if k == len(cov) - 1 else S[cov[k + 1]['from']]['t0']
    lib = {ds.norm(v.get('fa', '')): v for v in ds.library().values() if v.get('fa')}
    scenes = []; kwall = set(); THEME = [0, 3, 6, 1, 4, 7, 2, 5]
    for k, r in enumerate(cov):
        text = (r.get('text') or '').strip(); number = ds.fadig(str(r.get('number') or '').strip()) if T.get('lang', 'fa') == 'fa' else str(r.get('number') or '').strip()
        if len(text.split()) > 10: text = ' '.join(text.split()[:10])
        if T.get('lang', 'fa') == 'fa': text = ds.fadig(text)
        sc = {'t0': round(r['t0'], 3), 't1': round(r['t1'], 3), 'tpl': 'poster', 'theme': THEME[k % 8], 'wipe': (k * 5) % 6, 'items': [], 'text': text, 'number': number,
              'kicker': re.sub(r'\s+', ' ', str(r.get('kicker') or '')).strip()[:40], 'keyOn': bool(text), 'photo': {'prompt': re.sub(r'\s+', ' ', str(r.get('prompt') or '')).strip()}}
        add_props(sc, r.get('props'), Wd, lib)
        for kwd in (r.get('kw') or []): kwall.add(ds.norm(str(kwd)))
        scenes.append(sc)
    if T.get('lang', 'fa') == 'fa':
        for w in Wd: w['w'] = ds.fadig(w['w'])
    for w in Wd: w['kw'] = bool(ds.norm(w['w'])) and any(len(q) > 1 and q in ds.norm(w['w']) for q in kwall)
    meta = {'total': total, 'rtl': T.get('lang', 'fa') == 'fa', 'topLabel': req.get('label') or ds.title_of(ep) or ep.upper().replace('-', ' '), 'lang': T.get('lang', 'fa'), 'episode': ep,
            'style': 'poster', 'mode': 'poster', 'subs': req.get('subs', True), 'footer': req.get('footer', '')}
    json.dump({'meta': meta, 'words': Wd, 'scenes': scenes}, open(f'episodes/{ep}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
    return meta, scenes


def main(ep):
    d = f'episodes/{ep}'; req = ds.load(f'{d}/request.json', {}); short = bool(req.get('short')) or ep.endswith('-short')
    if req.get('use_plan') and os.path.exists(f'{d}/scenes.json'):   # reviewed in the app: keep it (the shared code also refreshes label, subs flag and the render plan)
        D = ds.load(f'{d}/scenes.json', {})
        if 'footer' in req: D.setdefault('meta', {})['footer'] = req['footer']; json.dump(D, open(f'{d}/scenes.json', 'w', encoding='utf8'), ensure_ascii=False)
        return ds.main(ep)
    T = ds.load(f'{d}/timing.json', None)
    if not T: sys.exit('timing.json missing; run narrate_tts.py first')
    ss = MAX_SCENE; T = dict(T); T['sentences'] = units(T, 7.0); print('narration units:', len(T['sentences']))
    raw = ds.load(f'{d}/director.json', None) if req.get('keep_direction') else None
    if raw is None:
        brief = bible(T['sentences']); raw = split_long(direct(T, ss, brief), T['sentences'], brief, ss); json.dump(raw, open(f'{d}/director.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    meta, scenes = compile_scenes(ep, T, raw, req, short)
    print('poster scenes', len(scenes), 'total', meta['total'], '| with prompt:', sum(1 for s in scenes if s['photo']['prompt']))
    ds.emit_plan(meta, req)


if __name__ == '__main__': main(sys.argv[1])
