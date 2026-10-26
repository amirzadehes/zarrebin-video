"""Reads episodes/<ep>/script.txt, asks Groq which sticker objects the episode needs,
writes episodes/<ep>/needs.json. Usage: python tools/analyze_episode.py <ep>"""
import json, os, re, sys, urllib.request, urllib.error

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def main(ep):
    d = f'episodes/{ep}'
    text = open(f'{d}/script.txt', encoding='utf8').read().strip()
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
        "Prefer these existing ids when they fit the meaning (reuse = no new drawing needed): " + ", ".join(sorted(known)) + ". "
        "For anything else invent a new kebab-case English id. "
        'Return JSON only: {"items":[{"id":"kebab-id","en":"short English description for an image prompt, single object","fa":"نام فارسی کوتاه","why":"چند کلمه فارسی: کجای متن"}]}')
    body = json.dumps({'model': 'llama-3.3-70b-versatile', 'temperature': 0.3, 'response_format': {'type': 'json_object'},
                       'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': text[:24000]}]}).encode()
    req = urllib.request.Request('https://api.groq.com/openai/v1/chat/completions', body,
                                 {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'zarrebin'})
    try: res = json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e: sys.exit('Groq error %s: %s' % (e.code, e.read()[:400]))
    items = json.loads(res['choices'][0]['message']['content']).get('items', [])
    out, seen = [], set()
    for it in items:
        i = re.sub(r'[^a-z0-9-]+', '-', str(it.get('id', '')).lower()).strip('-')
        if not i or i in seen: continue
        seen.add(i); k = known.get(i, {})
        out.append({'id': i, 'en': it.get('en') or k.get('en') or i.replace('-', ' '), 'fa': it.get('fa') or k.get('fa', ''),
                    'why': it.get('why', ''), 'tags': []})
    json.dump({'episode': ep, 'items': out}, open(f'{d}/needs.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(out), 'items;', sum(1 for o in out if o['id'] not in have), 'missing')

if __name__ == '__main__': main(sys.argv[1])
