#!/bin/sh
# Assembles the publishable site into dist/ so that .git (and any repo-only
# files) are never part of the deployed output.
set -e
rm -rf dist
mkdir -p dist
cp index.html 404.html robots.txt sitemap.xml _headers dist/
cp -r assets dist/

# Landing pages: every directory holding an index.html is published.
# Discovered instead of listed, so a new page never gets left out of dist/.
for d in */; do
  case "$d" in
    dist/|assets/|maqo/|.git/) continue ;;
  esac
  [ -f "$d/index.html" ] || continue
  mkdir -p "dist/$d"
  cp "$d/index.html" "dist/$d"
done

# Static EN/DE variants + sitemap with hreflang alternates.
node scripts/build-locales.mjs

# Content-hashed CSS file names: /assets/* is immutable for a year, so a changed
# stylesheet needs a new URL. The hash goes in the file name, not a query string:
# static assets ignore the query, so during a rollout an edge still on the old
# version answered "site.css?v=<new>" with the old file and browsers kept it for
# a year. A new file name the old version lacks 404s instead of caching stale CSS.
for css in dist/assets/*.css; do
  [ -f "$css" ] || continue
  name=$(basename "$css" .css)
  hash=$(shasum -a 256 "$css" | cut -c1-8)
  mv "$css" "dist/assets/${name}.${hash}.css"
  find dist -name '*.html' -exec sed -i.bak "s|assets/${name}\.css\"|assets/${name}.${hash}.css\"|g" {} +
  find dist -name '*.html.bak' -delete
done

echo "dist/ ready: $(find dist -type f | wc -l | tr -d ' ') files"
