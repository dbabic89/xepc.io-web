# xepc.io — company website

Static site for [xepc.io](https://xepc.io) — software studio (apps, websites, AI solutions).

## Stack
- Plain static HTML/CSS/JS — no build step
- Hosted on Cloudflare Pages (connected to this repo, auto-deploy on push to `main`)
- Client-side i18n (hr default, en, de), theme (dark/light) and color-scheme switcher

## Structure
- `index.html` — the whole site (SEO meta + JSON-LD structured data in `<head>`)
- `roles/` — team photos (WebP, 512px)
- `assets/` — favicon/icons, OG image (`og.svg` → `og.png` via `rsvg-convert`)
- `robots.txt`, `sitemap.xml`, `_headers` (Cloudflare), `404.html`

## Deploy
Push to `main` → Cloudflare Workers Builds runs `sh build.sh`, then
`npx wrangler deploy` uploads `dist/` (per `wrangler.toml`).
Custom domain: `xepc.io`.

Cloudflare Worker build configuration:
- **Build command:** `sh build.sh`
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** `/`

The assets directory lives in `wrangler.toml`, not in the dashboard. `build.sh`
copies only the publishable files into `dist/`; deploying the repo root instead
would expose `.git/`, letting anyone reconstruct the full history.

`name` in `wrangler.toml` must match the existing Worker, otherwise a second
Worker is created and the custom domain keeps pointing at the old one.

## Regenerating icons
```sh
cd assets
rsvg-convert -w 1200 -h 630 og.svg -o og.png
rsvg-convert -w 32 -h 32 favicon.svg -o icon-32.png
rsvg-convert -w 180 -h 180 icon-bg.svg -o apple-touch-icon.png
rsvg-convert -w 192 -h 192 icon-bg.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon-bg.svg -o icon-512.png
```
