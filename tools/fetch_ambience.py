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
MIN_D, MAX_D, KEEP = 20, 240, 90
BUDGET = float(os.environ.get('FETCH_BUDGET', '1500'))   # seconds; the workflow commits what it has and is run again for the rest

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
WANTED.update({
    'wind-howling': 'howling wind storm ambience',
    'wind-trees': 'wind in trees leaves ambience',
    'mountain-wind': 'mountain wind high altitude ambience',
    'rain-window': 'rain on window ambience',
    'rain-roof': 'rain on roof ambience',
    'thunder-distant': 'distant thunder rumble',
    'snow-blizzard': 'blizzard snow storm wind',
    'cave-drips': 'cave water drips reverb ambience',
    'waterfall': 'waterfall ambience',
    'beach-calm': 'calm beach gentle waves ambience',
    'harbor': 'harbor port boats ambience seagulls',
    'ship-creak': 'wooden ship creaking ambience',
    'underwater': 'underwater ambience',
    'forest-night': 'forest night ambience',
    'owl-night': 'owl night ambience',
    'wolf-distant': 'wolf howl distant ambience',
    'birds-morning': 'morning birds dawn chorus',
    'rooster-farm': 'rooster farm morning ambience',
    'dogs-distant': 'distant dogs barking ambience',
    'jungle': 'jungle rainforest ambience',
    'frogs-swamp': 'frogs swamp night ambience',
    'insects-summer': 'summer insects cicadas ambience',
    'desert-night': 'desert night ambience quiet',
    'horse-gallop': 'horse galloping',
    'carriage': 'horse carriage cart wheels cobblestone',
    'sword-clash': 'sword fight clashing metal',
    'crowd-cheering': 'crowd cheering roar',
    'crowd-angry': 'angry crowd protest shouting',
    'crowd-whisper': 'crowd whispering murmur indoor',
    'applause': 'applause audience clapping',
    'bazaar-oriental': 'middle eastern bazaar market ambience',
    'temple-interior': 'temple interior ambience reverb',
    'stone-hall': 'large stone hall ambience reverb',
    'dungeon': 'dungeon dark ambience dripping',
    'chains': 'chains rattling metal ambience',
    'clock-ticking': 'clock ticking room ambience',
    'heartbeat': 'heartbeat slow',
    'campfire-night': 'campfire night crackling ambience',
    'blacksmith': 'blacksmith forge hammering ambience',
    'workshop': 'workshop tools ambience',
    'construction': 'construction site ambience',
    'factory': 'factory machinery ambience',
    'machine-hum': 'machine hum drone industrial',
    'server-hum': 'server room hum ambience',
    'air-conditioner': 'air conditioner hum room',
    'fan-room': 'fan whirring room ambience',
    'car-interior': 'car interior driving ambience',
    'train-ride': 'train ride interior ambience',
    'subway': 'subway metro station ambience',
    'plane-cabin': 'airplane cabin ambience',
    'siren-distant': 'distant siren city ambience',
    'city-morning': 'city morning ambience birds traffic',
    'rain-city': 'rain city street ambience',
    'hospital': 'hospital ambience',
    'school-hall': 'school hallway ambience',
    'library': 'library ambience quiet',
    'bar-pub': 'bar pub ambience chatter',
    'stadium': 'stadium crowd ambience',
    'space-hum': 'space ambience drone deep',
    'scifi-drone': 'sci-fi ambience drone spaceship',
    'tension-drone': 'dark tension drone ambience',
    'wind-chimes': 'wind chimes ambience',
    'street-night': 'night street ambience quiet',
    'lab': 'laboratory ambience electronic hum',
})
VARIANTS = 3   # topic, topic-2, topic-3: different recordings of the same sound (new topics 2)
FEW = ['air-conditioner', 'applause', 'bar-pub', 'bazaar-oriental', 'beach-calm', 'birds-morning', 'blacksmith', 'campfire-night', 'car-interior', 'carriage', 'cave-drips', 'chains', 'city-morning', 'clock-ticking', 'construction', 'crowd-angry', 'crowd-cheering', 'crowd-whisper', 'desert-night', 'dogs-distant', 'dungeon', 'factory', 'fan-room', 'forest-night', 'frogs-swamp', 'harbor', 'heartbeat', 'horse-gallop', 'hospital', 'insects-summer', 'jungle', 'lab', 'library', 'machine-hum', 'mountain-wind', 'owl-night', 'plane-cabin', 'rain-city', 'rain-roof', 'rain-window', 'rooster-farm', 'school-hall', 'scifi-drone', 'server-hum', 'ship-creak', 'siren-distant', 'snow-blizzard', 'space-hum', 'stadium', 'stone-hall', 'street-night', 'subway', 'sword-clash', 'temple-interior', 'tension-drone', 'thunder-distant', 'train-ride', 'underwater', 'waterfall', 'wind-chimes', 'wind-howling', 'wind-trees', 'wolf-distant', 'workshop']


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


def measure(path):
    """integrated loudness (LUFS) of a file; the in-app preview needs it to play each bed at the level of the final mix"""
    r = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    return round(float(m[-1]), 1) if m else None


def backfill(cat):
    n = 0
    for slug, v in cat.items():
        f = os.path.join(OUT, slug + '.mp3')
        if v.get('lufs') is None and os.path.exists(f):
            l = measure(f)
            if l is not None and l > -70: v['lufs'] = l; n += 1
    return n


def main():
    os.makedirs(OUT, exist_ok=True)
    t_start = time.time()
    try: cat = json.load(open(CATALOG, encoding='utf8'))
    except Exception: cat = {}
    nb = backfill(cat)
    if nb: print('loudness measured for', nb, 'existing beds')
    def save(): json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1, sort_keys=True)
    if nb: save()
    if not KEY: sys.exit('FREESOUND_API_KEY is missing (repo Secret)') if not nb else sys.exit(0)
    done = skipped = missing = 0; stopped = False
    for base, q in WANTED.items():
        assert slug_ok(base), base
        n = 2 if base in FEW else VARIANTS
        slugs = [base] + [f'{base}-{k}' for k in range(2, n + 1)]
        need = [x for x in slugs if not os.path.exists(os.path.join(OUT, x + '.mp3'))]
        if not need: skipped += len(slugs); continue
        if time.time() - t_start > BUDGET: stopped = True; break
        try:
            time.sleep(1.1)   # Freesound limit: 60 requests/minute
            res = [r for r in search(q) if r.get('license', '').endswith('/zero/1.0/') and (r.get('previews') or {}).get('preview-hq-mp3')]
            used = {v.get('freesound_id') for v in cat.values()}
            res = [r for r in res if r['id'] not in used]
            if not res: print('no CC0 result:', base, '|', q); missing += 1; continue
            for slug, r in zip(need, res):
                dest = os.path.join(OUT, slug + '.mp3')
                try:
                    download(r['previews']['preview-hq-mp3'], dest)
                    cat[slug] = {'freesound_id': r['id'], 'name': r['name'], 'by': r['username'], 'license': 'CC0', 'seconds': round(min(r['duration'], KEEP), 1), 'query': q, 'lufs': measure(dest)}
                    done += 1; print('ok', slug, r['id'], round(r['duration'], 1))
                except Exception as e:
                    print('failed:', slug, str(e)[:120]); missing += 1
                    if os.path.exists(dest): os.remove(dest)
        except Exception as e:
            print('failed search:', base, str(e)[:120]); missing += 1
        save()
    save()
    print('new', done, 'already there', skipped, 'missing', missing, '| time budget used up, run again for the rest' if stopped else '| all topics visited')


main()
