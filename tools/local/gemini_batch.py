#!/usr/bin/env python3
"""Overnight picture maker. Runs on YOUR computer (not on GitHub): opens Gemini in a Chrome window, makes every picture an
episode still needs, and sends it to the repo's inbox/ (process-inbox then cuts it out and puts it in the library).

  python gemini_batch.py <episode> [--limit N] [--per-item N] [--pause SEC]

Needs:  pip install playwright     (it drives your installed Google Chrome; nothing else to download)
Optional: environment variable GITHUB_TOKEN (fine-grained token, only this repo, Contents: read & write). Without it the pictures
are only saved in ./gemini_out/ and you can upload them later with the same command (it uploads what is waiting).
The token stays on this computer: never put it in the repo or in a chat.
It never solves captchas and never types a password: if Google asks, it stops and says so."""
import argparse, base64, json, os, random, re, sys, time, urllib.request, urllib.error
from pathlib import Path

REPO = os.environ.get('ZV_REPO', 'amirzadehes/zarrebin-video')
API = os.environ.get('GITHUB_API', 'https://api.github.com')
OUT = Path('gemini_out')

def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

class Stop(Exception): pass

# ---------- repo data ----------
class Src:
    def __init__(self, local): self.local = local
    def text(self, path):
        if self.local: return (Path(self.local) / path).read_text(encoding='utf8')
        u = 'https://raw.githubusercontent.com/%s/main/%s?t=%d' % (REPO, path, time.time())
        return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'zv-local'}), timeout=60).read().decode('utf8')
    def json(self, path): return json.loads(self.text(path))

def template(src):
    m = re.search(r'const VAR_CLAUSE = "((?:[^"\\]|\\.)*)";', src.text('app/index.html'))
    if not m: raise SystemExit('could not find the prompt template (VAR_CLAUSE) in app/index.html')
    return json.loads('"' + m.group(1) + '"')

def todo(src, ep, only):
    needs = src.json('episodes/%s/needs.json' % ep).get('items') or []
    have = {i for i, v in (src.json('library/catalog.json').get('items') or {}).items() if v.get('variants')}
    out = [n for n in needs if n['id'] not in have and re.fullmatch(r'[a-z0-9-]+', n['id'])]
    return [n for n in out if not only or n['id'] in only]

# ---------- upload ----------
def sniff(b):
    if b[:8] == b'\x89PNG\r\n\x1a\n': return 'png'
    if b[:3] == b'\xff\xd8\xff': return 'jpg'
    if b[:4] == b'RIFF' and b[8:12] == b'WEBP': return 'webp'
    return None

def upload_pending(token):
    if not token: return
    for f in sorted(OUT.glob('*__*.*')):
        if not f.is_file(): continue
        iid = f.name.split('__')[0]; name = 'inbox/%s__%s%s.%s' % (iid, time.strftime('%y%m%d%H%M%S'), random.randrange(100, 999), f.suffix[1:])
        body = json.dumps({'message': 'inbox: ' + name[6:], 'content': base64.b64encode(f.read_bytes()).decode(), 'branch': 'main'}).encode()
        for k in range(4):
            req = urllib.request.Request('%s/repos/%s/contents/%s' % (API, REPO, name), body, {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'zv-local'}, method='PUT')
            try: urllib.request.urlopen(req, timeout=120); break
            except urllib.error.HTTPError as e:
                if e.code in (401, 403, 404): raise Stop('GitHub refused the upload (HTTP %d): check GITHUB_TOKEN and its repo access' % e.code)
                if k == 3 or e.code not in (409, 422, 502, 503): log('upload failed for', f.name, e.code); name = None; break
                time.sleep(2 * (k + 1))
        if name:
            (OUT / 'uploaded').mkdir(exist_ok=True); f.rename(OUT / 'uploaded' / f.name); log('uploaded', f.name); time.sleep(1)

# ---------- Gemini ----------
INPUTS = ['rich-textarea div[contenteditable="true"]', 'div[role="textbox"]', 'div.ql-editor', 'div[contenteditable="true"]', 'textarea']
IMGS = "() => [...document.images].filter(i => i.complete && i.naturalWidth >= 512 && i.naturalHeight >= 512).map(i => ({src: i.currentSrc || i.src, a: i.naturalWidth * i.naturalHeight}))"
LIMIT = re.compile(r'limit|quota|too many|come back|später|Limit|Tageslimit|erreicht', re.I)
GUARD = re.compile(r'unusual traffic|captcha|not a robot|verify it.?s you|ungewöhnlichen Datenverkehr|Bestätige, dass du', re.I)

def check_state(page):
    if 'accounts.google.com' in page.url: raise Stop('Google asks you to sign in. Run once with the window visible, sign in, then start again.')
    try: body = page.inner_text('body', timeout=3000)
    except Exception: return ''
    if GUARD.search(body): raise Stop('Google shows a verification page. Solve it yourself in the window, then start again.')
    return body

def send(page, prompt):
    for sel in INPUTS:
        loc = page.locator(sel).first
        try: loc.wait_for(state='visible', timeout=8000)
        except Exception: continue
        loc.click(); page.keyboard.insert_text(prompt); time.sleep(.6); page.keyboard.press('Enter'); return
    raise Stop('could not find the Gemini prompt box (the page layout may have changed)')

def wait_image(page, before, timeout):
    t0 = time.time(); last = None
    while time.time() - t0 < timeout:
        time.sleep(2); check_state(page)
        new = [i for i in page.evaluate(IMGS) if i['src'] not in before]
        if new:
            time.sleep(4); new = [i for i in page.evaluate(IMGS) if i['src'] not in before] or new
            return max(new, key=lambda i: i['a'])['src']
    return None

def get_bytes(page, src):
    if src.startswith(('blob:', 'data:')):
        b64 = page.evaluate("async u => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s=''; for (let i=0;i<b.length;i+=32768) s+=String.fromCharCode.apply(null,b.subarray(i,i+32768)); return btoa(s) }", src)
        return base64.b64decode(b64)
    return page.context.request.get(src).body()

def make_one(page, url, prompt, timeout):
    for attempt, text in enumerate((prompt, 'Generate an image: ' + prompt)):
        page.goto(url, wait_until='domcontentloaded'); time.sleep(4); check_state(page)
        before = {i['src'] for i in page.evaluate(IMGS)}
        send(page, text)
        src = wait_image(page, before, timeout)
        if src: return get_bytes(page, src)
        body = check_state(page)
        if LIMIT.search(body[-1500:]): raise Stop('Gemini seems to say a limit is reached; stopping. Start again later. Last text: ' + body[-200:].replace('\n', ' '))
        log('no picture after %ds (attempt %d)' % (timeout, attempt + 1))
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('episode'); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--per-item', type=int, default=1)
    ap.add_argument('--pause', type=int, default=30, help='seconds to wait between pictures (a random +-30%% is added)'); ap.add_argument('--timeout', type=int, default=240)
    ap.add_argument('--ids', default='', help='only these ids, comma separated'); ap.add_argument('--profile', default='gemini-profile'); ap.add_argument('--chrome-path', default='')
    ap.add_argument('--headless', action='store_true', help=argparse.SUPPRESS); ap.add_argument('--url', default='https://gemini.google.com/app'); ap.add_argument('--local-repo', default='', help='read needs/catalog/template from a local checkout instead of GitHub')
    a = ap.parse_args()
    if os.name == 'nt':
        try: import ctypes; ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)   # keep the computer awake while this runs
        except Exception: pass
    from playwright.sync_api import sync_playwright
    OUT.mkdir(exist_ok=True); token = os.environ.get('GITHUB_TOKEN', '')
    if not token: log('GITHUB_TOKEN is not set: pictures are only saved in', OUT.resolve())
    src = Src(a.local_repo); tpl = template(src); items = todo(src, a.episode, {x for x in a.ids.split(',') if x})
    if a.limit: items = items[:a.limit]
    log('%d picture(s) to make for %s' % (len(items) * a.per_item, a.episode)); made = failed = 0
    try:
        upload_pending(token)
        with sync_playwright() as p:
            kw = {'executable_path': a.chrome_path} if a.chrome_path else {'channel': 'chrome'}
            ctx = p.chromium.launch_persistent_context(a.profile, headless=a.headless, viewport={'width': 1280, 'height': 900}, **kw)
            page = ctx.pages[0] if ctx.pages else ctx.new_page(); page.goto(a.url, wait_until='domcontentloaded'); time.sleep(4)
            if 'accounts.google.com' in page.url and sys.stdin.isatty(): input('Sign in to Google in the opened window, then press Enter here... ')
            consecutive = 0
            for n, it in enumerate(items):
                for v in range(a.per_item):
                    prompt = tpl.replace('{subject}', it['en']); log('[%d/%d] %s (%d/%d)' % (n + 1, len(items), it['id'], v + 1, a.per_item))
                    data = make_one(page, a.url, prompt, a.timeout)
                    ext = sniff(data) if data else None
                    if not ext:
                        failed += 1; consecutive += 1; log('failed:', it['id'])
                        if consecutive >= 3: raise Stop('3 failures in a row; stopping')
                        continue
                    consecutive = 0; made += 1
                    (OUT / ('%s__%s%d.%s' % (it['id'], time.strftime('%y%m%d%H%M%S'), v, ext))).write_bytes(data)
                    upload_pending(token)
                    time.sleep(a.pause * random.uniform(.7, 1.3))
            ctx.close()
    except Stop as e: log('STOPPED:', e)
    log('done: %d made, %d failed. Files waiting in %s: %d' % (made, failed, OUT, len([f for f in OUT.glob('*__*.*') if f.is_file()])))

if __name__ == '__main__': main()
