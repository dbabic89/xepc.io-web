import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import worker from '../src/worker.js'

const TOKEN = 'ghp_SECRET_TOKEN_VALUE'
const SHA = 'a'.repeat(64)

function asset(id, name, extra = {}) {
  return { id, name, size: 5, state: 'uploaded', digest: `sha256:${SHA}`, ...extra }
}

function release(tag, publishedAt, assets, extra = {}) {
  return { tag_name: tag, draft: false, prerelease: false, published_at: publishedAt, assets, ...extra }
}

const RELEASES = [
  release('android-v1.0.0', '2026-10-01T10:00:00Z', [asset(1, 'Maqo-1.0.0.apk')]),
  release('android-v1.2.0', '2026-10-10T10:00:00Z', [asset(2, 'Maqo-1.2.0.apk')]),
  release('android-v1.3.0', null, [asset(3, 'Maqo-1.3.0.apk')], { draft: true }),
  release('desktop-v2.0.0', '2026-10-05T10:00:00Z', [asset(4, 'Maqo-2.0.0.dmg'), asset(5, 'Maqo-2.0.0.msi')]),
  release('desktop-v2.1.0', '2026-10-12T10:00:00Z', [asset(6, 'Maqo-2.1.0.dmg'), asset(7, 'Maqo-2.1.0.msi')]),
]

let calls
let cacheStore
let releases

function installStubs() {
  calls = []
  cacheStore = new Map()
  globalThis.caches = {
    default: {
      async match(request) {
        const stored = cacheStore.get(request.url)
        return stored ? stored.clone() : undefined
      },
      async put(request, response) {
        cacheStore.set(request.url, new Response(await response.arrayBuffer(), response))
      },
    },
  }
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    calls.push({ url, init })
    if (url.includes('/releases?per_page=')) {
      return new Response(JSON.stringify(releases), { status: 200 })
    }
    const assetMatch = /\/releases\/assets\/(\d+)$/.exec(url)
    if (assetMatch) {
      return new Response(null, { status: 302, headers: { Location: `https://signed.example.test/blob/${assetMatch[1]}` } })
    }
    if (url.startsWith('https://signed.example.test/blob/')) {
      return new Response('BINARY', { status: 200, headers: { 'Content-Length': '6' } })
    }
    return new Response('unexpected', { status: 500 })
  }
}

function makeCtx() {
  const pending = []
  return { waitUntil: (promise) => pending.push(promise), settle: () => Promise.all(pending) }
}

async function call(path, { method = 'GET', env, headers } = {}) {
  const ctx = makeCtx()
  const response = await worker.fetch(
    new Request(`https://maqo.xepc.io${path}`, { method, headers }),
    env ?? { GITHUB_TOKEN: TOKEN, ASSETS: { fetch: async () => new Response('<html>page</html>') } },
    ctx,
  )
  await ctx.settle()
  return response
}

beforeEach(() => {
  releases = RELEASES
  installStubs()
})

describe('latest.json', () => {
  it('lists the newest non-draft release per platform prefix', async () => {
    const response = await call('/latest.json')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Cache-Control'), /max-age=600/)
    const manifest = await response.json()
    assert.deepEqual(Object.keys(manifest).sort(), ['android', 'macos', 'windows'])
    assert.equal(manifest.android.version, '1.2.0')
    assert.equal(manifest.macos.version, '2.1.0')
    assert.equal(manifest.windows.version, '2.1.0')
    assert.equal(manifest.android.url, 'https://maqo.xepc.io/download/android')
    assert.equal(manifest.android.sha256, SHA)
    assert.equal(manifest.android.size, 5)
    assert.equal(manifest.android.publishedAt, '2026-10-10T10:00:00Z')
  })

  it('leaves out a platform that is not in the releases', async () => {
    releases = [RELEASES[1]]
    const manifest = await (await call('/latest.json')).json()
    assert.deepEqual(Object.keys(manifest), ['android'])
  })

  it('leaves out a platform whose release has no matching asset', async () => {
    releases = [release('desktop-v3.0.0', '2026-10-20T10:00:00Z', [asset(9, 'Maqo-3.0.0.dmg')])]
    const manifest = await (await call('/latest.json')).json()
    assert.deepEqual(Object.keys(manifest), ['macos'])
  })

  it('hits GitHub once per cache window and authenticates correctly', async () => {
    await call('/latest.json')
    await call('/latest.json')
    const github = calls.filter((c) => c.url.includes('/releases?per_page='))
    assert.equal(github.length, 1)
    const headers = github[0].init.headers
    assert.equal(headers.Authorization, `Bearer ${TOKEN}`)
    assert.ok(headers.Accept)
    assert.ok(headers['User-Agent'])
    assert.ok(headers['X-GitHub-Api-Version'])
  })

  it('answers 502 JSON when GitHub fails', async () => {
    globalThis.fetch = async () => new Response('boom', { status: 500 })
    const response = await call('/latest.json')
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'upstream_unavailable' })
  })
})

describe('download', () => {
  it('streams the current asset with a clean filename and never sends the token to the signed URL', async () => {
    const response = await call('/download/android')
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'BINARY')
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="Maqo-1.2.0.apk"')
    assert.equal(response.headers.get('Content-Length'), '6')
    const assetCall = calls.find((c) => c.url.endsWith('/releases/assets/2'))
    assert.equal(assetCall.init.headers.Accept, 'application/octet-stream')
    assert.equal(assetCall.init.headers.Authorization, `Bearer ${TOKEN}`)
    const signedCall = calls.find((c) => c.url.startsWith('https://signed.example.test/'))
    assert.equal(signedCall.init.headers.Authorization, undefined)
  })

  it('serves the second request from the cache keyed by asset id', async () => {
    await call('/download/macos')
    const second = await call('/download/macos')
    assert.equal(await second.text(), 'BINARY')
    assert.equal(calls.filter((c) => c.url.endsWith('/releases/assets/6')).length, 1)
    assert.ok(cacheStore.has('https://maqo.xepc.io/_cache/asset/6'))
  })

  it('does not serve a stale file after a new release', async () => {
    await call('/download/android')
    releases = [release('android-v1.4.0', '2026-10-20T10:00:00Z', [asset(20, 'Maqo-1.4.0.apk')])]
    cacheStore.delete('https://maqo.xepc.io/_cache/release-state-v2')
    const response = await call('/download/android')
    assert.match(response.headers.get('Content-Disposition'), /Maqo-1\.4\.0\.apk/)
    assert.ok(calls.some((c) => c.url.endsWith('/releases/assets/20')))
  })

  it('HEAD returns headers without fetching the asset', async () => {
    const response = await call('/download/windows', { method: 'HEAD' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="Maqo-2.1.0.msi"')
    assert.equal(response.headers.get('Content-Length'), '5')
    assert.equal(await response.text(), '')
    assert.equal(calls.some((c) => c.url.includes('/releases/assets/')), false)
  })

  it('answers 404 not_published for an unknown key', async () => {
    for (const path of ['/download/linux', '/download/', '/download', '/download/toString']) {
      const response = await call(path)
      assert.equal(response.status, 404, path)
      assert.deepEqual(await response.json(), { error: 'not_published' })
    }
  })

  it('answers 404 not_published for a platform with no release', async () => {
    releases = [RELEASES[1]]
    const response = await call('/download/windows')
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'not_published' })
  })

  it('rejects other methods with JSON', async () => {
    const response = await call('/download/android', { method: 'POST' })
    assert.equal(response.status, 405)
    assert.deepEqual(await response.json(), { error: 'method_not_allowed' })
  })
})

describe('releases.json', () => {
  it('lists every release newest first with both desktop assets in one entry', async () => {
    const response = await call('/releases.json')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Cache-Control'), /max-age=600/)
    const { releases: list } = await response.json()
    assert.deepEqual(
      list.map((r) => `${r.platform}-${r.version}`),
      ['desktop-2.1.0', 'desktop-2.0.0', 'android-1.2.0', 'android-1.0.0'],
    )
    assert.deepEqual(list[0], {
      platform: 'desktop',
      version: '2.1.0',
      publishedAt: '2026-10-12T10:00:00Z',
      notes: '',
      assets: [
        { key: 'macos', size: 5, sha256: SHA },
        { key: 'windows', size: 5, sha256: SHA },
      ],
    })
    assert.deepEqual(Object.keys(list[1].assets[0]), ['key', 'size', 'sha256'])
  })

  it('keeps the release body as notes and a missing digest as null', async () => {
    releases = [release('android-v1.0.0', '2026-10-01T10:00:00Z', [asset(1, 'Maqo-1.0.0.apk', { digest: null })], { body: 'Fixes' })]
    const { releases: list } = await (await call('/releases.json')).json()
    assert.equal(list[0].notes, 'Fixes')
    assert.equal(list[0].assets[0].sha256, null)
  })

  it('sorts by SemVer, not by text or date, and puts desktop before android for one version', async () => {
    releases = [
      release('android-v1.9.0', '2026-10-20T10:00:00Z', [asset(1, 'a.apk')]),
      release('android-v1.10.0', '2026-10-01T10:00:00Z', [asset(2, 'b.apk')]),
      release('desktop-v1.10.0', '2026-10-01T10:00:00Z', [asset(3, 'c.dmg')]),
    ]
    const { releases: list } = await (await call('/releases.json')).json()
    assert.deepEqual(
      list.map((r) => `${r.platform}-${r.version}`),
      ['desktop-1.10.0', 'android-1.10.0', 'android-1.9.0'],
    )
  })

  it('skips drafts, prereleases, bad tags and releases without a matching asset', async () => {
    releases = [
      release('android-v1.0.0', '2026-10-01T10:00:00Z', [asset(1, 'a.apk')]),
      release('android-v1.1.0', null, [asset(2, 'b.apk')], { draft: true }),
      release('android-v1.2.0', '2026-10-02T10:00:00Z', [asset(3, 'c.apk')], { prerelease: true }),
      release('android-v1.3.0-beta', '2026-10-03T10:00:00Z', [asset(4, 'd.apk')]),
      release('android-v1.4', '2026-10-03T10:00:00Z', [asset(5, 'e.apk')]),
      release('ios-v1.0.0', '2026-10-03T10:00:00Z', [asset(6, 'f.ipa')]),
      release('android-v1.5.0', '2026-10-04T10:00:00Z', [asset(7, 'g.apk', { state: 'starter' })]),
      release('desktop-v2.0.0', '2026-10-05T10:00:00Z', [asset(8, 'h.zip')]),
    ]
    const { releases: list } = await (await call('/releases.json')).json()
    assert.deepEqual(list.map((r) => r.version), ['1.0.0'])
  })

  it('follows pages until a short page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      release(`android-v1.0.${i}`, '2026-10-01T10:00:00Z', [asset(1000 + i, `Maqo-1.0.${i}.apk`)]),
    )
    const page2 = [release('android-v2.0.0', '2026-10-02T10:00:00Z', [asset(9, 'Maqo-2.0.0.apk')])]
    const requested = []
    globalThis.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.url
      requested.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return new Response(JSON.stringify(page === 1 ? page1 : page2), { status: 200 })
    }
    const { releases: list } = await (await call('/releases.json')).json()
    assert.equal(list.length, 101)
    assert.equal(list[0].version, '2.0.0')
    assert.equal(requested.length, 2)
    assert.ok(requested.every((url) => url.includes('per_page=100')))
  })

  it('stops after 10 pages', async () => {
    let fetched = 0
    globalThis.fetch = async () => {
      fetched += 1
      const base = fetched * 1000
      return new Response(
        JSON.stringify(Array.from({ length: 100 }, (_, i) => release(`android-v1.${fetched}.${i}`, '2026-10-01T10:00:00Z', [asset(base + i, 'x.apk')]))),
        { status: 200 },
      )
    }
    const { releases: list } = await (await call('/releases.json')).json()
    assert.equal(fetched, 10)
    assert.equal(list.length, 1000)
  })

  it('answers 502 when a later page fails', async () => {
    let fetched = 0
    globalThis.fetch = async () => {
      fetched += 1
      if (fetched === 2) return new Response('boom', { status: 500 })
      return new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => release(`android-v1.0.${i}`, null, [asset(i, 'x.apk')]))), { status: 200 })
    }
    const response = await call('/releases.json')
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'upstream_unavailable' })
  })

  it('supports HEAD, rejects other methods and needs the token', async () => {
    const head = await call('/releases.json', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    const post = await call('/releases.json', { method: 'POST' })
    assert.equal(post.status, 405)
    const unconfigured = await call('/releases.json', { env: {} })
    assert.equal(unconfigured.status, 500)
    assert.deepEqual(await unconfigured.json(), { error: 'not_configured' })
  })
})

describe('versioned download', () => {
  it('streams an older version through the same asset-cache path', async () => {
    const response = await call('/download/android/1.0.0')
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'BINARY')
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="Maqo-1.0.0.apk"')
    assert.ok(calls.some((c) => c.url.endsWith('/releases/assets/1')))
    assert.ok(cacheStore.has('https://maqo.xepc.io/_cache/asset/1'))
    const second = await call('/download/android/1.0.0')
    assert.equal(await second.text(), 'BINARY')
    assert.equal(calls.filter((c) => c.url.endsWith('/releases/assets/1')).length, 1)
  })

  it('picks the asset of the requested key within a desktop release', async () => {
    const response = await call('/download/windows/2.0.0')
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="Maqo-2.0.0.msi"')
    assert.ok(calls.some((c) => c.url.endsWith('/releases/assets/5')))
  })

  it('HEAD returns headers without fetching the asset', async () => {
    const response = await call('/download/macos/2.0.0', { method: 'HEAD' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="Maqo-2.0.0.dmg"')
    assert.equal(calls.some((c) => c.url.includes('/releases/assets/')), false)
  })

  it('answers 404 not_published for an unknown version', async () => {
    for (const path of ['/download/android/9.9.9', '/download/android/1.3.0', '/download/windows/1.0.0']) {
      const response = await call(path)
      assert.equal(response.status, 404, path)
      assert.deepEqual(await response.json(), { error: 'not_published' })
    }
  })

  it('answers 404 not_published for a malformed version or path', async () => {
    for (const path of [
      '/download/android/1.0',
      '/download/android/v1.0.0',
      '/download/android/1.0.0-beta',
      '/download/android/latest',
      '/download/android/',
      '/download/android/1.0.0/extra',
      '/download/linux/1.0.0',
    ]) {
      const response = await call(path)
      assert.equal(response.status, 404, path)
      assert.deepEqual(await response.json(), { error: 'not_published' })
    }
  })

  it('leaves /download/<key> on the newest version', async () => {
    const response = await call('/download/android')
    assert.match(response.headers.get('Content-Disposition'), /Maqo-1\.2\.0\.apk/)
  })
})

describe('routing and secrecy', () => {
  it('falls through to the static assets', async () => {
    const response = await call('/')
    assert.equal(await response.text(), '<html>page</html>')
  })

  it('answers not_configured without a token', async () => {
    const response = await call('/latest.json', { env: {} })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'not_configured' })
  })

  it('never leaks the token, the repo or GitHub URLs in any response', async () => {
    const outputs = []
    const originalError = console.error
    console.error = (...args) => outputs.push(args.join(' '))
    try {
      const bodies = []
      for (const [path, method] of [
        ['/latest.json', 'GET'],
        ['/download/android', 'GET'],
        ['/download/linux', 'GET'],
        ['/download/android', 'POST'],
        ['/download/windows', 'HEAD'],
      ]) {
        const response = await call(path, { method })
        bodies.push(await response.text(), JSON.stringify([...response.headers]))
      }
      globalThis.fetch = async () => new Response(`${TOKEN} dbabic89/maqo-releases`, { status: 500 })
      cacheStore.clear()
      for (const path of ['/latest.json', '/download/android']) {
        const response = await call(path)
        bodies.push(await response.text(), JSON.stringify([...response.headers]))
      }
      for (const text of [...bodies, ...outputs]) {
        assert.ok(!text.includes(TOKEN), 'token leaked')
        assert.ok(!text.includes('maqo-releases'), 'repo leaked')
        assert.ok(!text.includes('github.com'), 'github url leaked')
        assert.ok(!text.includes('api.github'), 'github api url leaked')
      }
    } finally {
      console.error = originalError
    }
  })
})
