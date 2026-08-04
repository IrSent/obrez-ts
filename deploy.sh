#!/usr/bin/env bash
set -euo pipefail

# ── parse flags ──
FORCE=false
VERSION=""
BUILD=true
SKIP_CF=false
SKIP_GH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)      FORCE=true; shift ;;
    --version)    VERSION="$2"; shift 2 ;;
    --skip-build) BUILD=false; shift ;;
    --skip-cf)    SKIP_CF=true; shift ;;
    --skip-gh)    SKIP_GH=true; shift ;;
    *)            echo "Unknown option: $1"; exit 1 ;;
  esac
done

REPO="git@github.com:IrSent/obrez-ts.git"
REPO_DIR=$(pwd)
WORKDIR=$(mktemp -d)

# ── backend URL (read from repo's backend-url.json, or environment override) ──
BACKEND_URL="${BACKEND_URL:-$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['url'])" "$REPO_DIR/public/backend-url.json")}"
echo "🌐 Backend URL: $BACKEND_URL"

# ── write backend-url.json ──
echo "{\"url\":\"$BACKEND_URL\"}" > "$WORKDIR/backend-url.json"

# ── build versions ──
if [ "$BUILD" = true ]; then
  VERSIONS_FILE="$REPO_DIR/public/stable-versions.json"
  if [ ! -f "$VERSIONS_FILE" ]; then
    echo '{"default":"master","versions":["master"]}' > "$VERSIONS_FILE"
  fi

  build_version() {
    local ver="$1"
    local outdir="$WORKDIR/$ver"

    if [ -d "$outdir" ] && [ -f "$outdir/index.html" ] && [ "$FORCE" = false ]; then
      echo "⏭ $ver already built"
      return
    fi

    echo "🔨 Building $ver ..."
    local tmpdir
    tmpdir=$(mktemp -d)
    git worktree add -f "$tmpdir" "$ver"
    (
      cd "$tmpdir"
      bun install 2>/dev/null || true
      bun run build.ts --version "$ver"
    ) || true
    rm -rf "$outdir"
    mkdir -p "$outdir"
    if [ -d "$tmpdir/dist/$ver" ]; then
      cp -r "$tmpdir/dist/$ver/"* "$outdir"/
    fi
    git worktree remove -f "$tmpdir" 2>/dev/null || true
    echo "✅ $ver → $outdir"
  }

  if [ -n "$VERSION" ]; then
    build_version "$VERSION"
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

  # ── stable-versions.json ──
  cp "$VERSIONS_FILE" "$WORKDIR/stable-versions.json"
fi

# ── root index.html ──
cp "$REPO_DIR/public/root-index.html" "$WORKDIR/index.html"

# ── settings-early and settings-ui (shared across versions, ../ resolution) ──
if [ -d "$WORKDIR/master" ]; then
  cp "$WORKDIR/master/settings-early."*.js "$WORKDIR/" 2>/dev/null || true
  cp "$WORKDIR/master/settings-ui."*.js "$WORKDIR/" 2>/dev/null || true
fi

# ── deploy to GitHub Pages ──
if [ "$SKIP_GH" = false ]; then
  echo "🚀 Deploying to GitHub Pages..."
  # Clone gh-pages to a separate temp dir to preserve WORKDIR
  GH_WORKDIR=$(mktemp -d)
  git clone --depth 1 -b gh-pages "$REPO" "$GH_WORKDIR" > /dev/null 2>&1

  # Copy built content
  cp -r "$WORKDIR/"* "$GH_WORKDIR/"

  cd "$GH_WORKDIR"
  git add -A
  git commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)" --allow-empty
  git push -f origin gh-pages
  rm -rf "$GH_WORKDIR"
  echo "✅ Deployed to GitHub Pages!"
fi

# ── deploy to Cloudflare Pages ──
if [ "$SKIP_CF" = false ]; then
  echo "🚀 Deploying to Cloudflare Pages..."
  cd "$REPO_DIR"
  bunx wrangler pages deploy "$WORKDIR" --project-name obrez-ts --branch production --commit-message "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "✅ Deployed to Cloudflare Pages!"
fi

# ── cleanup ──
rm -rf "$WORKDIR"

echo ""
echo "🎉 Deploy complete!"
