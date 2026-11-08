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
- Experimental, **off by default**: `"bgvar": true` (varied backgrounds: vox ruled / graph / spotlight / colour band, comic stripes / rings / diamonds; per scene override with `"bg": n`) and `"lab": true` (taped polaroid frames for trio, spotlight + contact shadow for hero). Preview with `?bgvar=1&bg=2&lab=1`.
