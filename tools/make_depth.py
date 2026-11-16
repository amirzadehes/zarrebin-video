"""Depth maps for the scene photos: episodes/<ep>/bg/<name>.<ext> -> episodes/<ep>/depth/<name>.png (grey, white = near, max 768 px).
The engine (engine/v2.js, depthLayers) uses them for the 3D / parallax effect. Model: Depth Anything V2 Small (free, Apache-2.0), runs on the CPU of a GitHub runner.
Idempotent: a photo that already has a depth map is skipped. usage: python tools/make_depth.py"""
import glob, os
import numpy as np
from PIL import Image

EXT = ('.jpg', '.jpeg', '.png', '.webp')

def out_path(p):
    return os.path.splitext(p.replace('/bg/', '/depth/'))[0] + '.png'

def main():
    todo = [p for p in sorted(glob.glob('episodes/*/bg/*')) if p.lower().endswith(EXT) and not os.path.exists(out_path(p))]
    print('photos without depth map:', len(todo))
    if not todo: return
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

if __name__ == '__main__': main()
