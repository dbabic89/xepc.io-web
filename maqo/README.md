# maqo.xepc.io

Cloudflare Worker `maqo-download`: the public download page and update manifest for Maqo.

- `GET /latest.json` — newest published version per platform (`android`, `macos`, `windows`), cached 10 min.
  A platform with nothing published is absent. Shape per key: `version`, `url`, `size`, `sha256`, `publishedAt`.
- `GET|HEAD /download/{android|macos|windows}` — streams the current binary from the private releases repo;
  cached at the edge by asset id, so GitHub sees one download per new version. Unknown key: `404 {"error":"not_published"}`.
- Everything else is the static page in `public/` (served through the `[assets]` binding).

The release repo is read with a fine-grained token; the token, the repo name and GitHub URLs never appear in
any response or log line. Tag/asset naming it relies on: `android-vX.Y.Z` (`Maqo-X.Y.Z.apk`) and
`desktop-vX.Y.Z` (`Maqo-X.Y.Z.dmg`, `Maqo-X.Y.Z.msi`).

This folder is not part of the main site: `build.sh` skips `maqo/`, and it deploys with its own `wrangler.toml`.

## Secret (once)

Create a fine-grained personal access token limited to the releases repo, permission Contents: read. Then:

```sh
cd maqo
npx wrangler login          # once per machine
npx wrangler secret put GITHUB_TOKEN
```

Paste the token at the prompt. It is stored in Cloudflare only, never in this repo.

## Deploy

```sh
cd maqo
npx wrangler deploy
```

`public/` must exist (the download page). The first deploy attaches the custom domain `maqo.xepc.io`
(`routes` with `custom_domain = true`); in the Cloudflare dashboard, check under Workers & Pages >
`maqo-download` > Settings > Domains & Routes that `maqo.xepc.io` is listed. The `xepc.io` zone must be in the
same Cloudflare account, and the domain must not already have a conflicting DNS record.

Logs: Workers & Pages > `maqo-download` > Logs (observability is on).

## Test

No dependencies, no build step:

```sh
cd maqo
node --test
```
