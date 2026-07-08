## Key Facts

- **State machine**: `idle → playing ↔ paused`, guarded by `'transitioning'`. All changes via `transitionRef` — single gate, no concurrent stop/start.
- **Dual-path gain**: `bypassGain` (1x, no PhaseVocoderNode) + `stGain` (>1x, through PhaseVocoderNode fftSize=2048). At 1x = zero artifacts.
- **Actions outside state**: `playerActions` is a plain object, not part of Zustand state. Stable reference for `useCallback` deps.
- **Export pipeline**: 3 parallel tasks (collect/prep/renderEncode) connected by `WritableBuffer`. Segments rendered via `OfflineAudioContext`.
- **Auth**: httpOnly cookie `obrez_session`, `credentials: 'include'` on all backend fetches.
- **Bleep sounds**: persisted to IndexedDB, hydrated on app start via `hydrateBleepSounds()`.
- **Cache-bust**: `settings-early.js` / `settings-ui.js` use MD5 hash in filenames.

## Documentation

Comprehensive docs in `docs/`:
- `docs/getting-started.md` — setup, dev server, build, deploy
- `docs/architecture.md` — system design, component tree, data flow
- `docs/audio-engine.md` — PhaseVocoderNode, state machine, quality monitoring
- `docs/export-pipeline.md` — parallel tasks, WritableBuffer, codec selection
- `docs/transcription.md` — backend flow, WebSocket protocol, auth
- `docs/api-reference.md` — types, stores, hooks, functions
- `docs/testing.md` — e2e tests, diagnostic hooks

## Repomix

Optimized command for single-file codebase view (~16.8K tokens):

```bash
repomix --compress --output-show-line-numbers --remove-comments --remove-empty-lines \
  --ignore "dist/**,graphify-out/**,e2e/ru-profanity3.json,public/soundtouch-processor.js.map,*.puml,docs/**"
```

## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:
- **Always update first**: `cd ~/gh/obrez-ts && graphify update .` (AST-only, no API cost, instant). Then query the fresh graph.
- For codebase questions, run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when `query`/`path`/`explain` do not surface enough context.
