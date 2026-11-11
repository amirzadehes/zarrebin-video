"""Guard: episodes/<ep>/voice.mp3 must be the voice that timing.json (and so the subtitles and scenes) was made from.
A stale voice.mp3 left from an earlier build would play under new subtitles, so the build stops here instead.
usage: python tools/check_voice.py <episode>"""
import json, subprocess, sys

def main(ep):
    d = f'episodes/{ep}'
    try: t = json.load(open(f'{d}/timing.json', encoding='utf8'))
    except Exception as e: sys.exit(f'voice check: timing.json is missing or unreadable for {ep}: {e}')
    try: got = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'{d}/voice.mp3']).decode().strip())
    except Exception as e: sys.exit(f'voice check: voice.mp3 is missing or unreadable for {ep}: {e}')
    want = float(t.get('voice_seconds') or 0)
    if want and abs(got - want) > 1.5:
        sys.exit(f'voice check FAILED for {ep}: voice.mp3 is {got:.1f}s but the subtitles/timing were made for a {want:.1f}s voice (old voice left over?). Run the preparation step again.')
    print(f'voice check ok: voice.mp3 {got:.1f}s, timing {want:.1f}s')

if __name__ == '__main__':
    main(sys.argv[1])
