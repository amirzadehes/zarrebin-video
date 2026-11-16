"""Characters of an episode (episodes/<ep>/cast.json): the fixed cast every picture prompt is written from.
usage: python tools/cast_tool.py        (handles every castreq/<episode>.json, then removes it, so it is idempotent)
  {"build": true}                                  write the cast from the narration (only when cast.json does not exist yet)
  {"add":  [{"fa": "name", "note": "short Persian gist"}]}   add characters: the model turns the gist into a concrete, fixed look
  {"edit": [{"en": "Existing name", "note": "change"}]}     change the look of one character following the owner's note"""
import glob, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import groqlib
import direct_poster as dp

ADD_P = """تو طراح شخصیت یک ویدیوی تصویری هستی. مالک فقط کلیاتِ یک شخصیت را به فارسی می‌گوید؛ تو باید ظاهر مشخص و ثابتِ او را کامل و باورپذیر برای همان دوره و مکانِ داستان بنویسی (مالک جزئیات را نمی‌گوید و انتظار دارد تو بنویسی). خروجی فقط JSON یک شخصیت:
{"fa":"نام فارسی","en":"unique English name","aliases":["other English names used for him/her in prompts"],"base":"fixed face and body in English: gender, approximate age, skin tone, face shape, nose, eyes, hair and beard, height and build (never write 'unspecified' or 'neutral'; choose specific details)","outfits":"usual clothes and items, short English","when":"به فارسی: در کدام بخش داستان می‌آید"}
اگر این شخصیت همان آدمِ یکی از شخصیت‌های موجود در سنی یا دوره‌ی دیگر است، در base بنویس «same face and bone structure as <نام en آن شخصیت>». نام en با هیچ شخصیت موجود یکی نباشد."""


def load(ep):
    f = f'episodes/{ep}/cast.json'
    try: return json.load(open(f, encoding='utf8')).get('characters', [])
    except Exception: return []


def save(ep, cast):
    os.makedirs(f'episodes/{ep}', exist_ok=True)
    json.dump({'characters': cast}, open(f'episodes/{ep}/cast.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)


def story(ep):
    try:
        D = json.load(open(f'episodes/{ep}/scenes.json', encoding='utf8')); W = D.get('words') or []
        return ' '.join(w['w'] for w in W)[:3500]
    except Exception:
        try: return open(f'episodes/{ep}/narration.txt', encoding='utf8').read()[:3500]
        except Exception: return ''


def expand(ep, cast, fa, note, old=None):
    user = 'متن قسمت (خلاصه):\n%s\n\nشخصیت‌های موجود (en): %s\n\n%s\nنام: %s\nکلیات از مالک: %s' % (story(ep) or '-', ', '.join(c.get('en', '') for c in cast) or '-', ('شخصیت فعلی که باید تغییر کند: ' + json.dumps(old, ensure_ascii=False) + '\n') if old else '', fa or (old or {}).get('fa', ''), note or '-')
    o = [x for x in groqlib.objects(groqlib.chat(ADD_P, user, max_tokens=900, json_mode=True, temperature=.4), 'base') if isinstance(x, dict)]
    if not o or not o[0].get('base') or not (o[0].get('en') or o[0].get('fa')): return None
    o = o[0]; o['aliases'] = [str(a) for a in (o.get('aliases') or []) if str(a).strip()]
    if fa: o['fa'] = fa
    return o


def run(ep, q):
    cast = load(ep); n = 0
    if q.get('build') and not cast:
        U = [{'text': story(ep)}]; dp.EP = ep; dp.make_cast(U, ep); cast = load(ep); n += len(cast)
    for a in q.get('add') or []:
        fa, note = str(a.get('fa') or '').strip(), str(a.get('note') or '').strip()
        if not fa: continue
        o = expand(ep, cast, fa, note)
        if o and not any(str(c.get('en', '')).lower() == str(o.get('en', '')).lower() for c in cast): cast.append(o); n += 1
    for e in q.get('edit') or []:
        i = next((k for k, c in enumerate(cast) if c.get('en') == e.get('en')), -1)
        if i < 0: continue
        o = expand(ep, [c for k, c in enumerate(cast) if k != i], cast[i].get('fa'), str(e.get('note') or ''), cast[i])
        if o: o['en'] = cast[i]['en']; cast[i] = o; n += 1   # the English name stays: prompts already use it
    if n: save(ep, cast)
    print(ep, ': cast changes', n)


def main():
    for t in sorted(glob.glob('castreq/*.json')):
        ep = os.path.splitext(os.path.basename(t))[0]
        try: q = json.load(open(t, encoding='utf8'))
        except Exception: q = {}
        try: run(ep, q)
        except SystemExit as e: print('cast tool stopped:', str(e)[:150])
        os.remove(t)


if __name__ == '__main__': main()
