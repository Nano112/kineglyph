#!/usr/bin/env bash
# Build Kineglyph's Pagina article exactly as it is deployed to GitHub Pages.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGINA_ROOT="${PAGINA_ROOT:-$REPO_ROOT/../pagina}"
PAGINA_CLI="$PAGINA_ROOT/packages/cli/dist/cli.js"
OUT="${1:-$REPO_ROOT/site}"
case "$OUT" in
  /*) ;;
  *) OUT="$REPO_ROOT/$OUT" ;;
esac
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

# Ship complete framework-free examples beside the Pagina article. They import the same locally
# built workspace bundle as the live documentation, so Pages never demonstrates a stale npm
# release while a new primitive is being published.
DASHBOARD_OUT="$OUT/examples/operational-dashboard"
echo "==> dashboard ${BASE}examples/operational-dashboard/"
npx vite build "$REPO_ROOT/examples/operational-dashboard" \
  --outDir "$DASHBOARD_OUT" \
  --base "${BASE}examples/operational-dashboard/" \
  --emptyOutDir

LIMITS_OUT="$OUT/examples/microchart-limits"
echo "==> microchart limits ${BASE}examples/microchart-limits/"
npx vite build "$REPO_ROOT/examples/microchart-limits" \
  --outDir "$LIMITS_OUT" \
  --base "${BASE}examples/microchart-limits/" \
  --emptyOutDir

cp "$WORK/kineglyph.pgz" "$OUT.pgz"
echo "==> wrote $OUT and $OUT.pgz"
