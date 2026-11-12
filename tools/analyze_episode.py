"""Reads episodes/<ep>/script.txt, asks Groq which sticker objects the episode needs,
writes episodes/<ep>/needs.json. Usage: python tools/analyze_episode.py <ep>"""
import json, os, re, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srctext

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

PREF = ['gpt-oss-120b', 'llama-4-maverick', 'llama-3.3-70b', 'qwen', 'gpt-oss-20b', 'llama-4-scout', 'llama-3.1-70b', 'llama']
BAD = ('whisper', 'guard', 'tts', 'orpheus', 'embed', 'compound', 'safeguard', 'distil')

def pick_model(key):
    req = urllib.request.Request('https://api.groq.com/openai/v1/models', headers={'Authorization': 'Bearer ' + key, 'User-Agent': 'zarrebin'})
    ids = [m['id'] for m in json.load(urllib.request.urlopen(req, timeout=60))['data'] if not any(b in m['id'].lower() for b in BAD)]
    print('available:', ids)
    for p in PREF:
        for i in ids:
            if p in i.lower(): return i
    return ids[0]

def main(ep, text=None):
    d = f'episodes/{ep}'
    if text is None: text = open(f'{d}/script.txt', encoding='utf8').read().strip()
    cat = load('library/catalog.json', {'items': {}})['items']
    have = {i for i, v in cat.items() if v.get('variants')}
    known = {}
    for w in load('wanted.json', []) + load('generic-pool.json', []): known[w['id']] = w
    for i, v in cat.items(): known.setdefault(i, v)
    key = os.environ.get('GROQ_API_KEY', '')
    if not key: sys.exit('GROQ_API_KEY is not set (repo Settings > Secrets > Actions)')
    system = (
        "You are the art director of an animated explainer video in American comic / pop-art style. "
        "The video is built from layered cut-out sticker objects. Read the narration text (Persian) and list the "
        "concrete, drawable single objects needed to illustrate it: 30 to 45 items, ordered by narration order. "
        "Each item must be ONE physical object or symbol (never a scene, never text, letters or numbers, never a real person's face). "
        "Existing library pictures (id=description). Reuse one only when its description fits the meaning AND this episode's setting (period, place); reuse means no new drawing is needed: " + "; ".join("%s=%s" % (i, str(known[i].get('en', ''))[:60]) for i in sorted(known)) + ". "
        "FIRST read the whole text and decide the episode's setting: the period (year or decade), the place or culture, and what everyday things looked like then. Write it as one English sentence in \"setting\". EVERY item must match this setting: clothing, uniforms, vehicles, weapons, buildings, cities, tools and technology of that time and place (an episode about World War II needs WWII uniforms, tanks and bombed European towns, never modern ones; a medieval episode needs medieval clothes and castles). Only when the narration of a specific item clearly jumps to another time (a flashback, or today) does that item get that other time. For things whose look depends on the era or place, put a short tag in the new id (soldier-ww2, tank-ww2, city-ruins-ww2) so it never collides with the same thing from another period. "
        "Reuse an existing id only when it is the same kind of thing AND from the same era; a specific historical or period figure (e.g. a Roman soldier, a medieval bishop) must get its own new id, never a generic modern person or object id such as adult-male-human. "
        "For anything else invent a new kebab-case English id. "
        "For every item write \"en\" as a detailed English image description of 12 to 25 words: what the object is, its key visual details (material, colour, shape, typical parts) and, in parentheses at the very end, the era it belongs to in this episode's story, decided from the narration, for example (modern, today) or (ancient Rome, 4th century) or (medieval Europe). Say \"male\" or \"female\" for a specific person. The same object can need different eras in different episodes. "
        'Return JSON only: {"setting":"one sentence: period, place, look of everyday things","items":[{"id":"kebab-id","en":"detailed English description ending with the era in parentheses","fa":"نام فارسی کوتاه","why":"چند کلمه فارسی: کجای متن"}]}')
    try: model = pick_model(key)
    except urllib.error.HTTPError as e: sys.exit('Groq error %s: %s' % (e.code, e.read()[:300]))
    print('model:', model)
    msgs = [{'role': 'system', 'content': system}, {'role': 'user', 'content': text[:24000]}]
    res = None
    for fmt in ({'type': 'json_object'}, None):
        payload = {'model': model, 'temperature': 0.3, 'max_completion_tokens': 12000, 'messages': msgs}
        if fmt: payload['response_format'] = fmt
        req = urllib.request.Request('https://api.groq.com/openai/v1/chat/completions', json.dumps(payload).encode(),
                                     {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'zarrebin'})
        try: res = json.load(urllib.request.urlopen(req, timeout=180)); break
        except urllib.error.HTTPError as e: err = 'Groq error %s (%s): %s' % (e.code, model, e.read()[:300])
    if res is None: sys.exit(err)
    content = res['choices'][0]['message']['content']
    items, dec, pos = [], json.JSONDecoder(), 0
    while True:  # lenient: collect every complete {"id":...} object even if the JSON is cut off or malformed
        k = content.find('{', pos)
        if k < 0: break
        try:
            o, end = dec.raw_decode(content, k)
            if isinstance(o, dict) and 'id' in o: items.append(o); pos = end
            else: pos = k + 1
        except ValueError: pos = k + 1
    sm = re.search(r'"setting"\s*:\s*"((?:[^"\\]|\\.)*)"', content)
    setting = ''
    if sm:
        try: setting = json.loads('"' + sm.group(1) + '"').strip()
        except ValueError: setting = sm.group(1).strip()
    out, seen = [], set()
    for it in items:
        i = re.sub(r'[^a-z0-9-]+', '-', str(it.get('id', '')).lower()).strip('-')
        if not i or i in seen: continue
        seen.add(i); k = known.get(i, {})
        out.append({'id': i, 'en': it.get('en') or k.get('en') or i.replace('-', ' '), 'fa': it.get('fa') or k.get('fa', ''),
                    'why': it.get('why', ''), 'tags': []})
    json.dump({'episode': ep, 'src_h': srctext.digest(text), 'setting': setting, 'items': out}, open(f'{d}/needs.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(out), 'items;', sum(1 for o in out if o['id'] not in have), 'missing')

if __name__ == '__main__': main(sys.argv[1])
