#!/usr/bin/env bash
# Regenerates the store QR codes in public/. The page links (href of .pg-qr a in the three
# index.html files) must point at the same URLs. Placeholders until the store listings exist.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../public" && pwd)"
# npx from inside the worker folder hangs; run it from an empty temp dir
cd "$(mktemp -d)"
ANDROID_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
IOS_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
npx -y qrcode@1.5.4 -t svg -e M -d 0f172a -l ffffff -o "$OUT/qr-android.svg" "$ANDROID_URL"
npx -y qrcode@1.5.4 -t svg -e M -d 0f172a -l ffffff -o "$OUT/qr-ios.svg" "$IOS_URL"
