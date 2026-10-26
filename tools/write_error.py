import json, sys
ep = sys.argv[1]
m = open('err.txt').read()[-400:]
json.dump({'episode': ep, 'error': True, 'message': m, 'items': []}, open(f'episodes/{ep}/needs.json', 'w'), ensure_ascii=False)
