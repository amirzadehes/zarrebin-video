# zarrebin-video

Automatic pipeline for animated explainer videos (comic style, vertical 9:16).

- `engine/` – animation engine (HTML canvas) + chunk renderer
- `library/` – cut-out images (magenta background removed, white sticker border) + `catalog.json`
- `episodes/<name>/` – voice file + word timeline for one episode
- `.github/workflows/render.yml` – renders in parallel chunks, joins, adds voice, publishes a Release

Run: GitHub → Actions → "Render episode" → Run workflow.

## Visual / sound options (engine v2)
- Decorative symbols (arrow, plus, VS badge, burst ring, sparkle stars) are **off by default**. Turn them back on per episode with `"symbols": true` in `scenes.json` meta, or `?symbols=1` in the preview URL.
- Every scene gets its own camera move (push in / pull out + slow pan); objects squash & stretch and throw a short impact burst when they land.
- Scene wipes: 6 styles (`wipe` 0-5: circle, slant, rise, blinds, split, diamond); the director gives neighbouring scenes different ones and never repeats a template twice in a row.
- Word-by-word captions sit in a soft pill inside the platforms' safe zone; the spoken word pops in colour.
- Light animated film grain + soft vignette on both styles.
- Sound effects: pools of different sounds per event, picked with a seed derived from the episode name (same episode = same mix), at most one event per `sfx_gap` seconds (default 0.3, set in `request.json`).
- Final encode: crf 24, max 3.5 Mbit/s (was crf 28 / 1.8 Mbit/s).
- Scene title cards (hero/duo/trio) are off; the caption sits on the paper (vox) / white card (comic). `"titles": true` in meta brings the old cards back.

## Background layer and image effects (all optional, set in the app's review panel)
Both live in `scenes.json`; scenes without them render exactly as before. Written by hand or by the app (`episodes/<ep>/scenes.json`).
- `scene.bg` – a library image behind the scene: `{src, motion, hold, speed .2-3, size .2-3, count 1-20, opacity, blur, start, dir, sound, vol}`.
  Motions: `down`, `up`, `left`, `right`, `zoom` (from depth), `pop`, `fill` (full screen, then empties), `fillin`, `scroll` (seamless pattern, `dir` = down/up/left/right/dr/dl/ur/ul). `hold` keeps the last copy on screen. `sound` = whoosh/swipe/airy/low/riser/pop/thud/none, `vol` 0-100.
- `item.fx[]` – effects that follow the (moving) image: `{type, start, dur, anchor, vol}`.
  `steam` (rising from food; `intensity`, `height`, `speed`), `page-turn` (`mode` in/out, `hinge` center/left/right), `clock-rewind` (`turns`, `radius`, `tint`).
  `anchor:[x,y]` (0-1 inside the image) overrides the automatic spot, found from the cut-out's alpha. A per-image default can be put in `library/anchors.json` as `{id:{steam:[x,y],default:[x,y]}}` (optional file).
- Everything is a pure function of time (`engine/fx.js`), so the parallel chunk rendering stays consistent.
- Sounds are made in code by `tools/make_bgfx.py <ep>` → `episodes/<ep>/bgfx.wav`, mixed in the merge step (weight 0.8, after sfx). The step is `continue-on-error`; no bg/fx → no file. `"sfx": false` in `request.json` turns them off.
- Zoom / blur-heavy backgrounds render slower (blur is quantised to keep the cost down).
