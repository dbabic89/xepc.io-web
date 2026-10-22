// maqo-download: public update manifest + download proxy for a private GitHub releases repo.
//   GET /latest.json          -> { android|macos|windows: { version, url, size, sha256, publishedAt } }
//   GET|HEAD /download/<key>  -> streams the current binary of that platform
// Everything else is served from the static assets binding (the download page).
// The GitHub token, the repository name and GitHub URLs never appear in a response or a log line.

const GITHUB_API = 'https://api.github.com'
const REPO = 'dbabic89/maqo-releases'
const API_VERSION = '2022-11-28'
const USER_AGENT = 'maqo-download-worker'
const PUBLIC_ORIGIN = 'https://maqo.xepc.io'

// Platform key -> release tag prefix and the extension of the asset to serve.
const PLATFORMS = {
  android: { prefix: 'android-v', ext: 'apk' },
  macos: { prefix: 'desktop-v', ext: 'dmg' },
  windows: { prefix: 'desktop-v', ext: 'msi' },
}

const STATE_TTL_SECONDS = 600 // release state (and latest.json) edge cache
const ASSET_TTL_SECONDS = 2592000 // stored binaries; the key is the asset id, so never stale
const CLIENT_DOWNLOAD_MAX_AGE = 300 // /download/<key> URL is constant, so clients must not hold it long
const SEMVER = /^\d+\.\d+\.\d+$/

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path === '/latest.json') {
        if (!isReadMethod(request)) return methodNotAllowed()
        return await handleLatest(request, env, ctx)
      }
      if (path === '/download' || path.startsWith('/download/')) {
        if (!isReadMethod(request)) return methodNotAllowed()
        return await handleDownload(request, env, ctx, path.slice('/download/'.length))
      }
    } catch (error) {
      console.error('request_failed', error instanceof Error ? error.name : 'unknown')
      return json({ error: 'internal_error' }, 500)
    }
    if (env.ASSETS) return env.ASSETS.fetch(request)
    return json({ error: 'not_found' }, 404)
  },
}

function isReadMethod(request) {
  return request.method === 'GET' || request.method === 'HEAD'
}

function methodNotAllowed() {
  return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, HEAD' })
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

function notPublished() {
  return json({ error: 'not_published' }, 404)
}

function githubHeaders(env, accept) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: accept,
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': API_VERSION,
  }
}

// ---- release state ---------------------------------------------------------------------------

// Newest non-draft release per tag prefix -> state[key] = { version, assetId, size, sha256, publishedAt }.
// A key is absent when its release has no matching asset.
export function buildState(releases) {
  const state = {}
  const newestByPrefix = {}
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || release.draft || typeof release.tag_name !== 'string') continue
    const prefix = Object.values(PLATFORMS)
      .map((platform) => platform.prefix)
      .find((candidate) => release.tag_name.startsWith(candidate))
    if (!prefix) continue
    const version = release.tag_name.slice(prefix.length)
    if (!SEMVER.test(version)) continue
    const current = newestByPrefix[prefix]
    if (!current || releaseTime(release) > releaseTime(current.release)) {
      newestByPrefix[prefix] = { release, version }
    }
  }
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    const newest = newestByPrefix[platform.prefix]
    if (!newest) continue
    const asset = (newest.release.assets || []).find(
      (candidate) =>
        typeof candidate.name === 'string' &&
        candidate.name.toLowerCase().endsWith(`.${platform.ext}`) &&
        (candidate.state === undefined || candidate.state === 'uploaded'),
    )
    if (!asset || asset.id === undefined || asset.id === null) continue
    state[key] = {
      version: newest.version,
      assetId: asset.id,
      size: typeof asset.size === 'number' ? asset.size : null,
      sha256: parseDigest(asset.digest),
      publishedAt: newest.release.published_at || newest.release.created_at || null,
    }
  }
  return state
}

function releaseTime(release) {
  const time = Date.parse(release.published_at || release.created_at || '')
  return Number.isNaN(time) ? 0 : time
}

function parseDigest(digest) {
  if (typeof digest !== 'string') return null
  const match = /^sha256:([0-9a-fA-F]{64})$/.exec(digest)
  return match ? match[1].toLowerCase() : null
}

function manifestFrom(state) {
  const manifest = {}
  for (const [key, entry] of Object.entries(state)) {
    manifest[key] = {
      version: entry.version,
      url: `${PUBLIC_ORIGIN}/download/${key}`,
      size: entry.size,
      sha256: entry.sha256,
      publishedAt: entry.publishedAt,
    }
  }
  return manifest
}

// Cached for STATE_TTL_SECONDS at the edge. Returns null when GitHub cannot be reached.
async function loadState(env, ctx) {
  const cache = caches.default
  const cacheKey = new Request(`${PUBLIC_ORIGIN}/_cache/release-state`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit.json()

  const response = await fetch(`${GITHUB_API}/repos/${REPO}/releases?per_page=20`, {
    headers: githubHeaders(env, 'application/vnd.github+json'),
  })
  if (!response.ok) {
    console.error('github_releases_failed', response.status)
    return null
  }
  const state = buildState(await response.json())
  const stored = new Response(JSON.stringify(state), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STATE_TTL_SECONDS}` },
  })
  waitUntil(ctx, cache.put(cacheKey, stored))
  return state
}

function waitUntil(ctx, promise) {
  const guarded = Promise.resolve(promise).catch(() => console.error('cache_put_failed'))
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(guarded)
}

function tokenMissing(env) {
  return !env.GITHUB_TOKEN
}

// ---- /latest.json ----------------------------------------------------------------------------

async function handleLatest(request, env, ctx) {
  if (tokenMissing(env)) return json({ error: 'not_configured' }, 500)
  const state = await loadState(env, ctx)
  if (state === null) return json({ error: 'upstream_unavailable' }, 502)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${STATE_TTL_SECONDS}`,
  }
  const body = request.method === 'HEAD' ? null : JSON.stringify(manifestFrom(state))
  return new Response(body, { status: 200, headers })
}

// ---- /download/<key> -------------------------------------------------------------------------

async function handleDownload(request, env, ctx, key) {
  const platform = Object.hasOwn(PLATFORMS, key) ? PLATFORMS[key] : null
  if (!platform) return notPublished()
  if (tokenMissing(env)) return json({ error: 'not_configured' }, 500)
  const state = await loadState(env, ctx)
  if (state === null) return json({ error: 'upstream_unavailable' }, 502)
  const entry = state[key]
  if (!entry) return notPublished()

  const filename = `Maqo-${entry.version}.${platform.ext}`
  const disposition = `attachment; filename="${filename}"`

  if (request.method === 'HEAD') {
    const headers = downloadHeaders(disposition, entry.size)
    return new Response(null, { status: 200, headers })
  }

  const cache = caches.default
  const cacheKey = new Request(`${PUBLIC_ORIGIN}/_cache/asset/${entry.assetId}`, {
    headers: request.headers.has('Range') ? { Range: request.headers.get('Range') } : {},
  })
  const hit = await cache.match(cacheKey)
  if (hit) return clientCopy(hit, disposition)

  const body = await fetchAsset(env, entry.assetId)
  if (!body) return json({ error: 'upstream_unavailable' }, 502)

  const length = body.headers.get('Content-Length') || (entry.size === null ? null : String(entry.size))
  const [forClient, forCache] = body.body.tee()
  const storedHeaders = downloadHeaders(disposition, length === null ? null : Number(length))
  storedHeaders.set('Cache-Control', `public, max-age=${ASSET_TTL_SECONDS}`)
  waitUntil(
    ctx,
    cache.put(
      new Request(`${PUBLIC_ORIGIN}/_cache/asset/${entry.assetId}`),
      new Response(forCache, { status: 200, headers: storedHeaders }),
    ),
  )
  return new Response(forClient, { status: 200, headers: downloadHeaders(disposition, length === null ? null : Number(length)) })
}

function downloadHeaders(disposition, length) {
  const headers = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': disposition,
    'Cache-Control': `public, max-age=${CLIENT_DOWNLOAD_MAX_AGE}`,
    'Accept-Ranges': 'bytes',
  })
  if (length !== null && Number.isFinite(length)) headers.set('Content-Length', String(length))
  return headers
}

// A cached binary re-served with the short client Cache-Control (the stored copy lives long at the edge).
function clientCopy(cached, disposition) {
  const headers = new Headers(cached.headers)
  headers.set('Cache-Control', `public, max-age=${CLIENT_DOWNLOAD_MAX_AGE}`)
  headers.set('Content-Disposition', disposition)
  return new Response(cached.body, { status: cached.status, headers })
}

// The asset API answers 302 to a short-lived signed URL; follow it here WITHOUT the token.
async function fetchAsset(env, assetId) {
  const assetUrl = `${GITHUB_API}/repos/${REPO}/releases/assets/${assetId}`
  let response = await fetch(assetUrl, {
    headers: githubHeaders(env, 'application/octet-stream'),
    redirect: 'manual',
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location')
    if (!location) return null
    response = await fetch(location, { headers: { 'User-Agent': USER_AGENT } })
  }
  if (!response.ok || !response.body) {
    console.error('github_asset_failed', response.status)
    return null
  }
  return response
}
