#!/usr/bin/env bash
set -euo pipefail

# ── parse flags ──
FORCE=false
VERSION=""
BUILD=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)   FORCE=true; shift ;;
    --version) VERSION="$2"; shift 2 ;;
    --skip-build) BUILD=false; shift ;;
    *)         echo "Unknown option: $1"; exit 1 ;;
  esac
done

REPO="git@github.com:IrSent/obrez-ts.git"
REPO_DIR=$(pwd)
WORKDIR=$(mktemp -d)

echo "📂 Working dir: $WORKDIR"

# ── clone gh-pages ──
git clone --depth 1 -b gh-pages "$REPO" "$WORKDIR" > /dev/null 2>&1

# ── ngrok URL ──
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "
import sys, json; d=json.load(sys.stdin)
print(d['tunnels'][0]['public_url'])
")
echo "🌐 Ngrok URL: $NGROK_URL"

# ── write backend-url.json (always) ──
echo "{\"url\":\"$NGROK_URL\"}" > "$WORKDIR/backend-url.json"

# ── update Telegram bot Menu Button URL ──
BOT_TOKEN=$(grep TELEGRAM_BOT_TOKEN "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2- || true)
BOT_TOKEN="${BOT_TOKEN:-$(grep TELEGRAM_BOT_TOKEN ~/gh/GigaAM/.env 2>/dev/null | cut -d= -f2- || true)}"
if [ -n "$BOT_TOKEN" ]; then
  TG_OK=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
    -H "Content-Type: application/json" \
    -d "{\"menu_button\":{\"type\":\"web_app\",\"text\":\"Open Obrez\",\"web_app\":{\"url\":\"$NGROK_URL\"}}}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "False")
  if [ "$TG_OK" = "True" ]; then
    echo "🤖 Telegram Menu Button updated"
  else
    echo "⚠ Failed to update Telegram Menu Button"
  fi
else
  echo "⚠ No TELEGRAM_BOT_TOKEN found — skipping Telegram Menu Button update"
fi

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
    )
    rm -rf "$outdir"
    mkdir -p "$outdir"
    cp -r "$tmpdir/dist/$ver/"* "$outdir"/
    git worktree remove -f "$tmpdir"
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

# ── root index.html (redirects to default version) ──
cat > "$WORKDIR/index.html" << 'REDIRECT'
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Obrez</title>
<meta http-equiv="refresh" content="3;url=master/">
<script>
fetch('stable-versions.json').then(r=>r.json()).then(d=>{
  const v = localStorage.getItem('obrez-version');
  const ver = (v && d.versions.includes(v)) ? v : d.default;
  window.location.replace(ver+'/');
}).catch(function(){ window.location.replace('master/'); });
</script></head><body></body></html>
REDIRECT

# ── settings-early and settings-ui (shared across versions) ──
# Build copies them into master/; we need them at the root level (../ resolution)
cp "$WORKDIR/master/settings-early."*.js "$WORKDIR/" 2>/dev/null || true
cp "$WORKDIR/master/settings-ui."*.js "$WORKDIR/" 2>/dev/null || true

# ── commit and push ──
cd "$WORKDIR"
git add -A
git commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)" --allow-empty
git push -f origin gh-pages

# ── cleanup ──
rm -rf "$WORKDIR"

echo ""
echo "✅ Deployed!"
