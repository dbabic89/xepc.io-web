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

# Content-hash query on CSS references: /assets/* is immutable for a year, so a
# changed stylesheet needs a new URL to reach returning visitors.
for css in dist/assets/*.css; do
  [ -f "$css" ] || continue
  name=$(basename "$css")
  hash=$(shasum -a 256 "$css" | cut -c1-8)
  find dist -name '*.html' -exec sed -i.bak "s|${name}\"|${name}?v=${hash}\"|g" {} +
  find dist -name '*.html.bak' -delete
done

echo "dist/ ready: $(find dist -type f | wc -l | tr -d ' ') files"
