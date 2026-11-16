"""Depth maps for the scene photos: episodes/<ep>/bg/<name>.<ext> -> episodes/<ep>/depth/<name>.png (grey, white = near, max 768 px)
and episodes/<ep>/depth/<name>.flat.png, the map the engine (engine/v2.js, depthLayers) really uses for the 3D / parallax effect.
Raw maps (Depth Anything V2 Small, free, Apache-2.0, CPU of a GitHub runner) wobble inside every object (a face is a bumpy surface), and warping a picture by them bends faces and things.
The flat map fixes that: the picture is cut into regions that follow the edges of the drawing (superpixels on colour + depth), neighbours of nearly equal depth are merged, and every region gets ONE depth,
so each object slides as a rigid piece. A ramp then falls off from near objects into the farther background beside them, so the background (not the object) is what stretches where the picture opens up.
Idempotent: a photo that already has its raw / flat map is skipped. usage: python tools/make_depth.py"""
import glob, os
import numpy as np
from PIL import Image

EXT = ('.jpg', '.jpeg', '.png', '.webp')

def out_path(p):
    return os.path.splitext(p.replace('/bg/', '/depth/'))[0] + '.png'

def flatten(rgb, d, n_seg=900, merge=.08, min_area=.003, dw=3.0, compact=.12):
    """rgb uint8 HxWx3, d float 0..1 (1 = near) -> d with ONE value per region (rigid pieces)"""
    from scipy import ndimage as ndi
    from skimage.segmentation import slic
    h, w = d.shape; d = ndi.median_filter(d, size=5)
    feat = np.concatenate([rgb.astype(np.float32) / 255, (d * dw)[..., None]], -1)
    seg = slic(feat, n_segments=n_seg, compactness=compact, sigma=1, start_label=0, enforce_connectivity=True, convert2lab=False, channel_axis=-1)
    n = int(seg.max()) + 1; area = np.bincount(seg.ravel(), minlength=n).astype(np.float64)
    dep = ndi.median(d, labels=seg, index=np.arange(n)).astype(np.float64); adj = {i: {} for i in range(n)}
    for a, b in ((seg[:, :-1], seg[:, 1:]), (seg[:-1, :], seg[1:, :])):
        m = a != b; p = np.stack([a[m], b[m]], 1); p.sort(1); u, c = np.unique(p, axis=0, return_counts=True)
        for (i, j), k in zip(u.tolist(), c.tolist()): adj[i][j] = adj[i].get(j, 0) + k; adj[j][i] = adj[j].get(i, 0) + k
    alive = set(range(n)); parent = list(range(n)); tiny = min_area * h * w
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    while True:   # merge the most similar neighbours first; small pieces are absorbed even when the depth differs a bit
        best = None
        for a in alive:
            for b in adj[a]:
                if a < b:
                    diff = abs(dep[a] - dep[b]); small = min(area[a], area[b]) < tiny
                    if diff < merge * (2.2 if small else 1) and (best is None or diff - (.05 if small else 0) < best[0]): best = (diff - (.05 if small else 0), a, b)
        if best is None: break
        _, a, b = best; dep[a] = (dep[a] * area[a] + dep[b] * area[b]) / (area[a] + area[b]); area[a] += area[b]; parent[b] = a
        for k, v in adj[b].items():
            if k != a: adj[a][k] = adj[a].get(k, 0) + v; adj[k][a] = adj[k].get(a, 0) + v
            adj[k].pop(b, None)
        adj[a].pop(b, None); del adj[b]; alive.discard(b)
    lab = np.array([find(i) for i in range(n)])[seg]
    return dep[lab].astype(np.float32)

def ramp(d, width):
    """grey dilation with an L1 cone (separable): out(p) = max_q d(q) - |p-q|_1 / width. Near objects keep their exact depth; the farther pixels beside them slope down to the background"""
    o = d.copy(); c = 1.0 / max(1.0, width); h, w = o.shape
    for x in range(1, w): o[:, x] = np.maximum(o[:, x], o[:, x - 1] - c)
    for x in range(w - 2, -1, -1): o[:, x] = np.maximum(o[:, x], o[:, x + 1] - c)
    for y in range(1, h): o[y] = np.maximum(o[y], o[y - 1] - c)
    for y in range(h - 2, -1, -1): o[y] = np.maximum(o[y], o[y + 1] - c)
    return o

def flat_map(photo, raw_png):
    dim = Image.open(raw_png).convert('L'); w, h = dim.size
    rgb = np.asarray(Image.open(photo).convert('RGB').resize((w, h), Image.LANCZOS)); d = np.asarray(dim, dtype=np.float32) / 255
    lo, hi = np.percentile(d, 2), np.percentile(d, 98); d = np.clip((d - lo) / max(hi - lo, 1e-3), 0, 1)
    return ramp(flatten(rgb, d), .045 * max(w, h))

def flat_path(raw_png): return raw_png[:-4] + '.flat.png'

def main():
    photos = [p for p in sorted(glob.glob('episodes/*/bg/*')) if p.lower().endswith(EXT)]
    todo = [p for p in photos if not os.path.exists(out_path(p))]
    print('photos without depth map:', len(todo))
    if todo:
        from transformers import pipeline
        pipe = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf', device=-1)
        for p in todo:
            try:
                im = Image.open(p).convert('RGB'); k = min(1.0, 768 / max(im.size)); im = im.resize((max(2, round(im.width * k)), max(2, round(im.height * k))))
                d = np.array(pipe(im)['depth'].convert('L').resize(im.size), dtype=np.float32)
                lo, hi = np.percentile(d, 1), np.percentile(d, 99); d = np.clip((d - lo) / max(hi - lo, 1e-3), 0, 1)
                o = out_path(p); os.makedirs(os.path.dirname(o), exist_ok=True); Image.fromarray((d * 255).astype('uint8'), 'L').save(o); print('ok', o)
            except Exception as e:
                print('FAILED', p, e)
    for p in photos:   # the rigid, flattened map the engine uses (raw maps stay untouched)
        raw = out_path(p); fl = flat_path(raw)
        if not os.path.exists(raw) or os.path.exists(fl): continue
        try:
            Image.fromarray((np.clip(flat_map(p, raw), 0, 1) * 255).round().astype('uint8'), 'L').save(fl); print('flat', fl)
        except Exception as e:
            print('FAILED flat', p, e)

if __name__ == '__main__': main()
