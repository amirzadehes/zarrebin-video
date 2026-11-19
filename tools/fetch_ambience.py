"""Download CC0 ambience beds (wind, crowd, fire, rain, ...) from Freesound into ambience/<slug>.mp3 (idempotent).
usage: python tools/fetch_ambience.py        (needs env FREESOUND_API_KEY, a repo Secret)

- Only licence "Creative Commons 0" -> no attribution needed, safe for monetised videos.
- Clips of 20-240 s; each file is cut to at most 120 s (tools/make_ambience.py loops it with cross-fades).
- Files that exist are skipped; ambience_catalog.json records source id, author and licence.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

KEY = os.environ.get('FREESOUND_API_KEY', '').strip()
API = 'https://freesound.org/apiv2/search/text/'
OUT = 'ambience'
CATALOG = 'ambience_catalog.json'
MIN_D, MAX_D, KEEP = 20, 240, 120

# slug -> Freesound search words (slugs are plain English; the app shows Persian names)
WANTED = {
    'wind-cold': 'cold winter wind ambience', 'wind-light': 'light wind breeze ambience', 'wind-desert': 'desert wind ambience',
    'rain-light': 'light rain ambience', 'rain-heavy': 'heavy rain ambience', 'storm-thunder': 'thunderstorm rain thunder ambience',
    'fire-crackle': 'fire crackling fireplace', 'night-crickets': 'night crickets ambience', 'forest-birds': 'forest birds ambience',
    'village-day': 'village ambience birds rooster distance', 'river-stream': 'river stream water ambience', 'sea-waves': 'ocean waves ambience',
    'crowd-murmur': 'crowd murmur ambience', 'market-street': 'market street crowd ambience', 'crowd-hall': 'indoor crowd hall murmur ambience',
    'church-interior': 'church interior ambience reverb', 'church-bells': 'church bells distant', 'room-tone': 'quiet room tone interior',
    'horse-walk': 'horse walking cobblestone', 'army-march': 'army marching soldiers footsteps', 'battlefield': 'battle distant swords crowd ambience',
    'footsteps-snow': 'footsteps in snow', 'city-traffic': 'city traffic ambience', 'cafe': 'cafe restaurant ambience chatter',
    'office': 'office ambience', 'kitchen': 'kitchen cooking ambience', 'train-station': 'train station ambience', 'airport': 'airport terminal ambience',
    'night-city': 'night city ambience distant traffic', 'children-playground': 'children playing playground ambience',
}


def slug_ok(s): return re.fullmatch(r'[a-z0-9-]+', s) is not None


def get_json(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Token ' + KEY, 'User-Agent': 'zarrebin-video'})
    with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)


def search(q):
    params = {'query': q, 'filter': 'license:"Creative Commons 0" duration:[%s TO %s]' % (MIN_D, MAX_D),
              'fields': 'id,name,username,license,duration,previews', 'sort': 'rating_desc', 'page_size': 15}
    return get_json(API + '?' + urllib.parse.urlencode(params)).get('results', [])


def download(url, dest):
    tmp = dest + '.part'
    req = urllib.request.Request(url, headers={'User-Agent': 'zarrebin-video'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r, open(tmp, 'wb') as f: f.write(r.read())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-t', str(KEEP), '-ac', '2', '-ar', '44100', '-b:a', '96k', '-f', 'mp3', dest], check=True)
    finally:
        if os.path.exists(tmp): os.remove(tmp)


def main():
    if not KEY: sys.exit('FREESOUND_API_KEY is missing (repo Secret)')
    os.makedirs(OUT, exist_ok=True)
    try: cat = json.load(open(CATALOG, encoding='utf8'))
    except Exception: cat = {}
    done = skipped = missing = 0
    for slug, q in WANTED.items():
        assert slug_ok(slug), slug
        dest = os.path.join(OUT, slug + '.mp3')
        if os.path.exists(dest): skipped += 1; continue
        try:
            time.sleep(1.1)   # Freesound limit: 60 requests/minute
            res = [r for r in search(q) if r.get('license', '').endswith('/zero/1.0/') and (r.get('previews') or {}).get('preview-hq-mp3')]
            if not res: print('no CC0 result:', slug, '|', q); missing += 1; continue
            r = res[0]; download(r['previews']['preview-hq-mp3'], dest)
            cat[slug] = {'freesound_id': r['id'], 'name': r['name'], 'by': r['username'], 'license': 'CC0', 'seconds': round(min(r['duration'], KEEP), 1), 'query': q}
            done += 1; print('ok', slug, r['id'], round(r['duration'], 1))
        except Exception as e:
            print('failed:', slug, str(e)[:120]); missing += 1
            if os.path.exists(dest): os.remove(dest)
    json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1, sort_keys=True)
    print('new', done, 'already there', skipped, 'missing', missing)


main()
