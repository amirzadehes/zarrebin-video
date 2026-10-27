"""Phone notification through ntfy.sh (free). usage: python tools/notify.py "title" "message"  — never fails the build."""
import json, sys, urllib.request
try:
    topic = json.load(open('notify.json'))['topic']
    body = {'topic': topic, 'title': sys.argv[1], 'message': sys.argv[2] if len(sys.argv) > 2 else '', 'click': 'https://amirzadehes.github.io/zarrebin-video/app/', 'tags': ['clapper']}
    urllib.request.urlopen(urllib.request.Request('https://ntfy.sh', json.dumps(body).encode('utf8'), {'Content-Type': 'application/json'}), timeout=20).read()
    print('notified')
except Exception as e: print('notify skipped:', e)
