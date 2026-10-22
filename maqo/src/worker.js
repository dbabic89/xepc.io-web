// maqo-download: public update manifest + download proxy for a private GitHub releases repo.
//   GET /latest.json                  -> { android|macos|windows: { version, url, size, sha256, publishedAt } }
//   GET /releases.json                -> { releases: [ { platform, version, publishedAt, notes, assets } ] }
//   GET|HEAD /download/<key>          -> streams the current binary of that platform
//   GET|HEAD /download/<key>/<version> -> streams that exact version's binary
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

// Tag families: PLATFORMS grouped by tag prefix (macos + windows share `desktop-v`).
const PLATFORM_FAMILIES = [
  { prefix: 'android-v', platform: 'android' },
  { prefix: 'desktop-v', platform: 'desktop' },
]

const STATE_TTL_SECONDS = 600 // release state (and latest.json) edge cache
const ASSET_TTL_SECONDS = 2592000 // stored binaries; the key is the asset id, so never stale
const CLIENT_DOWNLOAD_MAX_AGE = 300 // /download/<key> URL is constant, so clients must not hold it long
const SEMVER = /^\d+\.\d+\.\d+$/
const RELEASES_PAGE_SIZE = 100
const RELEASES_MAX_PAGES = 10
// Order of releases that share a version in /releases.json.
const PLATFORM_ORDER = ['desktop', 'android']
// Bumped whenever the shape of the cached state changes, so an old cached shape is never read.
const STATE_CACHE_PATH = '/_cache/release-state-v2'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (path === '/latest.json') {
        if (!isReadMethod(request)) return methodNotAllowed()
        return await handleLatest(request, env, ctx)
      }
      if (path === '/releases.json') {
        if (!isReadMethod(request)) return methodNotAllowed()
        return await handleReleases(request, env, ctx)
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

// Every published release (no draft, no prerelease, tag `<prefix>X.Y.Z`, at least one matching uploaded asset):
//   { releases: [ { platform, version, publishedAt, notes, assets: [ { key, assetId, size, sha256 } ] } ] }
// sorted newest version first, then by PLATFORM_ORDER. `platform` is the tag family (desktop|android), `key` the
// download key (macos|windows|android). The asset ids stay in the state only; /releases.json does not expose them.
export function buildState(releases) {
  const entries = []
  for (const release of Array.isArray(releases) ? releases : []) {
    if (!release || release.draft || release.prerelease || typeof release.tag_name !== 'string') continue
    const family = PLATFORM_FAMILIES.find((candidate) => release.tag_name.startsWith(candidate.prefix))
    if (!family) continue
    const version = release.tag_name.slice(family.prefix.length)
    if (!SEMVER.test(version)) continue
    const assets = []
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (platform.prefix !== family.prefix) continue
      const asset = (release.assets || []).find(
        (candidate) =>
          candidate &&
          typeof candidate.name === 'string' &&
          candidate.name.toLowerCase().endsWith(`.${platform.ext}`) &&
          (candidate.state === undefined || candidate.state === 'uploaded'),
      )
      if (!asset || asset.id === undefined || asset.id === null) continue
      assets.push({
        key,
        assetId: asset.id,
        size: typeof asset.size === 'number' ? asset.size : null,
        sha256: parseDigest(asset.digest),
      })
    }
    if (assets.length === 0) continue
    entries.push({
      platform: family.platform,
      version,
      publishedAt: release.published_at || release.created_at || null,
      notes: typeof release.body === 'string' ? release.body : '',
      assets,
    })
  }
  entries.sort((a, b) => compareVersions(b.version, a.version) || PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform))
  return { releases: entries }
}

function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function parseDigest(digest) {
  if (typeof digest !== 'string') return null
  const match = /^sha256:([0-9a-fA-F]{64})$/.exec(digest)
  return match ? match[1].toLowerCase() : null
}

// The newest release that has an asset for `key`, or the one at exactly `version` when given.
function findAsset(state, key, version) {
  for (const release of state.releases) {
    if (version !== undefined && release.version !== version) continue
    const asset = release.assets.find((candidate) => candidate.key === key)
    if (asset) return { ...asset, version: release.version, publishedAt: release.publishedAt }
  }
  return null
}

function manifestFrom(state) {
  const manifest = {}
  for (const key of Object.keys(PLATFORMS)) {
    const entry = findAsset(state, key)
    if (!entry) continue
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

function releasesFrom(state) {
  return {
    releases: state.releases.map((release) => ({
      platform: release.platform,
      version: release.version,
      publishedAt: release.publishedAt,
      notes: release.notes,
      assets: release.assets.map((asset) => ({ key: asset.key, size: asset.size, sha256: asset.sha256 })),
    })),
  }
}

// Cached for STATE_TTL_SECONDS at the edge. Returns null when GitHub cannot be reached.
async function loadState(env, ctx) {
  const cache = caches.default
  const cacheKey = new Request(`${PUBLIC_ORIGIN}${STATE_CACHE_PATH}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit.json()

  const all = []
  for (let page = 1; page <= RELEASES_MAX_PAGES; page++) {
    const response = await fetch(`${GITHUB_API}/repos/${REPO}/releases?per_page=${RELEASES_PAGE_SIZE}&page=${page}`, {
      headers: githubHeaders(env, 'application/vnd.github+json'),
    })
    if (!response.ok) {
      console.error('github_releases_failed', response.status)
      return null
    }
    const batch = await response.json()
    if (!Array.isArray(batch)) break
    all.push(...batch)
    if (batch.length < RELEASES_PAGE_SIZE) break
  }
  const state = buildState(all)
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

// ---- /releases.json --------------------------------------------------------------------------

async function handleReleases(request, env, ctx) {
  if (tokenMissing(env)) return json({ error: 'not_configured' }, 500)
  const state = await loadState(env, ctx)
  if (state === null) return json({ error: 'upstream_unavailable' }, 502)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${STATE_TTL_SECONDS}`,
  }
  const body = request.method === 'HEAD' ? null : JSON.stringify(releasesFrom(state))
  return new Response(body, { status: 200, headers })
}

// ---- /download/<key>[/<version>] -----------------------------------------------------------------------------------------------------------------------------------

async function handleDownload(request, env, ctx, rest) {
  const parts = rest.split('/')
  if (parts.length > 2) return notPublished()
  const key = parts[0]
  const version = parts.length === 2 ? parts[1] : undefined
  if (version !== undefined && !SEMVER.test(version)) return notPublished()
  const platform = Object.hasOwn(PLATFORMS, key) ? PLATFORMS[key] : null
  if (!platform) return notPublished()
  if (tokenMissing(env)) return json({ error: 'not_configured' }, 500)
  const state = await loadState(env, ctx)
  if (state === null) return json({ error: 'upstream_unavailable' }, 502)
  const entry = findAsset(state, key, version)
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
