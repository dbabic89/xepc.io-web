# Lighthouse — mobile preset

Lighthouse 13.5.0, headless Chrome, default mobile form factor. Served from `dist/` (`sh build.sh`) on `http://localhost:4791`. Scores × 100.
Targets: SEO ≥ 95, Performance / Accessibility / Best Practices ≥ 90. Misses: none.

| page | SEO | Performance | Accessibility | Best Practices |
|---|---|---|---|---|
| / | 100 | 98 | 95 | 96 |
| /en | 100 | 99 | 95 | 96 |
| /de | 100 | 99 | 95 | 96 |
| /programiranje | 100 | 97 | 100 | 96 |
| /izrada-web-stranica | 100 | 97 | 100 | 96 |
| /izrada-mobilnih-aplikacija | 100 | 97 | 100 | 96 |
| /izrada-aplikacija-po-mjeri | 100 | 97 | 100 | 96 |
| /ai-rjesenja | 100 | 97 | 100 | 96 |

## Audits with score < 1 (excluding informative and manual)

### /
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `color-contrast` — Background and foreground colors do not have a sufficient contrast ratio.
- `errors-in-console` — Browser errors were logged to the console

### /en
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `color-contrast` — Background and foreground colors do not have a sufficient contrast ratio.
- `errors-in-console` — Browser errors were logged to the console

### /de
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `color-contrast` — Background and foreground colors do not have a sufficient contrast ratio.
- `errors-in-console` — Browser errors were logged to the console

### /programiranje
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `speed-index` — Speed Index
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `errors-in-console` — Browser errors were logged to the console

### /izrada-web-stranica
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `speed-index` — Speed Index
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `errors-in-console` — Browser errors were logged to the console

### /izrada-mobilnih-aplikacija
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `speed-index` — Speed Index
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `errors-in-console` — Browser errors were logged to the console

### /izrada-aplikacija-po-mjeri
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `speed-index` — Speed Index
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `errors-in-console` — Browser errors were logged to the console

### /ai-rjesenja
- `first-contentful-paint` — First Contentful Paint
- `largest-contentful-paint` — Largest Contentful Paint
- `speed-index` — Speed Index
- `cache-insight` — Use efficient cache lifetimes
- `legacy-javascript-insight` — Legacy JavaScript
- `network-dependency-tree-insight` — Network dependency tree
- `render-blocking-insight` — Render-blocking requests
- `interactive` — Time to Interactive
- `errors-in-console` — Browser errors were logged to the console

Note: `errors-in-console` on every page is the Cloudflare Web Analytics beacon (`cloudflareinsights.com/cdn-cgi/rum`) blocked by CORS on localhost. It is a local-only artefact, not checked against production.
