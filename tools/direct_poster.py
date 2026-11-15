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
  دوره‌ی زمانی را از خود داستان بردار: اگر ماجرا تاریخی است لباس و وسیله‌ها همان دوره باشند؛ هرگز «modern» یا «today» ننویس مگر خودِ آن صحنه واقعاً امروزی باشد (دوره‌ی هر صحنه را از خلاصه‌ی داستان و متن همان صحنه بگیر). هر prompt باید کاملاً مستقل و خودکفا باشد: ابزار تصویرسازی هیچ‌کدام از صحنه‌های دیگر را نمی‌بیند. پس هرگز ارجاع نده («the previous scene»، «same as before»، «the same soldier»، «again»، «continuing»). هر شخصیتی که در تصویر هست را هر بار از نو و کامل توصیف کن: «FIXED LOOK» او را در فهرست شخصیت‌ها (CAST) در خلاصه‌ی داستان کلمه‌به‌کلمه در همان prompt بنویس (چهره، مو، ریش، هیکل)، و لباس و سنش را مطابق دوره‌ی همان صحنه (از ستون CLOTHES/AGE BY PERIOD و متن صحنه) کامل با رنگ و جنس بنویس؛ لباسِ دوره‌ی دیگر را نیاور. هرگز نگو «از صحنه‌های قبل».
  در تصویر هیچ نوشته، حرف، عدد یا لوگو نباشد.
- more: فقط اگر در همین صحنه (هنوز یک خط موضوعی) متن به چند تصویر کاملاً متفاوت نیاز دارد (مثلاً اول «مردم شهر اصرار می‌کنند» و بعد «او در طویله قایم شده»)، تصویرهای بعدی را اینجا بنویس، حداکثر ۲ تصویر: {"word":"کلمه‌ای دقیقاً از متن همین صحنه که از آن لحظه تصویر عوض می‌شود","prompt":"توصیف انگلیسی کامل، مستقل و خودکفا مثل prompt اصلی"}. prompt اصلی تصویر اول صحنه است. اگر صحنه یک تصویر بیشتر لازم ندارد more را خالی بگذار.
- props: حداکثر ۲ شیء کوچک و مستقل که در متن همین صحنه نام برده شده و بهتر است جدا ساخته و روی عکس گذاشته شوند (غذا، ابزار، حیوان، شیء نمادین؛ نه آدم و نه مکان). اشیای props را در prompt صحنه نیاور. هر کدام: {"fa":"نام فارسی کوتاه و مشخص مثل غاز کبابی","word":"کلمه‌ای دقیقاً از متن همین صحنه که با گفتنش شیء ظاهر می‌شود","prompt":"توصیف انگلیسی کامل و پرجزئیات فقط همان شیء"}. توصیف prop باید غنی و جذاب باشد: جنس و رنگ‌ها، بافت، حالت و جزئیات ریز خود شیء (مثلاً غاز کبابی طلایی و براق روی یک سینی چوبی کوچک با کلم قرمز و سیب پخته)، نه فقط نام شیء؛ ولی هرگز میز، زمین، اتاق، دیوار یا پس‌زمینه را توصیف نکن و چند شیء جدا (مثل سکه و قلم و طومار) را در یک prop نیاور. اگر شیء کوچکی نیست props را خالی بگذار.
- kicker: برچسب کوتاه انگلیسی با حروف بزرگ، حداکثر ۴ کلمه، مثل «ROME · 4TH CENTURY» یا «THE SHAH · 1970s». اگر چیز مشخصی ندارد خالی بگذار.
- text: تیتر کوتاه فارسی محاوره‌ای (حداکثر ۷ کلمه) و کلمه‌ی مهم را بین دو ستاره بگذار، مثل: برگه‌ی *بدون خریدار*. اگر صحنه نیازی به تیتر ندارد خالی بگذار. تیتر تکرار کلمه‌به‌کلمه‌ی جمله نباشد؛ خلاصه یا نکته‌ی اصلی باشد.
- number: فقط اگر سال یا عدد مهمی واقعاً در متن آمده (مثلاً ۱۹۷۲)، همان را بنویس؛ وگرنه خالی.
- kw: حداکثر ۳ کلمه‌ی مهم همان صحنه برای هایلایت زیرنویس (دقیقاً از متن جمله‌ها).
صحنه‌ی اول قلاب (hook) است: text آن یک سؤال یا جمله‌ی کنجکاوی‌برانگیز باشد.
خروجی فقط JSON: {"scenes":[{"from":0,"to":1,"elements":[],"props":[],"more":[],"prompt":"...","kicker":"...","text":"...","number":"","kw":[]}]}"""


MAX_SCENE = 14.0   # hard cap only; the scene boundaries follow the story line (the director decides)
PUNCT = tuple('.!?؟،,;؛…')


def units(T, maxlen=6.5, force=None):
    """short pieces of narration (the director's unit): break at a sentence change or a punctuation mark once >= ~2 s, and always before maxlen seconds.
    force = word numbers where the owner wants a new scene (cuts.json): a unit never spans such a word. Every unit carries w0 = number of its first word."""
    W = T['words']; force = force or set(); out, starts, cur, k0 = [], [], [], 0
    for k, w in enumerate(W):
        if cur and k in force: out.append(cur); starts.append(k0); cur = []
        if cur and w['s'] != cur[-1]['s'] and cur[-1]['t1'] - cur[0]['t0'] >= 1.5: out.append(cur); starts.append(k0); cur = []
        if not cur: k0 = k
        cur.append(w); d = w['t1'] - cur[0]['t0']
        if d >= maxlen or (w['w'].rstrip('"»”)').endswith(PUNCT) and d >= 2.2): out.append(cur); starts.append(k0); cur = []
    if cur: out.append(cur); starts.append(k0)
    total = round(T['voice_seconds'] + 1.2, 2); U = []
    for i, c in enumerate(out): U.append({'i': i, 't0': 0.0 if i == 0 else c[0]['t0'], 'text': ' '.join(x['w'] for x in c), 'w0': starts[i]})
    for i, u in enumerate(U): u['t1'] = U[i + 1]['t0'] if i + 1 < len(U) else total
    return U


def cut_force(d, T):
    """the owner's scene starts (episodes/<ep>/cuts.json, written by the app's cut page) as a set of word numbers; None when there are none.
    A cut is {w: number of the first word of the new scene, t: its start time}; if the number no longer fits the transcript (text re-made), the time decides."""
    c = ds.load(f'{d}/cuts.json', None)
    if not isinstance(c, dict) or not c.get('cuts'): return None
    W = T['words']; n = len(W); out = set()
    for x in c['cuts']:
        if not isinstance(x, dict): continue
        k, t = x.get('w'), x.get('t')
        if not (isinstance(k, int) and 0 < k < n and (t is None or abs(W[k]['t0'] - float(t)) < .35)):
            if t is None: continue
            k = min(range(n), key=lambda j: abs(W[j]['t0'] - float(t)))
        if 0 < k < n: out.add(k)
    return out or None


def cut_groups(U, force):
    """unit index ranges [(first, last)] of the owner's scenes"""
    st = [i for i, u in enumerate(U) if i == 0 or u['w0'] in force]
    return [(a, (st[k + 1] - 1) if k + 1 < len(st) else len(U) - 1) for k, a in enumerate(st)]


BIBLE = """متن یک ویدیوی توضیحی را می‌خوانی. برای تصویرسازها یک خلاصه‌ی انگلیسیِ کوتاه بنویس (حداکثر ۶ خط، متن ساده): موضوع اصلی، دوره‌ی زمانی و مکان (هر دوره‌ی مهم داستان)، شخصیت‌های اصلی با ظاهر ثابت (سن، لباس، رنگ‌ها) و حال‌وهوای تصویری. فقط از چیزهایی بگو که در متن هست."""


def bible(U):
    try: return groqlib.chat(BIBLE, ' '.join(u['text'] for u in U)[:7000], max_tokens=600, temperature=.2).strip()
    except (Exception, SystemExit) as e: print('story brief skipped:', str(e)[:120]); return ''

CAST_P = """متن یک ویدیوی توضیحی را می‌خوانی. فهرست شخصیت‌ها یا موجودات تکرارشونده‌ی داستان را بنویس (آدم یا حیوان که در بیش از یک جا می‌آید؛ حداکثر ۶). برای هرکدام:
- base: توصیف انگلیسیِ ثابتِ چهره و بدن که در همه‌ی تصویرها یکی است: جنسیت، رنگ پوست، شکل صورت، مو و ریش، قد و هیکل، حالت چهره (بدون لباس و بدون سن دقیق).
- outfits: لباس و سن در هر دوره‌ی داستان به‌صورت کوتاه و انگلیسی (مثلاً «as a young recruit: red wool cloak over bronze-studded leather tunic; as an old bishop: plain white robe and tall mitre»).
فقط از چیزهایی بگو که در متن هست، چیزی اختراع نکن.
خروجی فقط JSON: {"characters":[{"fa":"نام فارسی","en":"English name","base":"...","outfits":"..."}]}"""
CAST = []; BRIEF = ''


def make_cast(U):
    global CAST
    try:
        raw = groqlib.chat(CAST_P, ' '.join(u['text'] for u in U)[:7000], max_tokens=900, json_mode=True, temperature=.2)
        CAST = [o for o in groqlib.objects(raw, 'base') if isinstance(o, dict) and str(o.get('base', '') or o.get('desc', '')).strip() and (o.get('fa') or o.get('en'))][:6]
        for o in CAST: o['base'] = o.get('base') or o.get('desc')
    except (Exception, SystemExit) as e: print('cast skipped:', str(e)[:120]); CAST = []
    return '\n'.join('- %s (%s): FIXED LOOK: %s | CLOTHES/AGE BY PERIOD: %s' % (o.get('en') or '', o.get('fa') or '', re.sub(r'\s+', ' ', str(o['base'])).strip(), re.sub(r'\s+', ' ', str(o.get('outfits') or '-')).strip()) for o in CAST)


BAD_REF = re.compile(r'\b(?:in|from|as in|like in|same as|as seen in|continuing from|continues from)\s+(?:the\s+)?(?:previous|last|earlier|preceding|prior|same)\s+(?:scene|image|picture|shot|frame)s?\b[^.,;]*|\b(?:the\s+)?same\s+(?:scene|character|man|woman|boy|girl|soldier|person|figure)s?\s+(?:as before|again)\b|\b(?:as before|once again|again)\b|\bsame (?:scene|moment)\b', re.I)


def selfcontain(prompt, text):
    """every prompt must stand alone (the image engine never sees the other prompts): strip references to other scenes and add the full description of each recurring character that appears but is not described"""
    pr = BAD_REF.sub('', str(prompt or '')); pr = re.sub(r'\s{2,}', ' ', pr).replace(' .', '.').replace(' ,', ',').strip(); pr = re.sub(r',\s*,', ',', pr); pr = re.sub(r'([.!?])\s+([a-z])', lambda m: m.group(1) + ' ' + m.group(2).upper(), pr)
    if not pr: return pr
    low, tn = pr.lower(), ds.norm(text or ''); add = []
    for o in CAST:
        en, fa_, d = str(o.get('en') or '').strip(), str(o.get('fa') or '').strip(), re.sub(r'\s+', ' ', str(o['base'])).strip()
        named = bool(en) and en.lower() in low   # only when the picture itself names the character
        fp = ' '.join(d.lower().split()[:4])
        if named and fp not in low: add.append('%s: %s' % (en or fa_, d.rstrip('.')))
    if add: pr = pr.rstrip() + ' Character look (face and body, keep exactly; the clothes and age are the ones described above): ' + '; '.join(add) + '.'
    return pr


REPAIR = """یک صحنه‌ی بلند به چند قطعه‌ی پشت‌سرهم تقسیم شده است. برای هر قطعه یک تصویر جدا و متفاوت (لحظه یا زاویه‌ی دیگری از همان ماجرا) بنویس؛ هر prompt کاملاً مستقل باشد و هیچ ارجاعی به قطعه‌ی دیگر نداشته باشد، و هر شخصیتی که در آن هست را کامل (طبق فهرست CAST در خلاصه) توصیف کن، مطابق چیزی که در متن همان قطعه گفته می‌شود. راوی را نشان نده و چیزی اختراع نکن.
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
            p.update({'prompt': o.get('prompt') or (r.get('prompt') or '' if k == 0 else ''), 'kicker': o.get('kicker') or r.get('kicker') or '',
                      'text': o.get('text') or '', 'number': o.get('number') or '', 'kw': o.get('kw') or r.get('kw') or []})
            out.append(p)
    return out


FIXP = """برای هر صحنه‌ی ویدیو فقط متن راوی همان صحنه داده می‌شود و باید یک توصیف تصویر انگلیسی بنویسی (۲ تا ۴ جمله، بدون نوشته در تصویر، بدون نشان‌دادن راوی). این صحنه‌ها با هم و با صحنه‌های دیگر فرق دارند: هر توصیف باید دقیقاً چیزی را نشان بدهد که در متن همان صحنه گفته می‌شود (آدم‌ها، مکان، دوره، فصل، اشیای بزرگ، عمل)، پس توصیف‌ها نباید شبیه هم یا شبیه فهرست «قبلاً استفاده‌شده» باشند: هر صحنه صحنه‌ی، زاویه‌ی و ترکیب خودش را داشته باشد. اگر متن چیز عینی ندارد (توضیح، عدد، مالیات، تاریخ)، یک تصویر نمادین و تصویری بساز که با همان مفهوم بخواند (مثلاً مزرعه‌ی پاییزی، اسناد و سکه، فانوس). هر توصیف مستقل باشد و به صحنه‌ی دیگر ارجاع ندهد؛ هر شخصیت را کامل (طبق CAST در خلاصه) و با لباس و سن همان دوره بنویس. چیزی که در متن نیست اختراع نکن.
خروجی فقط JSON: {"scenes":[{"i":0,"prompt":""}]} به همان ترتیب و تعداد."""


def _body(p): return re.sub(r'\s+', ' ', str(p or '').split(' Character look')[0]).strip()


def _wset(p): return set(w for w in re.findall(r'[a-z]{4,}', _body(p).lower()))


def bad_prompts(prompts, thr=.62):
    """indexes whose prompt is empty or (nearly) the same as an earlier one: the image engine would draw the same picture again"""
    kept, bad = [], []
    for i, p in enumerate(prompts):
        w = _wset(p)
        if len(w) < 6: bad.append(i); continue
        if any(len(w & v) / max(1, len(w | v)) > thr for v in kept): bad.append(i); continue
        kept.append(w)
    return bad


def fix_prompts(texts, olds, brief, rounds=4):
    """new prompt for every index in `texts` ({i: narration}); waits out Groq rate limits (each model has its own quota) instead of giving up; returns {i: prompt}"""
    import time
    res, todo = {}, list(texts)
    used = [_body(p)[:80] for p in olds if _body(p)]
    for rd in range(rounds):
        for a in range(0, len(todo), 5):
            ids = todo[a:a + 5]
            if all(i in res for i in ids): continue
            user = 'خلاصه‌ی داستان:\n%s\n\nقبلاً استفاده‌شده (تکرار نکن):\n%s\n\nصحنه‌ها:\n%s' % (brief or '-', '\n'.join('- ' + u for u in used[-40:]) or '-', '\n'.join('%d | %s' % (k, texts[i]) for k, i in enumerate(ids)))
            try:
                got = [o for o in groqlib.objects(groqlib.chat(FIXP, user, max_tokens=2200, json_mode=True, temperature=.7), 'prompt') if isinstance(o, dict)]
                for o in got:
                    k = o.get('i')
                    if isinstance(k, int) and 0 <= k < len(ids) and len(str(o.get('prompt', ''))) > 30: res[ids[k]] = re.sub(r'\s+', ' ', str(o['prompt'])).strip(); used.append(res[ids[k]][:80])
            except (Exception, SystemExit) as e:
                print('prompt repair waiting (%s):' % str(e)[:100]); groqlib._bad.clear(); groqlib._model = None; time.sleep(70)
        todo = [i for i in todo if i not in res]
        if not todo: break
    return res


def fix_dupes(prompts, texts, brief):
    """returns prompts where empty/duplicate ones are rewritten from their own narration; one that still cannot be written is left EMPTY (never a copy)"""
    prompts = list(prompts); bad = bad_prompts(prompts)
    if not bad: return prompts
    print('prompts empty or repeated in %d of %d scenes: rewriting from their own text' % (len(bad), len(prompts)))
    got = fix_prompts({i: texts[i] for i in bad}, prompts, brief)
    for i in bad: prompts[i] = got.get(i, '')
    left = [i for i in bad_prompts(prompts, .85) if prompts[i]]
    for i in left: prompts[i] = ''
    miss = [i for i in range(len(prompts)) if not prompts[i]]
    if miss: print('WARNING: %d scenes have no prompt (Groq unavailable); use "بازسازی پرامپت" in the app later' % len(miss))
    return prompts


VERIFY = """برای هر صحنه، متن راوی و توصیف تصویر داده می‌شود. بررسی کن توصیف همه‌ی چیزهای عینیِ متن را نشان می‌دهد (آدم‌ها، اشیا، غذا، مکان، فصل، کشور) و چیزی که در متن نیست (مثل پسربچه با لباس سرباز، شمشیر، شخصیت ساختگی) در آن نیست. اگر درست نیست، توصیف را دوباره بنویس (انگلیسی، ۲ تا ۴ جمله، بدون نوشته در تصویر، بدون راوی)؛ اگر درست است همان را برگردان. هر توصیف باید مستقل باشد: اگر به صحنه‌ی دیگر ارجاع دارد (previous، same، again، before) یا شخصیتی را بدون توصیف کامل آورده، دوباره بنویس و FIXED LOOK همان شخصیت را از فهرست CAST در خلاصه‌ی داستان کلمه‌به‌کلمه داخلش بگذار و لباس و سنش را مطابق دوره‌ی همان صحنه کامل بنویس. اشیای کوچک جدا (غذا، ابزار) در توصیف صحنه نیایند؛ جدا ساخته می‌شوند. اگر متن فقط مقدمه‌ی گوینده است، چیزهایی را که در همان جمله نام برده شده نشان بده.
خروجی فقط JSON: {"scenes":[{"i":0,"prompt":"..."}]} به همان ترتیب و تعداد."""


PROPS = """برای هر صحنه متن راوی داده می‌شود. اگر در متن همان صحنه چیز کوچک و مستقلی نام برده شده که بهتر است جدا ساخته و روی عکس گذاشته شود (غذا، ابزار، حیوان، شیء نمادین؛ نه آدم، نه گروه و نه مکان) آن را در props بنویس، حداکثر ۲ مورد. هر مورد:
fa = نام فارسی کوتاه و مشخص (مثل «غاز کبابی»)، word = کلمه‌ای دقیقاً از متن همان صحنه که با گفتنش شیء ظاهر می‌شود، prompt = توصیف انگلیسی کامل و پرجزئیات فقط خود همان شیء، جدا و تنها (جنس، رنگ‌ها، بافت، حالت و جزئیات ریز خودش؛ مثلاً غاز کبابی طلایی و براق روی یک سینی چوبی کوچک با کلم قرمز و سیب پخته). هرگز میز، قفسه، زمین، اتاق، دیوار، پس‌زمینه یا منظره را توصیف نکن و شیء را روی سطحی قرار نده؛ چیزهای دیگرِ جدا مثل قلم و طومار را هم داخل همین prompt نیاور (برایشان مورد جدا بساز). اگر شیء ذاتاً ظرف دارد (سینی، بشقاب) همان جزو شیء است.
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
        user = 'خلاصه‌ی داستان:\n%s\n\nصحنه‌ها:\n%s' % (brief or '-', '\n'.join('%d | متن: %s | توصیف فعلی: %s | اشیای جدا (نباید در توصیف باشند): %s | تصویرهای بعدیِ همین صحنه (در توصیف فعلی نیایند؛ توصیف فعلی فقط تصویر اول است): %s' % (k, ' '.join(S[j]['text'] for j in range(o['from'], min(o.get('to', o['from']), len(S) - 1) + 1)), str(o.get('prompt', ''))[:500], ', '.join(str(q.get('fa', '')) for q in (o.get('props') or []) if isinstance(q, dict)) or '-', ' / '.join(str(m.get('prompt', ''))[:90] for m in (o.get('more') or []) if isinstance(m, dict)) or '-') for k, o in enumerate(got)))
        fix = [o for o in groqlib.objects(groqlib.chat(VERIFY, user, max_tokens=3000, json_mode=True, temperature=.2), 'prompt') if isinstance(o, dict)]
        by = {o.get('i'): o.get('prompt') for o in fix if isinstance(o.get('i'), int)}
        for k, o in enumerate(got):
            if by.get(k) and len(str(by[k])) > 20: o['prompt'] = by[k]
    except (Exception, SystemExit) as e: print('verify skipped:', str(e)[:120])
    return got


def fix_raw(raw, S, brief):
    raw = cover(raw, len(S)); n = len(S)
    texts = [' '.join(S[j]['text'] for j in range(r['from'], min(r.get('to', r['from']), n - 1) + 1)) for r in raw]
    for r, p in zip(raw, fix_dupes([r.get('prompt') for r in raw], texts, brief)): r['prompt'] = p
    return raw


def direct(T, ss, brief=''):
    S = T['sentences']; scenes = []; prev = ''
    sys_p = SYSTEM.replace('@MAX@', ds.fadig(str(round(ss))))
    B = 14
    for b in range(0, len(S), B):
        chunk = S[b:b + B]
        user = ('خلاصه‌ی کل داستان (برای دوره‌ی زمانی و ظاهر ثابت شخصیت‌ها):\n%s\n\nتکه‌ها:\n%s' % (
            brief or '-', '\n'.join(f"{s['i']} | {s['t0']:.1f}-{s['t1']:.1f}s | {s['text']}" for s in chunk)))
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


FIXED_NOTE = """نکته‌ی مهم این بار: مرز صحنه‌ها را خودِ مالک ویدیو تعیین کرده است. تکه‌ها با خطِ «=== صحنه N ===» به گروه جدا شده‌اند. برای هر گروه دقیقاً یک صحنه بساز (نه بیشتر و نه کمتر؛ هرگز دو گروه را یکی نکن و یک گروه را نشکن)؛ from و to هر صحنه باید شماره‌ی اولین و آخرین تکه‌ی همان گروه باشد. بقیه‌ی قواعد بالا (elements، prompt، more، props، kicker، text، number، kw) برای هر صحنه همان‌طور که نوشته شده است.

"""


def direct_fixed(T, groups, brief=''):
    """scene boundaries come from the owner (cuts.json): the AI only writes what each scene shows (prompt, label, headline, props ...); from/to are forced to the owner's groups"""
    S = T['sentences']; scenes = []; sys_p = FIXED_NOTE + SYSTEM.replace('@MAX@', ds.fadig(str(round(MAX_SCENE))))
    B = 6
    for b in range(0, len(groups), B):
        chunk = groups[b:b + B]
        user = 'خلاصه‌ی کل داستان (برای دوره‌ی زمانی و ظاهر ثابت شخصیت‌ها):\n%s\n\nتکه‌ها:\n%s' % (brief or '-', '\n'.join(
            '=== صحنه %d ===\n%s' % (b + g, '\n'.join('%d | %.1f-%.1fs | %s' % (S[j]['i'], S[j]['t0'], S[j]['t1'], S[j]['text']) for j in range(a, z + 1))) for g, (a, z) in enumerate(chunk)))
        try:
            raw = groqlib.chat(sys_p, user, max_tokens=3600, json_mode=True, temperature=.5)
            got = [o for o in groqlib.objects(raw, 'from') if isinstance(o.get('from'), int)]
        except (Exception, SystemExit) as e:   # Groq down: the owner's scenes stay, prompts are filled in later (fix_raw / the app)
            print('poster director fallback for scenes %d-%d (no AI):' % (b, b + len(chunk) - 1), str(e)[:160]); got = []
        res = []
        for a, z in chunk:
            o = next((x for x in sorted(got, key=lambda x: x['from']) if a <= x['from'] <= z), None) or {'prompt': '', 'text': ' '.join(S[a]['text'].split()[:6])}
            o = dict(o); o['from'], o['to'] = a, z; res.append(o)
        res = props_pass(res, S, brief); res = verify(res, S, brief)
        scenes += res
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


def add_more(sc, r, Wd, S, n):
    """extra background pictures inside one scene: each enters at its spoken word on top of the previous one"""
    out = []; txt = ' '.join(S[j]['text'] for j in range(r['from'], min(r.get('to', r['from']), n - 1) + 1))
    for q in (r.get('more') or [])[:2]:
        if not isinstance(q, dict) or len(str(q.get('prompt') or '')) < 15: continue
        wn = ds.norm(str(q.get('word') or '')); t = None
        if wn:
            for w in Wd:
                if sc['t0'] + .3 <= w['t0'] < sc['t1'] and wn in ds.norm(w['w']): t = round(w['t0'] - .05, 3); break
        if t is None: t = round(sc['t0'] + (sc['t1'] - sc['t0']) * (.5 if not out else .75), 3)
        out.append({'prompt': selfcontain(re.sub(r'\s+', ' ', str(q['prompt'])).strip(), txt), 't': t, 'en': 'fade'})
    if out: sc['photos'] = out


MUSIC_P = """تو آهنگساز و کارگردان موسیقی یک ویدیوی پادکستی-انیمیشنی هستی. خلاصه‌ی داستان و فهرست صحنه‌ها با زمانشان داده می‌شود. یک پرامپت برای ساخت موزیک در Suno بنویس، به انگلیسی، فقط ساز (بدون خواننده)، که با موضوع، دوره‌ی تاریخی، حال‌وهوا و فرازونشیب داستان بخورد و زیر صدای راوی بنشیند (بدون ملودی پرسروصدا، بدون ریتم شلوغ که با صحبت درگیر شود).
خروجی فقط JSON: {"title":"عنوان کوتاه انگلیسی","style":"یک خط ≤ 190 حرف برای فیلد Style of Music در Suno: ژانر، حال‌وهوا، سازها، تمپو (BPM)، instrumental, no vocals","structure":[{"at":"0:00","note":"چه حالی و چه سازهایی (یک جمله‌ی انگلیسی)"}],"avoid":"چیزهایی که نباید باشد (کوتاه)"}
structure حداکثر ۶ بخش و زمان‌ها با mm:ss و در محدوده‌ی طول ویدیو باشد؛ بخش آخر پایان نرم موزیک (ending/fade out) در لحظه‌ی پایان ویدیو باشد."""


def mmss(x): x = int(round(x)); return '%d:%02d' % (x // 60, x % 60)


def music_brief(T, brief, scenes, total):
    """a ready-to-paste Suno prompt: instrumental, sits under the voice, follows the story arc and ends with the video"""
    try:
        sl = '\n'.join('%s | %s' % (mmss(sc['t0']), (sc.get('text') or ' '.join(str((sc.get('photo') or {}).get('prompt', '')).split()[:14]))) for sc in scenes)
        raw = groqlib.chat(MUSIC_P, 'مدت ویدیو: %s (%d ثانیه)\n\nخلاصه‌ی داستان:\n%s\n\nصحنه‌ها:\n%s' % (mmss(total), round(total), brief or '-', sl[:4500]), max_tokens=900, json_mode=True, temperature=.5)
        o = (groqlib.objects(raw, 'style') or [{}])[0]
        style = re.sub(r'\s+', ' ', str(o.get('style') or '')).strip()[:200]
        if not style: return None
        st = [x for x in (o.get('structure') or []) if isinstance(x, dict) and x.get('note')][:6]
        full = 'Title: %s\nStyle of Music: %s\nInstrumental, no vocals. Target length: about %s (the video is %s long).\nStructure:\n%s%s' % (o.get('title') or 'Untitled', style, mmss(total), mmss(total), '\n'.join('%s  %s' % (x.get('at') or '', x['note']) for x in st), ('\nAvoid: ' + str(o['avoid'])) if o.get('avoid') else '')
        return {'title': str(o.get('title') or '')[:60], 'style': style, 'duration': round(total), 'full': full}
    except (Exception, SystemExit) as e: print('music brief skipped:', str(e)[:120]); return None


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
              'kicker': re.sub(r'\s+', ' ', str(r.get('kicker') or '')).strip()[:40], 'keyOn': bool(text), 'photo': {'prompt': selfcontain(re.sub(r'\s+', ' ', str(r.get('prompt') or '')).strip(), ' '.join(S[j]['text'] for j in range(r['from'], min(r.get('to', r['from']), n - 1) + 1)))}}
        add_props(sc, r.get('props'), Wd, lib)
        add_more(sc, r, Wd, S, n)
        for kwd in (r.get('kw') or []): kwall.add(ds.norm(str(kwd)))
        scenes.append(sc)
    if T.get('lang', 'fa') == 'fa':
        for w in Wd: w['w'] = ds.fadig(w['w'])
    for w in Wd: w['kw'] = bool(ds.norm(w['w'])) and any(len(q) > 1 and q in ds.norm(w['w']) for q in kwall)
    meta = {'total': total, 'rtl': T.get('lang', 'fa') == 'fa', 'topLabel': req.get('label') or ds.title_of(ep) or ep.upper().replace('-', ' '), 'lang': T.get('lang', 'fa'), 'episode': ep,
            'style': 'poster', 'mode': 'poster', 'subs': req.get('subs', True), 'footer': req.get('footer', '')}
    mb = music_brief(T, BRIEF, scenes, total)
    if mb: meta['music'] = mb
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
    ss = MAX_SCENE; T = dict(T); force = cut_force(d, T) if req.get('use_cuts') else None
    if req.get('use_cuts') and not force: print('use_cuts asked but cuts.json is missing or empty: the director chooses the scene boundaries')
    T['sentences'] = units(T, 7.0, force); print('narration units:', len(T['sentences']))
    groups = cut_groups(T['sentences'], force) if force else None
    if groups: print("the owner's cuts: %d scenes (the director only writes what each scene shows)" % len(groups))
    raw = ds.load(f'{d}/director.json', None) if req.get('keep_direction') and not groups else None
    if raw is None:
        brief = bible(T['sentences']); _c = make_cast(T['sentences']); brief = (brief + ('\nCAST (fixed look of recurring characters; copy this description inside every prompt where the character appears):\n' + _c if _c else '')).strip(); globals()['BRIEF'] = brief; raw = direct_fixed(T, groups, brief) if groups else split_long(direct(T, ss, brief), T['sentences'], brief, ss); raw = fix_raw(raw, T['sentences'], brief); json.dump(raw, open(f'{d}/director.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    meta, scenes = compile_scenes(ep, T, raw, req, short)
    print('poster scenes', len(scenes), 'total', meta['total'], '| with prompt:', sum(1 for s in scenes if s['photo']['prompt']))
    ds.emit_plan(meta, req)


if __name__ == '__main__': main(sys.argv[1])
