# Race 3JS Prototype

This is a static browser prototype (Three.js + Rapier physics) meant to run from `index.html`.

This README contains quick instructions for local testing and deploying to Netlify.

## Quickstart (local)

1. Open a terminal in this folder (`race_3js`).
2. Start a simple local server and open the page in your browser:

```cmd
cd race_3js
python -m http.server 8000
# then open http://localhost:8000
```

or use `npx serve` (Node) or VS Code Live Server.

## Files of interest

- `index.html` — entry point. Uses import maps and CDN-hosted Three.js & Rapier by default.
- `assets/` — contains models (`assets/cars/*.glb`), Draco decoder (`assets/draco/`), textures, etc.
- `src/` — application code (game loop, physics, UI).
    - `src/cars/carLoader.js` — normalizes model scale/orientation when loading GLBs.
    - `src/cars/vehiclePhysics.js` — tuning object for engine, steering, brakes, damping.
    - `src/ui/garage.js` — car selection UI (top-left) and fullscreen preview.

## Deploying to Netlify

This is a static site — no build step required unless you change to a bundler.

Option A — Drag & drop
- Zip the `race_3js` folder and drag it to Netlify's "Sites" area (Drag & Drop).

Option B — Connect repository
- In Netlify, connect your Git repository and set the following in Site settings:
    - Build command: (leave blank)
    - Publish directory: `race_3js`

Optional `netlify.toml` (root of repo)
```toml
[build]
    publish = "race_3js"
    command = ""

[[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
```

## Asset & GLB notes

- Ensure `assets/cars/cars.json` lists the models you want to load and the files exist.
- The loader attempts to auto-detect orientation/size, but you can provide a `rotation` value per-manifest-entry when needed.
- Draco decoders (`assets/draco/`) must be present if your GLBs use Draco compression.

## Netlify-specific tips

- Publish directory must include `index.html` (if you point Netlify at the repository root, set `publish = "race_3js"`).
- No server functions are required; all assets are static.

## Want automation?

- I can add a `netlify.toml` (if you want it committed) or a GitHub Action that triggers deploys to Netlify (requires Netlify access token).

If you want, I can also add a small health-check endpoint or a simple status page for CI previews.
