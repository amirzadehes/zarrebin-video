"""Exact word timing: Groq Whisper (word timestamps) on the final voice file, aligned to OUR text.
The subtitle words stay exactly as written in narration.txt; only their times come from Whisper."""
import difflib, json, os, re, sys, uuid, urllib.request, urllib.error

URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

def norm(s):
    s = s.replace('ي', 'ی').replace('ك', 'ک').replace('‌', '').replace('‏', '').replace('ۀ', 'ه').replace('ة', 'ه')
    s = re.sub(r'[ً-ٰٟ]', '', s)
    return re.sub(r'[^\w]', '', s.lower())

def whisper_words(path, lang='fa', model='whisper-large-v3'):
    key = os.environ.get('GROQ_API_KEY', ''); boundary = uuid.uuid4().hex
    fields = [('model', model), ('response_format', 'verbose_json'), ('timestamp_granularities[]', 'word'), ('language', lang), ('temperature', '0')]
    body = b''
    for k, v in fields: body += ('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (boundary, k, v)).encode()
    body += ('--%s\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n' % boundary).encode() + open(path, 'rb').read() + ('\r\n--%s--\r\n' % boundary).encode()
    for attempt in range(5):
        req = urllib.request.Request(URL, body, {'Authorization': 'Bearer ' + key, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'User-Agent': 'zarrebin'})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=600)); return [(w['word'], float(w['start']), float(w['end'])) for w in r.get('words', [])]
        except urllib.error.HTTPError as e:
            b = e.read().decode('utf8', 'ignore'); print('whisper HTTP', e.code, b[:200])
            if e.code in (429, 500, 503): import time; time.sleep(20 * (attempt + 1)); continue
            return []
        except Exception as e: print('whisper error', e); return []
    return []

def sim(a, b):
    if not a or not b: return -1
    if a == b: return 1.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    return r if r >= .5 else -.4

def align(ours, heard, band=80):
    """Needleman-Wunsch (banded). returns for each of our words an index into `heard` or None"""
    n, m = len(ours), len(heard); A = [norm(w) for w in ours]; Bn = [norm(w[0]) for w in heard]; G = -.5
    NEG = -1e9; sc = [[NEG] * (m + 1) for _ in range(n + 1)]; bk = [[0] * (m + 1) for _ in range(n + 1)]
    sc[0][0] = 0
    for i in range(n + 1):
        c = int(i * m / max(n, 1)); lo, hi = max(0, c - band), min(m, c + band)
        for j in range(lo, hi + 1):
            if i == 0 and j == 0: continue
            best, mv = NEG, 0
            if i and j and sc[i - 1][j - 1] > NEG: v = sc[i - 1][j - 1] + sim(A[i - 1], Bn[j - 1]); best, mv = v, 1
            if i and sc[i - 1][j] > NEG and sc[i - 1][j] + G > best: best, mv = sc[i - 1][j] + G, 2
            if j and sc[i][j - 1] > NEG and sc[i][j - 1] + G > best: best, mv = sc[i][j - 1] + G, 3
            sc[i][j], bk[i][j] = best, mv
    out = [None] * n; i, j = n, m
    while i > 0 or j > 0:
        mv = bk[i][j]
        if mv == 1:
            if sim(A[i - 1], Bn[j - 1]) > 0: out[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif mv == 2: i -= 1
        elif mv == 3: j -= 1
        else: break
    return out

def refine(voice_path, words, total, lang='fa'):
    """words: list of {'w','t0','t1','s'} with estimated times. Returns (words, matched_fraction)."""
    heard = whisper_words(voice_path, lang)
    if len(heard) < max(5, len(words) * .3): print('whisper gave too little, keeping estimated timing'); return words, 0.0
    idx = align([w['w'] for w in words], heard); got = sum(1 for k in idx if k is not None)
    t0 = [heard[k][1] if k is not None else None for k in idx]; t1 = [heard[k][2] if k is not None else None for k in idx]
    n = len(words); i = 0
    while i < n:   # interpolate runs of unmatched words between matched neighbours
        if t0[i] is not None: i += 1; continue
        j = i
        while j < n and t0[j] is None: j += 1
        a = t1[i - 1] if i > 0 else 0.0; b = t0[j] if j < n else total
        wts = [len(norm(words[k]['w'])) + 1 for k in range(i, j)]; tot = sum(wts); acc = a
        for k, x in zip(range(i, j), wts):
            d = max(b - a, .05) * x / tot; t0[k], t1[k] = acc, acc + d; acc += d
        i = j
    prev = 0.0
    for k in range(n):   # enforce monotonic, non-overlapping times
        t0[k] = max(t0[k], prev); t1[k] = max(t1[k], t0[k] + .05); prev = t0[k]
        words[k]['t0'] = round(t0[k], 3); words[k]['t1'] = round(min(t1[k], total), 3)
    return words, got / max(n, 1)

if __name__ == '__main__':   # offline self-test with a fake recognizer
    ours = 'می‌خوام یه چیزی بهتون بگم که اومد خونه'.split(); heard = [('میخواهم', 0, .5), ('یک', .5, .7), ('چیزی', .7, 1.1), ('بهتون', 1.1, 1.5), ('بگم', 1.5, 1.9), ('که', 1.9, 2.0), ('آمد', 2.0, 2.4), ('خانه', 2.4, 3.0)]
    print(align(ours, heard))
