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
روایت به جمله‌ها تقسیم شده است (شماره، زمان، متن). جمله‌های پشت‌سرهم را در «صحنه» گروه‌بندی کن؛ هر صحنه ۳ تا ۷ ثانیه (معمولاً ۱ تا ۲ جمله) و همه‌ی جمله‌ها را بدون فاصله و همپوشانی پوشش بده. صحنه‌ی بیش از ۸ ثانیه نساز.
برای هر صحنه این‌ها را بنویس:
- prompt: توضیح انگلیسیِ یک تصویر برای ابزار تصویرسازی (۲ تا ۴ جمله). یک صحنه‌ی واحد و روشن که همان چیزی را نشان بدهد که راوی می‌گوید: چه کسی یا چه چیزی، کجا، چه کاری می‌کند، نور و حال‌وهوا و زاویه‌ی دوربین. موضوع اصلی را در میانه‌ی کادر بگذار.
  دوره‌ی زمانی را از خود داستان بردار: اگر ماجرا تاریخی است لباس و وسیله‌ها همان دوره باشند؛ هرگز «modern» یا «today» ننویس مگر داستان امروزی باشد. اگر یک شخصیت چند بار می‌آید، هر بار با همان مشخصات بنویس (سن، لباس، رنگ) تا تصویرها شبیه هم شوند.
  در تصویر هیچ نوشته، حرف، عدد یا لوگو نباشد.
- kicker: برچسب کوتاه انگلیسی با حروف بزرگ، حداکثر ۴ کلمه، مثل «ROME · 4TH CENTURY» یا «THE SHAH · 1970s». اگر چیز مشخصی ندارد خالی بگذار.
- text: تیتر کوتاه فارسی محاوره‌ای (حداکثر ۷ کلمه) و کلمه‌ی مهم را بین دو ستاره بگذار، مثل: برگه‌ی *بدون خریدار*. اگر صحنه نیازی به تیتر ندارد خالی بگذار. تیتر تکرار کلمه‌به‌کلمه‌ی جمله نباشد؛ خلاصه یا نکته‌ی اصلی باشد.
- number: فقط اگر سال یا عدد مهمی واقعاً در متن آمده (مثلاً ۱۹۷۲)، همان را بنویس؛ وگرنه خالی.
- kw: حداکثر ۳ کلمه‌ی مهم همان صحنه برای هایلایت زیرنویس (دقیقاً از متن جمله‌ها).
صحنه‌ی اول قلاب (hook) است: text آن یک سؤال یا جمله‌ی کنجکاوی‌برانگیز باشد.
خروجی فقط JSON: {"scenes":[{"from":0,"to":1,"prompt":"...","kicker":"...","text":"...","number":"","kw":[]}]}"""


def direct(T, short):
    S = T['sentences']; scenes = []; prev = ''
    sys_p = SYSTEM.replace('۳ تا ۷ ثانیه', '۲ تا ۴ ثانیه').replace('بیش از ۸ ثانیه', 'بیش از ۵ ثانیه') if short else SYSTEM
    B = 12
    for b in range(0, len(S), B):
        chunk = S[b:b + B]
        user = ('توصیف تصویرِ دو صحنه‌ی قبلی (برای یکدست ماندن شخصیت‌ها و دوره‌ی زمانی):\n%s\n\nجمله‌ها:\n%s' % (
            prev or '-', '\n'.join(f"{s['i']} | {s['t0']:.1f}-{s['t1']:.1f}s | {s['text']}" for s in chunk)))
        try:
            raw = groqlib.chat(sys_p, user, max_tokens=3200, json_mode=True, temperature=.5)
            got = [o for o in groqlib.objects(raw, 'from') if isinstance(o.get('from'), int)]
        except (Exception, SystemExit) as e:   # Groq down / rate limited: never fail the build; two-sentence scenes with empty prompts the owner fills in
            print('poster director fallback for sentences %d-%d (no AI):' % (b, min(b + B, len(S)) - 1), str(e)[:160])
            got = [{'from': i, 'to': min(i + 1, b + B - 1, len(S) - 1), 'prompt': '', 'text': ' '.join(S[i]['text'].split()[:6])} for i in range(b, min(b + B, len(S)), 2)]
        got = [o for o in got if b <= o['from'] < b + B] or [{'from': b, 'to': min(b + B, len(S)) - 1, 'prompt': ''}]
        scenes += got; prev = '\n'.join('- ' + str(o.get('prompt', ''))[:300] for o in got[-2:])
    return scenes


def compile_scenes(ep, T, raw, req, short):
    S, Wd = T['sentences'], T['words']; n = len(S); total = round(T['voice_seconds'] + 1.2, 2)
    raw = sorted([r for r in raw if isinstance(r.get('from'), int) and 0 <= r['from'] < n], key=lambda r: r['from'])
    cov, cur = [], 0
    for r in raw:   # contiguous coverage of every sentence
        if r['from'] < cur: continue
        if r['from'] > cur and cov: cov[-1]['to'] = r['from'] - 1
        elif r['from'] > cur: r['from'] = 0
        r['to'] = max(r['from'], min(int(r.get('to', r['from'])), n - 1)); cov.append(r); cur = r['to'] + 1
    if not cov: cov = [{'from': 0, 'to': n - 1, 'prompt': ''}]
    cov[-1]['to'] = n - 1; cov[0]['from'] = 0
    for k, r in enumerate(cov):
        r['t0'] = 0.0 if k == 0 else S[r['from']]['t0']; r['t1'] = total if k == len(cov) - 1 else S[cov[k + 1]['from']]['t0']
    scenes = []; kwall = set(); THEME = [0, 3, 6, 1, 4, 7, 2, 5]
    for k, r in enumerate(cov):
        text = (r.get('text') or '').strip(); number = ds.fadig(str(r.get('number') or '').strip()) if T.get('lang', 'fa') == 'fa' else str(r.get('number') or '').strip()
        if len(text.split()) > 10: text = ' '.join(text.split()[:10])
        if T.get('lang', 'fa') == 'fa': text = ds.fadig(text)
        sc = {'t0': round(r['t0'], 3), 't1': round(r['t1'], 3), 'tpl': 'poster', 'theme': THEME[k % 8], 'wipe': (k * 5) % 6, 'items': [], 'text': text, 'number': number,
              'kicker': re.sub(r'\s+', ' ', str(r.get('kicker') or '')).strip()[:40], 'keyOn': bool(text), 'photo': {'prompt': re.sub(r'\s+', ' ', str(r.get('prompt') or '')).strip()}}
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
    raw = ds.load(f'{d}/director.json', None) if req.get('keep_direction') else None
    if raw is None:
        raw = direct(T, short); json.dump(raw, open(f'{d}/director.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    meta, scenes = compile_scenes(ep, T, raw, req, short)
    print('poster scenes', len(scenes), 'total', meta['total'], '| with prompt:', sum(1 for s in scenes if s['photo']['prompt']))
    ds.emit_plan(meta, req)


if __name__ == '__main__': main(sys.argv[1])
