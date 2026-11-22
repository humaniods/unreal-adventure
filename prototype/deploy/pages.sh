#!/usr/bin/env bash
# Publish the game (prototype/walk-test) to GitHub Pages: https://<owner>.github.io/<repo>/
# On Pages there is no trek server, so rooms run Ludo style: the browser that creates a room hosts it (js/net/p2p.js).
# Run from anywhere inside the repo after committing; it force-updates the gh-pages branch with that folder only.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git subtree split --prefix prototype/walk-test -b gh-pages-build >/dev/null
git push -f origin gh-pages-build:gh-pages
git branch -D gh-pages-build >/dev/null
echo "Pushed. GitHub Pages rebuilds in about a minute."
