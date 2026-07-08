# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) (runtime + package manager)
- Node.js TLS certificates for local development (`~/localhost+2.pem`, `~/localhost+2-key.pem`)
- Python 3 (used by `deploy.sh` for JSON parsing)

## Install

```bash
cd ~/gh/obrez-ts
bun install
```

## Development

Start the dev server with hot reload:

```bash
bun run dev
# → https://localhost:3000
```

The dev server watches `src/` and `public/` for changes, rebuilds all versions, and pushes a WebSocket live-reload to open browser tabs.

### Dev server details

- **Port**: 3000 (TLS via local certs)
- **Live reload**: WebSocket at `/_livereload` — injected into every `index.html` at runtime
- **Multi-version**: builds `master` + all git tags into `dist/<version>/`
- **Root index**: `public/root-index.html` serves as a version switcher at `/`

## Build

Production build (single version):

```bash
bun run build
# → dist/
```

Build a specific version for deployment:

```bash
bun run build --version v1.2.3
# → dist/v1.2.3/
```

### Build process

1. Clean `dist/` (or `dist/<version>/` in deploy mode)
2. Copy `public/` assets
3. **Cache-bust**: `settings-early.js` and `settings-ui.js` are copied with MD5 hash in filename (e.g. `settings-early.a1b2c3d4.js`) — GitHub Pages caches for 600s, so new filename = fresh content
4. Copy `phase-vocoder-processor.js` from `@soundtouchjs/phase-vocoder-worklet`
5. Build via `Bun.build()` with Tailwind plugin
6. Inject settings scripts into `index.html`

## Serve

```bash
bun x serve ./dist/
```

## Deploy

```bash
bash deploy.sh               # build master + all tags, push to gh-pages
bash deploy.sh --skip-build   # only update ngrok backend URL
bash deploy.sh --force        # rebuild even if already built
bash deploy.sh --version v1.2.3  # build specific tag
```

Deploy steps:
1. Clone `gh-pages` branch into a temp directory
2. Read ngrok URL from `curl http://127.0.0.1:4040/api/tunnels` → write `backend-url.json`
3. Build each version (if not `--skip-build`)
4. Copy root `index.html`, `settings-early.*.js`, `settings-ui.*.js`
5. Commit and force-push to `gh-pages`

## Typecheck

```bash
bun run typecheck
```
