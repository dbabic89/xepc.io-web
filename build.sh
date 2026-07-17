#!/bin/sh
# Assembles the publishable site into dist/ so that .git (and any repo-only
# files) are never part of the deployed output.
set -e
rm -rf dist
mkdir -p dist
cp index.html 404.html robots.txt sitemap.xml _headers dist/
cp -r assets roles dist/
echo "dist/ ready: $(find dist -type f | wc -l | tr -d ' ') files"
