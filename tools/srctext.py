"""The text an episode's needs list (needs.json / similar.json), music mood and scene priorities must be made from.
TTS episode: script.txt. Own-voice episode: what was really said (narration.txt written from the recording by narrate_tts.py), else spoken.txt, else script.txt.
needs.json carries 'src_h' = digest of the text it was made from, so a list made from an OLD script can never be mistaken for the current one
(a reused episode folder used to keep showing the previous episode's images)."""
import hashlib, json, os, re

def _load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def _read(p):
    try: return open(p, encoding='utf8').read().strip()
    except Exception: return ''

def source_text(ep):
    d = f'episodes/{ep}'; req = _load(f'{d}/request.json', {})
    if req.get('own_voice'):
        for n in ('narration.txt', 'spoken.txt'):
            t = _read(f'{d}/{n}')
            if len(t) >= 20: return t
    return _read(f'{d}/script.txt')

def digest(text):
    return hashlib.md5(re.sub(r'\s+', ' ', text or '').strip().encode('utf8')).hexdigest()

def needs_current(ep):
    """True when needs.json was made from the episode's current source text"""
    n = _load(f'episodes/{ep}/needs.json', {}) or {}
    return bool(n.get('items')) and n.get('src_h') == digest(source_text(ep))
