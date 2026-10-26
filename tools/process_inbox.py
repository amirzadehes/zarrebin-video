#!/usr/bin/env python3
"""Process every image in inbox/: magenta background -> transparent cut-out with white sticker border -> WebP in library/.
File name format in inbox:  <id>__<anything>.<jpg|png|webp>     e.g.  alarm-clock__t123_ab.jpg
"""
import io, hashlib, json, os, re, sys, time, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, 'inbox'); LIB = os.path.join(ROOT, 'library'); FAILED = os.path.join(INBOX, '_failed')
CATALOG = os.path.join(LIB, 'catalog.json'); WANTED = os.path.join(ROOT, 'wanted.json'); REPORT = os.path.join(LIB, 'report.json')
BORDER = 18; MAXSIDE = 1600

class Reject(Exception): pass

def cutout(im, T=70, border=BORDER):
    im = im.convert('RGB')
    if max(im.size) > MAXSIDE:
        s = MAXSIDE / max(im.size); im = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    a = np.asarray(im).astype(float); h, w, _ = a.shape
    edge = np.concatenate([a[:6].reshape(-1,3), a[-6:].reshape(-1,3), a[:,:6].reshape(-1,3), a[:,-6:].reshape(-1,3)])
    bg = np.median(edge, axis=0)
    if not (bg[0] > 150 and bg[1] < 110 and bg[0] - bg[1] > 80):
        raise Reject('زمینه‌ی سرخابی نیست (رنگ زمینه: %d,%d,%d)' % tuple(bg))
    if edge.std(axis=0).max() > 32:
        raise Reject('زمینه یک‌دست نیست (سایه یا گرادیان دارد)')
    dist = np.sqrt(((a - bg) ** 2).sum(2))
    lab, _ = ndi.label(dist < T)
    bl = np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]])); bl = bl[bl > 0]
    bgmask = np.isin(lab, bl)
    flat = dist < 30; lf, nf = ndi.label(flat)          # enclosed flat-magenta holes (handles, gaps)
    for i, sz in enumerate(ndi.sum(flat, lf, range(1, nf + 1))):
        if sz > 400: bgmask |= (lf == i + 1)
    fg = ndi.binary_opening(~bgmask, iterations=2)
    l2, n2 = ndi.label(fg)
    if n2 > 1:
        sizes = ndi.sum(fg, l2, range(1, n2 + 1)); fg = np.isin(l2, [i + 1 for i, s in enumerate(sizes) if s > 0.002 * h * w])
    cov = fg.mean()
    if cov < 0.02: raise Reject('شیء پیدا نشد یا خیلی کوچک است')
    if cov > 0.80: raise Reject('شیء تمام کادر را گرفته؛ حاشیه‌ی بیشتری لازم است')
    if fg[:3].any() or fg[-3:].any() or fg[:, :3].any() or fg[:, -3:].any():
        raise Reject('شیء از لبه‌ی کادر بیرون زده یا بریده شده')
    alpha = ndi.gaussian_filter(fg.astype(float), 1.2)
    eroded = ndi.binary_erosion(fg, iterations=3)
    idx = ndi.distance_transform_edt(~eroded, return_indices=True)[1]
    rgb = np.where(((fg & ~eroded) & (dist < 140))[..., None], a[idx[0], idx[1]], a)
    ys, xs = np.where(fg); pad = border + 8
    y0, x0 = max(0, ys.min() - pad), max(0, xs.min() - pad); y1, x1 = min(h, ys.max() + pad), min(w, xs.max() + pad)
    rgb, alpha, fgc = rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1], fg[y0:y1, x0:x1]
    dt = ndi.distance_transform_edt(~fgc)
    outer = ndi.gaussian_filter(np.clip(border + 1 - dt, 0, 1), .8)
    A = alpha[..., None]
    out = np.zeros(fgc.shape + (4,), float)
    out[..., :3] = rgb * A + 255 * (1 - A); out[..., 3] = np.maximum(outer, alpha) * 255
    return Image.fromarray(out.astype(np.uint8), 'RGBA')

def load_json(p, default):
    try: return json.load(open(p, encoding='utf8'))
    except Exception: return default

class Dup(Exception): pass

def main():
    os.makedirs(LIB, exist_ok=True); os.makedirs(FAILED, exist_ok=True)
    cat = load_json(CATALOG, {'items': {}}); items = cat['items']
    wanted = {w['id']: w for w in load_json(WANTED, [])}
    rep = load_json(REPORT, {'runs': []})
    ok, bad = [], []
    files = sorted(f for f in os.listdir(INBOX) if os.path.isfile(os.path.join(INBOX, f)) and not f.startswith('.'))
    for f in files:
        src = os.path.join(INBOX, f)
        m = re.match(r'^([a-z0-9-]+)__(.+)\.(jpg|jpeg|png|webp)$', f, re.I)
        try:
            if not m: raise Reject('اسم فایل درست نیست (باید id__چیزی.jpg باشد)')
            iid = m.group(1).lower()
            im = cutout(Image.open(src))
            n = 1 + max([int(x.group(1)) for x in (re.match(re.escape(iid) + r'__(\d+)\.webp$', g) for g in os.listdir(LIB)) if x] + [0])
            name = f'{iid}__{n}.webp'
            buf = io.BytesIO(); im.save(buf, 'WEBP', quality=92, method=6); data = buf.getvalue()
            h = hashlib.md5(data).hexdigest()
            for v in items.get(iid, {}).get('variants', []):
                if os.path.exists(os.path.join(LIB, v)) and hashlib.md5(open(os.path.join(LIB, v), 'rb').read()).hexdigest() == h:
                    raise Dup(v)
            open(os.path.join(LIB, name), 'wb').write(data)
            it = items.setdefault(iid, {'id': iid, 'en': wanted.get(iid, {}).get('en', iid.replace('-', ' ')), 'fa': wanted.get(iid, {}).get('fa', ''), 'tags': wanted.get(iid, {}).get('tags', []), 'has_text_in_image': False, 'variants': []})
            it['variants'].append(name)
            os.remove(src); ok.append({'file': f, 'id': iid, 'saved': name, 'kb': round(os.path.getsize(os.path.join(LIB, name)) / 1024)})
        except Dup as d:
            os.remove(src); bad.append({'file': f, 'reason': 'تکراری بود (همین تصویر قبلاً ذخیره شده: %s)' % d})
        except Exception as e:
            reason = str(e) if isinstance(e, Reject) else 'خطا در خواندن تصویر: %s' % e
            shutil.move(src, os.path.join(FAILED, f)); bad.append({'file': f, 'reason': reason})
    cat['items'] = dict(sorted(items.items()))
    json.dump(cat, open(CATALOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    if ok or bad:
        rep['runs'] = (rep['runs'] + [{'time': time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime()), 'ok': ok, 'failed': bad}])[-40:]
        json.dump(rep, open(REPORT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(json.dumps({'ok': len(ok), 'failed': bad}, ensure_ascii=False))

if __name__ == '__main__': main()
