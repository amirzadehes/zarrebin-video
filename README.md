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

## Background layer, pinned framed pictures and image effects (all optional, set in the app's review panel)
All live in `scenes.json`; scenes without them render exactly as before. Written by hand or by the app (`episodes/<ep>/scenes.json`). Code: `engine/fx.js`.
- `scene.bg` – a library image behind the scene: `{src, motion, hold, speed .2-3, size .2-3, count 1-20, opacity, blur, start, tilt 0-1, seed, dir, sound, vol, lay}`.
  Motions: `down`, `up`, `left`, `right`, `zoom` (from depth), `pop`, `fill` (full screen, then empties), `fillin`, `scroll` (seamless pattern, `dir` = down/up/left/right/dr/dl/ur/ul), `cover`.
  Placement is **random** (seeded, evenly spread): positions, angles (`tilt` = angle range, 1 = any angle incl. upside down) and sizes; `seed` gives a new layout. `lay.{v,h}.<i> = {dx,dy,sz,rot}` is the owner's hand placement of copy i (drag / pinch in the app preview, "edit layout").
  `cover`: pictures land at random spots/angles, slow at first, fast in the middle, slow again at the end, until nothing of the scene shows underneath (each new picture lands on a spot still uncovered; opacity / blur / count are ignored).
  `sound` = whoosh/swipe/airy/low/riser/pop/thud/none, `vol` 0-100.
- `scene.pins[]` – library pictures stuck on the backdrop (static, like a photo glued to the wall: present from the first frame, no entrance, float or squash): `{src, frame, attach, card, photo, curl, shadow, x, y, sz, rot, start, seed, fx, lay}`.
  Frames: `polaroid`, `plain`, `stamp`, `film`, `torn`, `burnt` (charred edge), `wood`, `gold`, `none`. Fasteners `attach`: `pin-red|pin-blue|pin-brass`, `tape-corners`, `tape-top`, `tape-4`, `washi`, `clip`, `nail`, `magnet`, `putty`, `string`, `none`. `card` = white/cream/kraft/black/rose; `photo` = cream/sky/mint/rose/sand/night/kraft/white or `#hex`; `curl` lifts a corner; `shadow` 0-1. Old `frame:'tape'|'pin'` still work. A sound plays only if `vol>0`. Effects include the new `fold` (creases).
- `item.fx[]` / `pin.fx[]` – effects that follow the (moving) picture, several can be stacked: `{type, start, dur, anchor, vol, ...}`.
  `steam`, `smoke`, `page-turn` (`mode` in/out, `hinge` center/left/right), `tea-ring` (cup stain, `tone` tea/coffee/wine), `aged` (turns yellow), `burn` (edges char and crumble), `sparkle`, `shine`, `glow`, `wiggle`, `pulse`, `crack`. The old `clock-rewind` was removed (old scenes that still list it simply ignore it).
  `anchor:[x,y]` (0-1 inside the image) overrides the automatic spot, found from the cut-out's alpha. A per-image default can be put in `library/anchors.json` as `{id:{steam:[x,y],default:[x,y]}}` (optional file).
- Everything is a pure function of time with seeded randomness, so the parallel chunk rendering stays consistent.
- Sounds are made in code by `tools/make_bgfx.py <ep>` -> `episodes/<ep>/bgfx.wav`, mixed in the merge step (weight 0.8, after sfx). The step is `continue-on-error`; nothing to play -> no file. `"sfx": false` in `request.json` turns them off.
- Cover, zoom and blur-heavy backgrounds, and `burn` / `shine` / `crack`, render slower than plain scenes.

## Rhythm and quality (retention)
- **Camera beats** (`engine/v2.js`, `buildBeats`): a short spring zoom (~3.5 %) on the onset of an emphasised caption word (`kw`) and, when nothing new has appeared for ~3.4 s, on the next word. Pure function of time, so parallel chunks stay consistent. Off: `"punch": false` in `scenes.json` meta or `?punch=0`.
- **Hero variety**: a hero scene with a single picture alternates the picture left / right of centre with a slight tilt, so a run of hero scenes does not look identical. Off: `"vary": false` in meta or `?vary=0`. The owner's hand placement (`lay`) still applies on top.
- **Director enrichment** (`tools/direct_scenes.py`): in a long scene (>5.5 s, >3.5 s in the short version) with fewer than 3 pictures, up to two more library pictures are added whose first name-word is spoken later in the scene (exact word match), timed to that word. Printed as `enrich: ...` in build.log. Off: `"enrich": false` in `request.json`. Episodes built with `use_plan` keep their reviewed `scenes.json` untouched.
- **Quality check** (`tools/qa_scenes.py`, step "Quality check" in make-video): report only, never fails the build, writes `episodes/<ep>/qa.json` and prints Persian findings to build.log: too-long / too-short scenes, scenes without a picture, runs of the same template, stretches without a new visual event, cuts that start mid-word, weak hook (first scene), caption highlights.
- **Contact sheet** (`engine/contact-sheet.js`, workflow "Contact sheet"): one picture of the whole episode (a frame every few seconds with scene number and template) plus the quality check in the run summary. Actions → Contact sheet → episode name → download artifact `contact-sheet`. Reads only `scenes.json`.

## Poster mode (second style, switch at the very top of the app)
A test style next to the classic one: **one full-bleed picture per scene** (made by the owner, uploaded in the review panel) with text layers on top. The classic mode is untouched.
- Switch: the two buttons at the top of `app/index.html` ("ذره‌بین" / "پوستر"). Stored in the browser; a new build in poster mode writes `"mode":"poster"` (and optional `"footer"`) into `request.json`. An episode keeps its mode in `scenes.json` `meta.mode`, so old episodes open as before.
- Pipeline: `tools/direct_poster.py` (instead of `refresh_needs` + `direct_scenes.py`; chosen in `make-video.yml` by `request.json` mode) groups sentences into scenes and writes per scene `photo.prompt` (English image prompt), `kicker` (small label top-left), `text` (headline, `*word*` = orange highlight), `number` (year/number, only if spoken). Needs no library images. A reviewed `scenes.json` (`use_plan`) is kept as is.
- Review panel (poster episodes): per scene the prompt (copy button adds the editable style + aspect), photo upload (resized to max 2400 px JPEG, stored as `episodes/<ep>/bg/NN-<id>.jpg`), bulk upload in file-name order, kicker, photo motion. All the classic review tools still work on top: library pictures (enter/exit on a spoken word, layout drag, effects, sounds), pinned cards, background layers, key-text position/size.
- Engine (`engine/v2.js`, `POSTER`): `scene.photo = {src, prompt, motion: auto|in|out|left|right|none, fx, fy}` drawn cover-fit with a slow zoom/pan + top/bottom shading; text layers in `posterText`, caption in `subsPoster`, top bar in `uiPoster`. Scenes without a photo render on a dark background.
- Quality check is poster-aware (counts scenes without photo instead of without library pictures).


### Poster mode: separate props
The director may add up to 2 small separate objects per scene (`scene.props`: `fa`, `t`, `prompt`). A prop whose Persian name already exists in the library is put on the scene as an item at the spoken word. Others show in the review panel with a detailed prompt (same style + magenta background); uploading one runs the normal library flow and adds it to the scene at `t`.

### Poster mode: text layers, stamps, atmosphere, camera
Per scene (all optional): `layers` = any number of `{kind:'text'|'stamp', text, t, out, x, y, size, col, bg, hl, rot}`; main headline style `tcol`, `tbg` (or `'none'`), `thl`, `tIn`, `tOut`; `atm` = `[{type:'snow'|'rain'|'lightning'|'fog'|'embers', amt}]`; `photo.drift` 0-3 (micro hand-held drift of the picture, default 1; `meta.drift` sets the default); `kick` = `both|punch|shake|none` (camera effect when a library picture enters).

### سبک ثابت و پس‌زمینه‌ی رنگی (حالت پوستر)
- سبک تصویر (Painterly retro poster) قفل است و با تأکید «ثابت، هرگز عوض نشود» به انتهای پرامپت عکس صحنه و پرامپت اشیای جدا اضافه می‌شود.
- صحنه‌ای که عکس لازم ندارد می‌تواند `bgc` داشته باشد: `{c1, c2, fx: glow|rays|bokeh|stripes|dots|waves|none, amt, on?}`؛ گرادیان دو رنگ به‌علاوه‌ی افکت متحرک. `on:true` یعنی حتی با وجود عکس، رنگی نشان بده.
