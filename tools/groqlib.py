"""Tiny Groq client (no dependencies): model auto-pick, retries on rate limits, lenient JSON extraction."""
import json, os, re, sys, time, urllib.request, urllib.error

PREF = ['gpt-oss-120b', 'llama-4-maverick', 'llama-3.3-70b', 'qwen', 'gpt-oss-20b', 'llama-4-scout', 'llama-3.1-70b', 'llama']
BAD = ('whisper', 'guard', 'tts', 'orpheus', 'embed', 'compound', 'safeguard', 'distil')
API = 'https://api.groq.com/openai/v1'
_model = None
_bad = set()   # models whose daily/long rate limit is used up; each Groq model has its own quota

def _req(path, payload=None):
    key = os.environ.get('GROQ_API_KEY', '')
    if not key: sys.exit('GROQ_API_KEY is not set (repo Settings > Secrets > Actions)')
    r = urllib.request.Request(API + path, json.dumps(payload).encode() if payload else None,
                               {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'zarrebin'})
    return json.load(urllib.request.urlopen(r, timeout=300))

def model():
    global _model
    if _model: return _model
    ids = [m['id'] for m in _req('/models')['data'] if not any(b in m['id'].lower() for b in BAD)]
    ids = [i for i in ids if i not in _bad]
    if not ids: sys.exit('Groq: every model has hit its rate limit; try again later')
    for p in PREF:
        for i in ids:
            if p in i.lower(): _model = i; print('model:', i); return i
    _model = ids[0]; return _model

def chat(system, user, max_tokens=4000, json_mode=False, temperature=.3, tries=7):
    global _model
    effort = True
    msgs = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]
    last = ''
    for k in range(tries):
        payload = {'model': model(), 'temperature': temperature, 'max_completion_tokens': max_tokens, 'messages': msgs}
        if json_mode: payload['response_format'] = {'type': 'json_object'}
        if effort and 'gpt-oss' in model(): payload['reasoning_effort'] = 'low'
        try: return _req('/chat/completions', payload)['choices'][0]['message']['content']
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf8', 'ignore'); last = 'HTTP %s %s' % (e.code, body[:300])
            if e.code == 400 and 'reasoning' in body.lower() and effort: effort = False; continue
            if e.code == 400 and json_mode: json_mode = False; continue
            if e.code in (429, 500, 502, 503):
                m = re.search(r'try again in ([\d.]+)(ms|s|m)', body); w = 20 * (k + 1)
                if m: w = float(m.group(1)) * {'ms': .001, 's': 1, 'm': 60}[m.group(2)] + 2
                if w > 60 or 'per day' in body.lower():
                    print('model %s is rate limited for a long time (%.0fs): switching model' % (model(), w))
                    _bad.add(_model); _model = None; continue
                print('rate limited, waiting %.0fs' % w); time.sleep(min(w, 120)); continue
            sys.exit('Groq error ' + last)
    sys.exit('Groq failed: ' + last)

def objects(content, key='id'):
    """every complete JSON object containing `key`, even if the surrounding JSON is cut off"""
    items, dec, pos = [], json.JSONDecoder(), 0
    while True:
        k = content.find('{', pos)
        if k < 0: break
        try:
            o, end = dec.raw_decode(content, k)
            if isinstance(o, dict) and key in o: items.append(o); pos = end
            else: pos = k + 1
        except ValueError: pos = k + 1
    return items
