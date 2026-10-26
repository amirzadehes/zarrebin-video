# zarrebin-video

Automatic pipeline for animated explainer videos (comic style, vertical 9:16).

- `engine/` – animation engine (HTML canvas) + chunk renderer
- `library/` – cut-out images (magenta background removed, white sticker border) + `catalog.json`
- `episodes/<name>/` – voice file + word timeline for one episode
- `.github/workflows/render.yml` – renders in parallel chunks, joins, adds voice, publishes a Release

Run: GitHub → Actions → "Render episode" → Run workflow.
