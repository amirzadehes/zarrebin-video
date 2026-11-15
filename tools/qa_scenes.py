"""Quality check (retention / cut-cadence rules) of one episode's scenes.json. Reports only: it never changes scenes.json and never fails the build.
usage: python tools/qa_scenes.py <episode>
writes episodes/<ep>/qa.json and prints the findings (Persian) so they land in build.log.

Rules (limits are for the long version; the ~60 s "short" version uses the tighter numbers in LIM_SHORT):
  long-scene      a scene lasts too long
  short-scene     a scene is so short that it is gone before it is read
  no-picture      a scene has no picture at all (only the caption is on screen)
  same-template   the same template several times in a row
  quiet-stretch   a long stretch with no new visual event (scene change or a picture landing)
  cut-mid-word    a scene change starts while a word is still being spoken (cuts look cleaner in the gaps between words)
  hook            the first scene must show a picture quickly and not run long
  highlights      share of emphasised caption words is 0 or very high
"""
import json, os, sys

LIM = dict(long=9.5, short=1.8, quiet=6.0, run=3, hook_pic=1.0, hook_len=6.5)
LIM_SHORT = dict(long=5.5, short=1.4, quiet=4.5, run=3, hook_pic=.9, hook_len=4.5)


def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d


def main(ep):
    d = f'episodes/{ep}'; S = load(f'{d}/scenes.json', None)
    if not S: print('qa: scenes.json missing'); return
    req = load(f'{d}/request.json', {}); short = bool(req.get('short')) or ep.endswith('-short'); L = LIM_SHORT if short else LIM
    sc, W, total = S.get('scenes') or [], S.get('words') or [], (S.get('meta') or {}).get('total') or 0
    poster = (S.get('meta') or {}).get('mode') == 'poster'   # poster mode: every scene is one full-bleed picture; pictures are the owner's uploads
    if not sc: print('qa: no scenes'); return
    out = []

    def add(rule, sev, t, msg): out.append({'rule': rule, 'severity': sev, 't': round(t, 2), 'msg': msg})

    longs, shorts = [], []
    for i, s in enumerate(sc):
        dur = s['t1'] - s['t0']
        if dur > L['long']: longs.append((dur, i, s['t0']))
        if dur < L['short'] and i < len(sc) - 1: shorts.append((dur, i, s['t0']))
    if longs:
        w = max(longs); add('long-scene', 'warn', w[2], '%d صحنه از %.1f ثانیه طولانی‌ترند؛ بلندترین: صحنه‌ی %d از ثانیه‌ی %.1f (%.1f ثانیه). این‌ها را کوتاه‌تر ببر یا تصویر/رویداد بیشتری بگذار.' % (len(longs), L['long'], w[1], w[2], w[0]))
    if shorts:
        w = min(shorts); add('short-scene', 'warn', w[2], '%d صحنه کوتاه‌تر از %.1f ثانیه‌اند (کوتاه‌ترین: صحنه‌ی %d، %.1f ثانیه) و خوانده نمی‌شوند.' % (len(shorts), L['short'], w[1], w[0]))
    nop = sum(1 for s in sc if not (s.get('photo') or {}).get('src') and not s.get('bgc') and not any((x or {}).get('src') for x in s.get('photos') or [])) if poster else sum(1 for s in sc if not s.get('items'))
    if poster and nop: add('no-picture', 'warn', 0, '%d از %d صحنه هنوز عکس آپلودشده ندارند؛ با پس‌زمینه‌ی تیره ساخته می‌شوند.' % (nop, len(sc)))
    elif nop / len(sc) > .15: add('no-picture', 'warn', 0, '%d از %d صحنه تصویر ندارند (فقط زیرنویس)؛ ویدیو خشک می‌شود.' % (nop, len(sc)))
    # runs of the same template
    run = 1
    for i in range(1, len(sc) + 1):
        if not poster and i < len(sc) and sc[i]['tpl'] == sc[i - 1]['tpl']: run += 1; continue
        if run >= L['run']: add('same-template', 'warn', sc[i - run]['t0'], '%d صحنه‌ی پشت‌سرهم با قالب «%s» از صحنه‌ی %d؛ تنوع کم است.' % (run, sc[i - 1]['tpl'], i - run))
        run = 1
    # stretches without a new visual event (scene change or a picture landing; the engine's camera beats come on top of this)
    ev = sorted([s['t0'] for s in sc] + [it['t'] for s in sc for it in s.get('items', [])] + [total])
    gaps = sorted(((b - a, a) for a, b in zip(ev, ev[1:]) if b - a > L['quiet']), reverse=True); worst = max([b - a for a, b in zip(ev, ev[1:])] or [0])
    if gaps:
        add('quiet-stretch', 'warn', gaps[0][1], '%d بازه‌ی بیشتر از %.1f ثانیه بدون رویداد تصویری تازه (عکس یا تغییر صحنه) داریم؛ بدترین‌ها: %s. بین این‌ها فقط ضربه‌ی دوربین می‌آید؛ بهتر است تصویر دوم یا تغییر صحنه اضافه شود.' % (len(gaps), L['quiet'], '، '.join('%.0f تا %.0f' % (a, a + g) for g, a in gaps[:3])))
    # a cut that starts in the middle of a spoken word (the wipe starts 0.1 s before the scene time)
    midl = [(i, s['t0']) for i, s in enumerate(sc[1:], 1) if any(w['t0'] < s['t0'] - .1 < w['t1'] - .05 for w in W)]; mid = len(midl)
    if mid: add('cut-mid-word', 'info', midl[0][1], '%d برش صحنه وسط یک کلمه شروع می‌شود (نمونه: صحنه‌ی %d در ثانیه‌ی %.1f).' % (mid, midl[0][0], midl[0][1]))
    # hook
    h = sc[0]; first = min([it['t'] for it in h.get('items', [])] or [99])
    if h['t1'] - h['t0'] > L['hook_len'] or (not poster and h.get('items') and first > L['hook_pic']) or (not poster and not h.get('items') and not h.get('text')):
        add('hook', 'warn', 0, 'صحنه‌ی اول (قلاب) باید زود تصویر بیاورد (≤%.1f ثانیه) و از %.1f ثانیه بلندتر نباشد؛ الان: %.1f ثانیه، اولین تصویر در %s.' % (L['hook_pic'], L['hook_len'], h['t1'] - h['t0'], ('%.1f' % first) if first < 99 else 'هیچ'))
    # emphasised caption words
    if W:
        kw = sum(1 for w in W if w.get('kw')) / len(W)
        if kw == 0: add('highlights', 'warn', 0, 'هیچ کلمه‌ای برای هایلایت زیرنویس علامت نخورده است.')
        elif kw > .3: add('highlights', 'info', 0, '%d٪ کلمه‌ها هایلایت شده‌اند؛ زیاد است و تأکید اثر خود را از دست می‌دهد.' % round(kw * 100))
    warns = [o for o in out if o['severity'] == 'warn']
    stats = {'episode': ep, 'total': total, 'scenes': len(sc), 'avg_scene_s': round(total / len(sc), 2) if sc else 0, 'max_quiet_s': round(worst, 2), 'no_picture_scenes': nop, 'cuts_mid_word': mid, 'warnings': len(warns), 'infos': len(out) - len(warns), 'short_mode': short}
    json.dump({'stats': stats, 'findings': out}, open(f'{d}/qa.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('QA %s: %d صحنه، میانگین %.1f ثانیه، بیشترین سکون تصویری %.1f ثانیه | هشدار: %d، نکته: %d' % (ep, len(sc), stats['avg_scene_s'], worst, len(warns), len(out) - len(warns)))
    for o in sorted(out, key=lambda o: (o["severity"] != "warn", o["t"]))[:12]: print(' -', ('⚠' if o['severity'] == 'warn' else 'ℹ'), o['msg'])
    if len(out) > 12: print(" … و %d مورد دیگر در qa.json" % (len(out) - 12))


if __name__ == '__main__':
    try: main(sys.argv[1])
    except Exception as e: print('qa skipped:', e)   # a check must never break a build
