"""Gemini text-to-speech (free tier via Google AI Studio key). No dependencies."""
import base64, io, json, os, re, subprocess, sys, time, urllib.request, urllib.error, wave

URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
MODEL = os.environ.get('GEMINI_TTS_MODEL', 'gemini-3.8-flash-tts')
DEFAULT_STYLE = 'با لحن گرم، صمیمی و روشن یک راوی مستند علمی، با سرعت متوسط و مکث‌های طبیعی بخوان'

def synth(text, voice='Kore', style=DEFAULT_STYLE, out='out.wav', tries=8):
    key = os.environ.get('GEMINI_API_KEY', '')
    if not key: sys.exit('GEMINI_API_KEY is not set (repo Settings > Secrets > Actions)')
    body = {'model': MODEL, 'response_format': {'type': 'audio'},
            'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': text, 'annotations': [{'type': 'speech_metadata', 'style': style}] if style else []}]}],
            'generation_config': {'speech_config': [{'voice': voice}]}}
    if not style: body['input'][0]['content'][0].pop('annotations')
    last = ''
    for k in range(tries):
        req = urllib.request.Request(URL, json.dumps(body).encode(), {'x-goog-api-key': key, 'Content-Type': 'application/json'})
        try:
            r = json.load(urllib.request.urlopen(req, timeout=300))
            auds = [c for s in r.get('steps', []) if s.get('type') == 'model_output' for c in s.get('content', []) if c.get('type') == 'audio']
            if not auds: last = 'no audio in response: ' + json.dumps(r)[:300]; time.sleep(3); continue
            raw = base64.b64decode(auds[-1]['data'])
            if raw[:4] != b'RIFF':   # headerless PCM16 24 kHz mono
                buf = io.BytesIO()
                with wave.open(buf, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(raw)
                raw = buf.getvalue()
            open(out, 'wb').write(raw); return out
        except urllib.error.HTTPError as e:
            b = e.read().decode('utf8', 'ignore'); last = 'HTTP %s %s' % (e.code, b[:300]); print('gemini tts:', last)
            if e.code in (429, 500, 503):
                m = re.search(r'retry in ([\d.]+)s', b) or re.search(r'"retryDelay":\s*"(\d+)s"', b)
                time.sleep(min(float(m.group(1)) + 2 if m else 15 * (k + 1), 90)); continue
            if e.code == 400 and style: print('retrying without style'); body['input'][0]['content'][0].pop('annotations', None); style = None; continue
            break
        except Exception as e:
            last = str(e); time.sleep(5)
    sys.exit('Gemini TTS failed: ' + last)

def silences(path, noise='-34dB', d=.14):
    p = subprocess.run(['ffmpeg', '-i', path, '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', p)]; en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', p)]
    return [((a + b) / 2, b - a) for a, b in zip(st, en)]

def split_sentences_audio(path, texts, outs):
    """cut one chunk wav into per-sentence wavs at the pauses best matching the sentence lengths"""
    with wave.open(path, 'rb') as w: sr, n = w.getframerate(), w.getnframes(); dur = n / sr
    wts = [max(len(re.sub(r'[^\w]', '', t)), 1) + 2 for t in texts]; tot = sum(wts); cut, acc = [], 0
    for x in wts[:-1]: acc += x; cut.append(dur * acc / tot)
    sil = silences(path); b, last = [], 0.0
    for e in cut:
        c = [(abs(m - e), m) for m, d in sil if m > last + .5 and abs(m - e) < max(1.5, dur * .08)]
        t = min(c)[1] if c else e; t = max(t, last + .4); b.append(t); last = t
    edges = [0.0] + b + [dur]
    with wave.open(path, 'rb') as w:
        for i, o in enumerate(outs):
            w.setpos(int(edges[i] * sr)); fr = w.readframes(max(int((edges[i + 1] - edges[i]) * sr), 1))
            with wave.open(o, 'wb') as ow: ow.setnchannels(1); ow.setsampwidth(2); ow.setframerate(sr); ow.writeframes(fr)
    return edges
