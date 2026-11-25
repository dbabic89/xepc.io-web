#!/usr/bin/env bash
# Regenerates the store QR codes in public/. Until the store listings exist the codes point at
# the download section and the QR/badge tiles in the three index.html files are not links;
# once they exist, set the store URLs here and wrap .qr/.store in <a> with the same URLs.
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../public" && pwd)"
# npx from inside the worker folder hangs; run it from an empty temp dir
cd "$(mktemp -d)"
ANDROID_URL="https://maqo.xepc.io/#download"
IOS_URL="https://maqo.xepc.io/#download"
npx -y qrcode@1.5.4 -t svg -e M -d 0f172a -l ffffff -o "$OUT/qr-android.svg" "$ANDROID_URL"
npx -y qrcode@1.5.4 -t svg -e M -d 0f172a -l ffffff -o "$OUT/qr-ios.svg" "$IOS_URL"
