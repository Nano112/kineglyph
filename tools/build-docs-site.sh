#!/usr/bin/env bash
# Build Kineglyph's Pagina article exactly as it is deployed to GitHub Pages.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGINA_ROOT="${PAGINA_ROOT:-$REPO_ROOT/../pagina}"
PAGINA_CLI="$PAGINA_ROOT/packages/cli/dist/cli.js"
OUT="${1:-$REPO_ROOT/site}"
SITE_URL="${KINEGLYPH_SITE_URL:-https://nano112.github.io/kineglyph/}"

if [ ! -f "$PAGINA_CLI" ]; then
  echo "error: $PAGINA_CLI does not exist — install and build the pinned Pagina checkout first" >&2
  exit 1
fi

BASE="/$(printf '%s' "${SITE_URL#*://}" | cut -s -d/ -f2-)"
[ "$BASE" = "/" ] || BASE="/${BASE#/}"
case "$BASE" in */) ;; *) BASE="$BASE/" ;; esac

WORK="$(mktemp -d -t kineglyph-docs.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "==> site  $SITE_URL"
echo "==> base  $BASE"
echo "==> out   $OUT"

# The pack/unpack round trip proves the article carries every referenced snippet, asset, and
# pre-rendered figure. The deployed site is built from that portable copy, not from repository
# paths that a reader would not have.
node "$PAGINA_CLI" pack "$REPO_ROOT/docs" -o "$WORK/kineglyph.pgz" --base "$BASE"
node "$PAGINA_CLI" unpack "$WORK/kineglyph.pgz" "$WORK/article"
node "$PAGINA_CLI" build "$WORK/article" \
  --out "$OUT" \
  --strict-assets \
  --site-url "$SITE_URL"

cp "$WORK/kineglyph.pgz" "$OUT.pgz"
echo "==> wrote $OUT and $OUT.pgz"
