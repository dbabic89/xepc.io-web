#!/bin/sh
# Assembles getkanchie.xepc.io into kanchie/dist/ (deployed by kanchie/wrangler.toml).
# Every file in assets/ gets a content hash in its file name: /assets/* is cached
# immutable for a year, so a changed file needs a new URL. Never a query string
# (see the root build.sh for why).
set -e
cd "$(dirname "$0")"
rm -rf dist
cp -R site dist

# Fonts and images first: kanchie.css references them, so its own hash must be
# computed after those references are rewritten.
for pass in "ttf svg webp" "css js"; do
  for ext in $pass; do
    for f in dist/assets/*."$ext"; do
      [ -f "$f" ] || continue
      base=$(basename "$f" ".$ext")
      hash=$(shasum -a 256 "$f" | cut -c1-8)
      new="${base}.${hash}.${ext}"
      mv "$f" "dist/assets/$new"
      # References: "/assets/x.ext" in HTML, url(x.ext) in CSS.
      find dist -name '*.html' -exec sed -i '' "s|/assets/${base}\.${ext}\"|/assets/${new}\"|g" {} +
      find dist/assets -name '*.css' -exec sed -i '' "s|url(${base}\.${ext})|url(${new})|g" {} +
    done
  done
done

# Fail if any unhashed asset reference survived.
if grep -REn '/assets/[a-z-]+\.(css|js|svg|ttf|webp)"|url\([a-z-]+\.(ttf|svg|webp)\)' dist; then
  echo "unhashed asset reference left in dist/" >&2; exit 1
fi
echo "kanchie/dist ready: $(find dist -type f | wc -l | tr -d ' ') files"
