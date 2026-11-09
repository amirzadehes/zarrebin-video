"""Download short CC0 sound effects from Freesound into sfx/<slug>.mp3 (idempotent).
usage: python tools/fetch_sfx.py            (needs env FREESOUND_API_KEY, set as a repo Secret)

- Only licence "Creative Commons 0" -> no attribution needed, safe for monetised videos.
- Only clips of 0.3-3.5 s (tools/make_sfx.py cuts clips at 3.5 s anyway).
- The file NAME is what tools/make_sfx.py uses to match a sound to an on-screen object, so slugs are plain English.
- Files that already exist are skipped; the catalog (sfx_catalog.json, kept OUTSIDE sfx/ because make_sfx.py reads
  every file in sfx/) records source id, author and licence of every downloaded sound.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

KEY = os.environ.get('FREESOUND_API_KEY', '').strip()
API = 'https://freesound.org/apiv2/search/text/'
OUT = 'sfx'
CATALOG = 'sfx_catalog.json'
MIN_D, MAX_D = .3, 3.5

# slug -> Freesound search words
WANTED = {
    # camera / media
    'camera-shutter': 'camera shutter click', 'camera-flash': 'camera flash photo', 'photo-print': 'polaroid photo print',
    'page-turn': 'page turn paper', 'paper-crumple': 'paper crumple', 'paper-rip': 'paper tear rip', 'typewriter': 'typewriter key',
    'stamp': 'rubber stamp', 'pen-click': 'pen click', 'marker-write': 'marker writing',
    # crowd
    'applause': 'applause clapping crowd', 'cheering-crowd': 'crowd cheering hooray', 'crowd-gasp': 'crowd gasp', 'crowd-laugh': 'crowd laughing',
    'crowd-boo': 'crowd boo', 'crowd-ooh': 'crowd ooh', 'crowd-murmur': 'crowd murmur', 'kids-cheer': 'kids cheering', 'whistle-cheer': 'crowd whistle cheer',
    'clap-single': 'single hand clap', 'finger-snap': 'finger snap', 'stadium-roar': 'stadium crowd roar',
    # transitions / motion
    'whoosh-short': 'whoosh short', 'whoosh-long': 'whoosh swoosh long', 'swipe': 'swipe air', 'fast-pass': 'fast pass by whoosh',
    'zoom-in': 'zoom in sweep', 'riser': 'riser build up', 'impact-hit': 'cinematic impact hit', 'bass-drop': 'bass drop boom',
    'rewind': 'tape rewind', 'record-scratch': 'record scratch', 'glitch': 'digital glitch', 'pop-bubble': 'bubble pop',
    # interface
    'click': 'ui click', 'button-press': 'button press', 'switch-toggle': 'switch toggle', 'notification': 'notification ping', 'bell-ding': 'bell ding',
    'message-pop': 'message pop', 'keyboard-typing': 'keyboard typing', 'mouse-click': 'mouse click', 'error-buzz': 'error buzzer', 'level-up': 'level up',
    # feelings / results
    'success-chime': 'success chime', 'win-fanfare': 'win fanfare short', 'fail-trombone': 'sad trombone fail', 'wrong-answer': 'wrong answer buzz',
    'correct-answer': 'correct answer ding', 'surprise': 'surprise sting', 'suspense': 'suspense sting', 'tension-hit': 'tension hit',
    'magic-sparkle': 'magic sparkle', 'coin': 'coin collect', 'cash-register': 'cash register', 'money-counting': 'counting money bills',
    # impacts / objects
    'door-knock': 'door knock', 'door-close': 'door close', 'door-creak': 'door creak', 'glass-break': 'glass break', 'metal-clang': 'metal clang',
    'wood-knock': 'wood knock', 'box-drop': 'cardboard box drop', 'book-drop': 'book drop', 'heavy-thud': 'heavy thud', 'punch': 'punch hit',
    'slap': 'slap', 'splash': 'water splash', 'water-drip': 'water drip', 'water-pour': 'water pour', 'balloon-pop': 'balloon pop', 
    'keys-jingle': 'keys jingle', 'zipper': 'zipper', 'scissors': 'scissors cut', 'tape-rip': 'tape rip', 
    # tech / office
    'phone-ring': 'phone ring', 'phone-vibrate': 'phone vibrate', 'camera-beep': 'camera beep focus', 'printer': 'printer printing', 
    'clock-tick': 'clock tick', 'alarm-clock': 'alarm clock', 'timer-ding': 'timer ding', 'stopwatch': 'stopwatch click', 
    'siren': 'police siren short', 'car-horn': 'car horn', 'engine-start': 'car engine start',
    'car-brake': 'car brake screech', 
    # human / animals
    'footsteps': 'footsteps', 'heartbeat': 'heartbeat', 'sigh': 'sigh', 'cough': 'cough', 'sneeze': 'sneeze', 'gulp': 'gulp swallow',
    'laugh-short': 'short laugh', 'baby-giggle': 'baby giggle', 'dog-bark': 'dog bark', 'cat-meow': 'cat meow', 'rooster': 'rooster crow', 'bird-chirp': 'bird chirp',
    # nature
    'thunder': 'thunder', 
}


def slug_ok(s): return re.fullmatch(r'[a-z0-9-]+', s) is not None


def get_json(url):
    req = urllib.request.Request(url, headers={'Authorization': 'Token ' + KEY, 'User-Agent': 'zarrebin-video'})
    with urllib.request.urlopen(req, timeout=40) as r: return json.load(r)


def search(q):
    params = {
        'query': q,
        'filter': 'license:"Creative Commons 0" duration:[%s TO %s]' % (MIN_D, MAX_D),
        'fields': 'id,name,username,license,duration,previews,avg_rating,num_ratings',
        'sort': 'rating_desc', 'page_size': 15,
    }
    return get_json(API + '?' + urllib.parse.urlencode(params)).get('results', [])


def download(url, dest):
    tmp = dest + '.part'
    req = urllib.request.Request(url, headers={'User-Agent': 'zarrebin-video'})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, 'wb') as f: f.write(r.read())
    # normalise to mono mp3 and check the result is decodable
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', '44100', '-b:a', '128k', '-f', 'mp3', dest], check=True)
    os.remove(tmp)


def main():
    if not KEY: sys.exit('FREESOUND_API_KEY is missing (repo Secret)')
    os.makedirs(OUT, exist_ok=True)
    try: cat = json.load(open(CATALOG, encoding='utf8'))
    except Exception: cat = {}
    done = skipped = missing = 0
    for slug, q in WANTED.items():
        assert slug_ok(slug), slug
        dest = os.path.join(OUT, slug + '.mp3')
        if os.path.exists(dest):
            skipped += 1; continue
        try:
            time.sleep(1.1)  # Freesound limit: 60 requests/minute
            res = [r for r in search(q) if r.get('license', '').endswith('/zero/1.0/') and (r.get('previews') or {}).get('preview-hq-mp3')]
            if not res: print('no CC0 result:', slug, '|', q); missing += 1; continue
            r = res[0]
            download(r['previews']['preview-hq-mp3'], dest)
            cat[slug] = {'freesound_id': r['id'], 'name': r['name'], 'by': r['username'], 'license': 'CC0', 'seconds': round(r['duration'], 2), 'query': q}
            done += 1; print('ok', slug, r['id'], round(r['duration'], 1))
        except Exception as e:
            print('failed:', slug, str(e)[:120]); missing += 1
            if os.path.exists(dest): os.remove(dest)
    json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1, sort_keys=True)
    print('new', done, 'already there', skipped, 'missing', missing)


main()
