"""Step 0 of the owner-cut flow: the uploaded recording (episodes/<ep>/voice_user.*) -> Whisper -> voice.mp3 + timing.json (+ narration.txt).
Nothing else is built here: the owner then chooses where every scene starts in the app (episodes/<ep>/cuts.json) and the director only writes the picture prompts.
usage: python tools/transcribe_voice.py <episode>
Idempotent: running it again simply transcribes again (and removes an old cuts.json, because the word numbers of the old transcript no longer apply)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import narrate_tts

def main(ep):
    d = f'episodes/{ep}'
    req = narrate_tts.load(f'{d}/request.json', {}); req['own_voice'] = True
    tr = narrate_tts.load(f'{d}/transcribe.json', {})
    if tr.get('lang'): req['lang'] = tr['lang']
    narrate_tts.own_voice(ep, req)
    if os.path.exists(f'{d}/cuts.json'): os.remove(f'{d}/cuts.json'); print('old cuts.json removed (new transcript)')
    T = narrate_tts.load(f'{d}/timing.json', {})
    print('transcript ready: words', len(T.get('words', [])), 'sentences', len(T.get('sentences', [])), 'seconds', T.get('voice_seconds'))

if __name__ == '__main__': main(sys.argv[1])
