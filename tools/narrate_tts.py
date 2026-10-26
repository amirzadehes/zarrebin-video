"""Step 1+2: script.txt -> narration.txt (single narrator) -> voice.mp3 + words/sentences timing.
usage: python tools/narrate_tts.py <episode>      writes episodes/<ep>/{narration.txt,voice.mp3,timing.json}"""
import asyncio, hashlib, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import groqlib

VOICES = {'fa': 'fa-IR-FaridNeural', 'de': 'de-DE-ConradNeural', 'en': 'en-US-GuyNeural'}
LANGNAME = {'fa': 'فارسی', 'de': 'آلمانی', 'en': 'انگلیسی'}

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def narrate(ep, req):
    d = f'episodes/{ep}'; out = f'{d}/narration.txt'
    src = open(f'{d}/script.txt', encoding='utf8').read().strip()
    h = hashlib.md5((src + str(req.get('minutes', 7)) + req.get('lang', 'fa')).encode()).hexdigest()
    if os.path.exists(out) and not req.get('renarrate') and load(f'{d}/narration.meta', {}).get('h') == h: return open(out, encoding='utf8').read()
    words = int(req.get('minutes', 7) * 150)
    system = ('تو نویسنده‌ی روایت ویدیوهای توضیحی کوتاه پادکست «ذره‌بین» هستی. متن زیر ممکن است گفتگوی دو نفر یا متن یک پادکست باشد. '
              'آن را به روایت یک نفره‌ی راوی تبدیل کن.\n'
              'قواعد: ۱) لحن صمیمی، روان و محاوره‌ای ولی درست و شسته‌رفته، مثل یک دوست کنجکاو. ۲) جمله‌های کوتاه، حداکثر ۱۸ کلمه؛ هر جمله با نقطه یا علامت سؤال تمام شود. '
              '۳) شروع با یک قلاب جذاب (سؤال یا واقعیت عجیب) در دو جمله‌ی اول. ۴) فقط از اطلاعات متن اصلی استفاده کن و واقعیت تازه نساز. '
              '۵) پایان با جمع‌بندی و یک جمله‌ی دعوت به دنبال کردن ذره‌بین. ۶) طول: نزدیک %d کلمه. ۷) عددها و نام‌ها را طوری بنویس که خواندنشان برای گوینده راحت باشد. '
              '۸) خروجی فقط متن روایت باشد: بدون عنوان، شماره، توضیح یا نشانه‌گذاری فرمت. پاراگراف‌ها را با یک خط خالی جدا کن.' % words)
    if req.get('lang', 'fa') != 'fa':
        system += '\n۹) متن نهایی را به زبان %s بنویس.' % LANGNAME[req['lang']]
    text = groqlib.chat(system, src[:30000], max_tokens=9000, temperature=.5).strip()
    text = re.sub(r'^\s*#+.*$', '', text, flags=re.M).strip()
    open(out, 'w', encoding='utf8').write(text); json.dump({'h': h}, open(f'{d}/narration.meta', 'w')); return text

def split_sentences(text):
    sents = []   # (text, paragraph_break_after)
    for para in [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]:
        para = re.sub(r'\s+', ' ', para)
        parts = [s.strip() for s in re.split(r'(?<=[.!؟?!…])\s+', para) if s.strip()]
        fixed = []
        for s in parts:   # split overly long sentences at commas
            while len(s) > 230:
                cut = max(s.rfind('،', 0, 200), s.rfind(',', 0, 200), s.rfind(' ', 0, 200)); fixed.append(s[:cut + 1].strip()); s = s[cut + 1:].strip()
            fixed.append(s)
        for i, s in enumerate(fixed): sents.append((s, i == len(fixed) - 1))
    return sents

def dur(p):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode().strip())

async def synth(text, voice, rate, path):
    import edge_tts
    for attempt in range(4):
        try:
            try: com = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary')
            except TypeError: com = edge_tts.Communicate(text, voice, rate=rate)
            audio, ev = bytearray(), []
            async for ch in com.stream():
                if ch['type'] == 'audio': audio += ch['data']
                elif ch['type'] == 'WordBoundary': ev.append((ch['offset'] / 1e7, ch['duration'] / 1e7, ch['text']))
            if not audio: raise RuntimeError('empty audio')
            open(path, 'wb').write(bytes(audio)); return ev
        except Exception as e:
            print('tts retry', attempt, e); await asyncio.sleep(2 + attempt * 3)
    sys.exit('edge-tts failed for: ' + text[:60])

def tokens(s): return [w for w in re.split(r'\s+', s.strip()) if re.sub(r'[^\w]', '', w)]

def spread(words, d, lead=.07, tail=.1):
    """proportional word timing inside a sentence of duration d (fallback when TTS gives no word marks)"""
    wts = [len(re.sub(r'[^\w]', '', w)) + 1.5 + (2.5 if re.search(r'[،,؛;:]$', w) else 0) for w in words]
    tot = sum(wts) or 1; span = max(d - lead - tail, .3); t = lead; out = []
    for w, x in zip(words, wts):
        out.append((t, t + span * x / tot)); t += span * x / tot
    return out

async def run(ep):
    d = f'episodes/{ep}'; req = load(f'{d}/request.json', {}); lang = req.get('lang', 'fa')
    text = narrate(ep, req); voice = req.get('voice') or VOICES[lang]; rate = req.get('rate', '+0%')
    sents = split_sentences(text); os.makedirs('tmp_tts', exist_ok=True)
    evs = [None] * len(sents)
    for b in range(0, len(sents), 6):
        res = await asyncio.gather(*[synth(sents[i][0], voice, rate, f'tmp_tts/s{i}.mp3') for i in range(b, min(b + 6, len(sents)))])
        for k, r in enumerate(res): evs[b + k] = r
    lst, t, S, Wd = [], 0.0, [], []
    for i, (s, par) in enumerate(sents):
        subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'tmp_tts/s{i}.mp3', '-ar', '44100', '-ac', '1', f'tmp_tts/s{i}.wav'])
        dd = dur(f'tmp_tts/s{i}.wav'); gap = .55 if par else .22
        toks = tokens(s); ev = evs[i]
        if ev and len(ev) >= max(2, int(len(toks) * .6)) and len(ev) <= len(toks) + 3:
            # map boundary events to our tokens in order
            tt = [(e[0], e[0] + max(e[1], .08)) for e in ev]
            if len(tt) != len(toks):
                tt = [tt[min(int(k * len(tt) / len(toks)), len(tt) - 1)] for k in range(len(toks))]
        else: tt = spread(toks, dd)
        for k, w in enumerate(toks): Wd.append({'w': w, 't0': round(t + tt[k][0], 3), 't1': round(t + min(tt[k][1], dd), 3), 's': i})
        S.append({'i': i, 't0': round(t, 3), 't1': round(t + dd, 3), 'text': s}); lst.append(f'tmp_tts/s{i}.wav'); t += dd
        lst.append(f'tmp_tts/g{i}.wav'); t += gap
    import wave
    with wave.open('tmp_tts/all.wav', 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(44100)
        for p in lst:
            if p.split('/')[-1].startswith('g'):
                out.writeframes(b'\x00\x00' * int(44100 * (.55 if sents[int(re.findall(r'\d+', p)[-1])][1] else .22)))
            else:
                with wave.open(p, 'rb') as w: out.writeframes(w.readframes(w.getnframes()))
    subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'tmp_tts/all.wav', '-c:a', 'libmp3lame', '-b:a', '160k', f'{d}/voice.mp3'])
    json.dump({'sentences': S, 'words': Wd, 'voice_seconds': round(t, 2), 'lang': lang, 'voice': voice}, open(f'{d}/timing.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('sentences', len(S), 'words', len(Wd), 'seconds', round(t, 1), 'wordmarks' if any(evs) else 'estimated timing')

if __name__ == '__main__':
    asyncio.run(run(sys.argv[1]))
