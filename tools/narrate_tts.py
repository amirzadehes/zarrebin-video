"""Step 1+2: script.txt -> narration.txt (single narrator) -> voice.mp3 + words/sentences timing.
usage: python tools/narrate_tts.py <episode>      writes episodes/<ep>/{narration.txt,voice.mp3,timing.json}"""
import asyncio, hashlib, json, os, re, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(__file__))
import groqlib

NARR_V = 'colloquial-2'
VOICES = {'fa': 'fa-IR-FaridNeural', 'de': 'de-DE-ConradNeural', 'en': 'en-US-GuyNeural'}
LANGNAME = {'fa': 'فارسی', 'de': 'آلمانی', 'en': 'انگلیسی'}

def load(p, d):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return d

def narrate(ep, req):
    d = f'episodes/{ep}'; out = f'{d}/narration.txt'
    src = open(f'{d}/script.txt', encoding='utf8').read().strip()
    h = hashlib.md5((NARR_V + src + str(req.get('minutes', 7)) + req.get('lang', 'fa')).encode()).hexdigest()
    if os.path.exists(out) and not req.get('renarrate') and load(f'{d}/narration.meta', {}).get('h') == h: return open(out, encoding='utf8').read()
    words = int(req.get('minutes', 7) * 150)
    system = ('تو نویسنده‌ی روایت ویدیوهای توضیحی کوتاه پادکست «ذره‌بین» هستی. متن زیر ممکن است گفتگوی دو نفر یا متن یک پادکست باشد. '
              'آن را به روایت یک نفره‌ی راوی تبدیل کن.\n'
              'مهم‌ترین قانون: زبان باید «محاوره‌ای تهرانی، خودمونی و دوستانه» باشد، دقیقاً همان‌طور که یک دوست صمیمی حرف می‌زند، نه کتابی و نه رسمی. '
              'یعنی همه‌ی کلمه‌ها را همان‌طور که تلفظ می‌شوند بنویس: «است» → «هست» یا «ـه» (خوبه، همینه)، «آمد» → «اومد»، «می‌آید» → «میاد»، «می‌شود» → «می‌شه»، «می‌کند» → «می‌کنه»، «دارد» → «داره»، '
              '«می‌خواهم» → «می‌خوام»، «نمی‌دانم» → «نمی‌دونم»، «نان» → «نون»، «خانه» → «خونه»، «کوچک» → «کوچیک»، «بسیار» → «خیلی»، «اما» → «ولی»، «زیرا» → «چون»، «بنابراین» → «پس»، «چنانچه» → «اگه»، «یک» → «یه»، '
              '«را» → «رو»، «در» → «تو» یا «توی»، «با او» → «باهاش»، «به او» → «بهش»، «این‌گونه» → «اینجوری»، «چطور» → «چجوری» یا «چطور». هیچ کلمه‌ی کتابی مثل «نمودن، گردید، لذا، همچنین، مذکور، بدین‌سان، ایشان» نباید بیاید. '
              'مثل یک دوست مستقیم با شنونده حرف بزن و او را «تو» خطاب کن (می‌دونی؟ فکر کن!). لحنت کنجکاو و گرم و گاهی شوخ باشه.\n'
              'قواعد دیگر: ۱) جمله‌های کوتاه، حداکثر ۱۵ کلمه؛ هر جمله با نقطه یا علامت سؤال تمام شود. '
              '۲) شروع با یک قلاب جذاب (سؤال یا واقعیت عجیب) در دو جمله‌ی اول. ۳) فقط از اطلاعات متن اصلی استفاده کن و واقعیت تازه نساز. '
              '۴) پایان با جمع‌بندی و یک جمله‌ی دعوت به دنبال کردن ذره‌بین. ۵) طول: نزدیک %d کلمه. ۶) عددها و نام‌ها را طوری بنویس که خواندنشان برای گوینده راحت باشد. '
              '۷) خروجی فقط متن روایت باشد: بدون عنوان، شماره، توضیح یا نشانه‌گذاری فرمت. پاراگراف‌ها را با یک خط خالی جدا کن.' % words)
    if req.get('lang', 'fa') != 'fa':
        system += '\n۹) متن نهایی را به زبان %s بنویس.' % LANGNAME[req['lang']]
    text = groqlib.chat(system, src[:14000], max_tokens=6000, temperature=.5).strip()
    text = re.sub(r'^\s*#+.*$', '', text, flags=re.M).strip()
    open(out, 'w', encoding='utf8').write(text); json.dump({'h': h}, open(f'{d}/narration.meta', 'w')); return text

def split_sentences(text):
    sents = []   # (text, paragraph_break_after)
    for para in [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]:
        para = re.sub(r'\s+', ' ', para)
        parts = [s.strip() for s in re.split(r'(?<=[.!؟?!…])\s+', para) if s.strip()]
        fixed = []
        for s in parts:   # split overly long sentences at commas
            while len(s) > 150:
                cut = max(s.rfind('،', 0, 130), s.rfind(',', 0, 130), s.rfind(' ', 0, 130)); fixed.append(s[:cut + 1].strip()); s = s[cut + 1:].strip()
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

def chunk_sentences(sents, limit=650):
    """group consecutive sentences (never across paragraphs) into chunks of <= limit chars"""
    out, cur, n = [], [], 0
    for i, (t, par) in enumerate(sents):
        if cur and n + len(t) > limit: out.append(cur); cur, n = [], 0
        cur.append(i); n += len(t) + 1
        if par: out.append(cur); cur, n = [], 0
    if cur: out.append(cur)
    return out

async def run(ep):
    d = f'episodes/{ep}'; req = load(f'{d}/request.json', {}); lang = req.get('lang', 'fa')
    text = narrate(ep, req); engine = req.get('tts') or ('gemini' if os.environ.get('GEMINI_API_KEY') else 'edge')
    voice = req.get('voice') or (os.environ.get('GEMINI_VOICE', 'Algieba') if engine == 'gemini' else VOICES[lang]); rate = req.get('rate', '+0%')
    sents = split_sentences(text); os.makedirs('tmp_tts', exist_ok=True)
    evs = [None] * len(sents); src = [f'tmp_tts/s{i}.mp3' for i in range(len(sents))]
    if engine == 'gemini':
        import tts_gemini
        src = [f'tmp_tts/s{i}.wav' for i in range(len(sents))]
        for ci, ids in enumerate(chunk_sentences(sents)):
            cp = f'tmp_tts/chunk{ci}.wav'; tts_gemini.synth(' '.join(tts_gemini.tag(sents[i][0], sents[i][1]) for i in ids), voice, req.get('style', tts_gemini.DEFAULT_STYLE), cp)
            tts_gemini.split_sentences_audio(cp, [sents[i][0] for i in ids], [src[i] for i in ids]); print('chunk', ci, 'sentences', len(ids)); time.sleep(float(os.environ.get('TTS_GAP', '4')))
    else:
        for b in range(0, len(sents), 6):
            res = await asyncio.gather(*[synth(sents[i][0], voice, rate, src[i]) for i in range(b, min(b + 6, len(sents)))])
            for k, r in enumerate(res): evs[b + k] = r
    lst, t, S, Wd = [], 0.0, [], []
    for i, (s, par) in enumerate(sents):
        subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', src[i], '-ar', '44100', '-ac', '1', f'tmp_tts/s{i}.wav' if engine != 'gemini' else f'tmp_tts/n{i}.wav'])
        wp = f'tmp_tts/s{i}.wav' if engine != 'gemini' else f'tmp_tts/n{i}.wav'
        dd = dur(wp); gap = (.55 if par else .22) if engine != 'gemini' else (.3 if par else .06)
        toks = tokens(s); ev = evs[i]
        if ev and len(ev) >= max(2, int(len(toks) * .6)) and len(ev) <= len(toks) + 3:
            tt = [(e[0], e[0] + max(e[1], .08)) for e in ev]
            if len(tt) != len(toks): tt = [tt[min(int(k * len(tt) / len(toks)), len(tt) - 1)] for k in range(len(toks))]
        else: tt = spread(toks, dd)
        for k, w in enumerate(toks): Wd.append({'w': w, 't0': round(t + tt[k][0], 3), 't1': round(t + min(tt[k][1], dd), 3), 's': i})
        S.append({'i': i, 't0': round(t, 3), 't1': round(t + dd, 3), 'text': s}); lst.append((wp, gap)); t += dd + gap
    import wave
    with wave.open('tmp_tts/all.wav', 'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(44100)
        for p, gap in lst:
            with wave.open(p, 'rb') as w: out.writeframes(w.readframes(w.getnframes()))
            out.writeframes(b'\x00\x00' * int(44100 * gap))
    subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', 'tmp_tts/all.wav', '-c:a', 'libmp3lame', '-b:a', '160k', f'{d}/voice.mp3'])
    try:
        import align_whisper
        if os.environ.get('GROQ_API_KEY') and not req.get('no_whisper'):
            Wd, frac = align_whisper.refine(f'{d}/voice.mp3', Wd, t, lang)
            print('whisper-aligned words: %.0f%%' % (frac * 100))
            if frac > .5:
                for sdict in S:
                    ws = [w for w in Wd if w['s'] == sdict['i']]
                    if ws: sdict['t0'] = round(max(ws[0]['t0'] - .12, 0), 3); sdict['t1'] = round(ws[-1]['t1'], 3)
    except SystemExit: raise
    except Exception as e: print('whisper refine skipped:', e)
    json.dump({'sentences': S, 'words': Wd, 'voice_seconds': round(t, 2), 'lang': lang, 'voice': voice, 'engine': engine}, open(f'{d}/timing.json', 'w', encoding='utf8'), ensure_ascii=False)
    print('engine', engine, voice, '| sentences', len(S), 'words', len(Wd), 'seconds', round(t, 1))

if __name__ == '__main__':
    asyncio.run(run(sys.argv[1]))
