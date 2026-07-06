#!/usr/bin/env bash
set -euo pipefail

# ── parse flags ──
FORCE=false
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)   FORCE=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── ngrok URL ──
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "
import sys, json; d=json.load(sys.stdin)
print(d['tunnels'][0]['public_url'])
")
echo "🌐 Ngrok URL: $NGROK_URL"

# ── write backend-url.json ──
mkdir -p dist
echo "{\"url\":\"$NGROK_URL\"}" > dist/backend-url.json

# ── stable-versions.json ──
VERSIONS_FILE="public/stable-versions.json"
if [ ! -f "$VERSIONS_FILE" ]; then
  echo '{"default":"master","versions":["master"]}' > "$VERSIONS_FILE"
fi

# ── build a single version ──
build_version() {
  local ver="$1"
  local outdir="dist/$ver"

  # Check if already built and not forced
  if [ -d "$outdir" ] && [ -f "$outdir/index.html" ] && [ "$FORCE" = false ]; then
    echo "⏭ $ver already built"
    return
  fi

  echo "🔨 Building $ver ..."
  # Build from a clean worktree — always the right ref
  local tmpdir
  tmpdir=$(mktemp -d)
  git worktree add -f "$tmpdir" "$ver"
  (
    cd "$tmpdir"
    bun install --frozen-lockfile 2>/dev/null || true
    bun run build.ts --version "$ver"
  )
  cp -r "$tmpdir/dist/$ver" "$outdir"
  git worktree remove -f "$tmpdir"
  echo "✅ $ver → $outdir"
}

# ── if --version specified, build only that ──
if [ -n "$VERSION" ]; then
  build_version "$VERSION"
# ── otherwise build master + all tagged versions in stable-versions.json ──
else
  build_version "master"

  python3 -c "
import json
d = json.load(open('$VERSIONS_FILE'))
for v in d['versions']:
    if v != 'master':
        print(v)
" | while read -r tag; do
    build_version "$tag"
  done
fi

# ── root index.html ──
cp public/root-index.html dist/index.html
cp "$VERSIONS_FILE" dist/stable-versions.json

echo ""
echo "📦 dist/ ready for gh-pages:"
ls -la dist/

echo ""
echo "🚀 Pushing to gh-pages ..."
cd dist
git init -q
git checkout -b gh-pages 2>/dev/null || git checkout gh-pages
git add -A
git commit -q -m "deploy: update versions" --allow-empty
git remote set-url origin "git@github.com:IrSent/obrez-ts.git" 2>/dev/null || git remote add origin "git@github.com:IrSent/obrez-ts.git"
git push -f origin gh-pages

echo ""
echo "✅ Deployed!"
