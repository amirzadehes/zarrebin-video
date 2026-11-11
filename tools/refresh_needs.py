"""Makes sure episodes/<ep>/needs.json + similar.json belong to the text the episode is built from now (see srctext.py).
Runs inside make-video before the scene director; does nothing (and spends no Groq call) when the list is already current.
usage: python tools/refresh_needs.py <episode>"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srctext, analyze_episode

def main(ep):
    d = f'episodes/{ep}'; text = srctext.source_text(ep)
    if len(text) < 20: print('needs refresh: no text for', ep); return
    if srctext.needs_current(ep): print('needs list is current for', ep); return
    old = srctext._load(f'{d}/needs.json', {}) or {}
    print('needs list does not belong to the current text of', ep, '- analysing again')
    analyze_episode.main(ep, text)
    if old.get('src_h') and os.path.exists(f'{d}/picks.json'):
        os.remove(f'{d}/picks.json'); print('removed picks.json (chosen for the previous text)')
    subprocess.call([sys.executable, 'tools/find_similar.py', ep])

if __name__ == '__main__':
    main(sys.argv[1])
