# Graph Report - obrez-ts  (2026-07-08)

## Corpus Check
- 74 files · ~112,516 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 489 nodes · 697 edges · 55 communities (40 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `72347497`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Export Modal + Context|Export Modal + Context]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dictionary + Aho-Corasick|Dictionary + Aho-Corasick]]
- [[_COMMUNITY_Bleep Sounds + Icons|Bleep Sounds + Icons]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Backend Config + Server|Backend Config + Server]]
- [[_COMMUNITY_Media Player + Audio|Media Player + Audio]]
- [[_COMMUNITY_Volume Icons|Volume Icons]]
- [[_COMMUNITY_Audio Utilities|Audio Utilities]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_README|README]]
- [[_COMMUNITY_Search + Worker|Search + Worker]]
- [[_COMMUNITY_Brand Identity|Brand Identity]]
- [[_COMMUNITY_Build Script|Build Script]]
- [[_COMMUNITY_Pause Icon|Pause Icon]]
- [[_COMMUNITY_Play Icon|Play Icon]]
- [[_COMMUNITY_Replay Icon|Replay Icon]]
- [[_COMMUNITY_Main Entry|Main Entry]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 26 edges
2. `useMediaPlayerContext()` - 16 edges
3. `usePlayerActions()` - 13 edges
4. `compilerOptions` - 13 edges
5. `FastAhoScanner` - 11 edges
6. `useAuthStore` - 10 edges
7. `API Reference` - 10 edges
8. `Audio Engine` - 10 edges
9. `WritableBuffer` - 10 edges
10. `exportCensoredVideo()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `ProgressBarInner()` --calls--> `formatSeconds()`  [INFERRED]
  src/features/player/ProgressBar.tsx → src/features/auth/TopupModal.tsx
- `TranscribeProgress()` --calls--> `usePlayerStore`  [EXTRACTED]
  src/features/transcription/TranscriptionResults.tsx → src/store/playerStore.ts
- `Volume Zero - Speaker Icon (No Sound Waves)` --semantically_similar_to--> `Volume Muted - Speaker with X Overlay`  [INFERRED] [semantically similar]
  public/assets/volume-0-icon.svg → public/assets/volume-1-icon.svg
- `Volume Zero - Speaker Icon (No Sound Waves)` --semantically_similar_to--> `Volume Low - Speaker with Single Arc`  [INFERRED] [semantically similar]
  public/assets/volume-0-icon.svg → public/assets/volume-2-icon.svg
- `Volume Zero - Speaker Icon (No Sound Waves)` --semantically_similar_to--> `Volume High - Speaker with Double Arc`  [INFERRED] [semantically similar]
  public/assets/volume-0-icon.svg → public/assets/volume-off-icon.svg

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Bleep sound decode-and-play flow – decode on mount, play on demand** — bleep_sounds_bleepsoundmanager_bleepsoundmanagerinner, bleep_sounds_bleep_audio_decodeaudio, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]
- **Bleep sound add flow – modal → uid → playerActions → IndexedDB + in-memory** — bleep_sounds_bleepsoundmanager_addmodal, utils_uid_uid, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]
- **Bleep sound persistence — IndexedDB storage and in-memory hydration** — store_bleepdb_getallbleeprecords, store_bleepdb_putbleeprecord, store_bleepdb_deletebleeprecord, store_bleepdb_updatebleeplabel, store_bleepdb_dbupdateurl, store_bleepdb_upsertbleepdata, store_playerstore_hydratebleepsounds, store_playerstore_recordstosounds, types_index_bleepsound, store_bleepdb_dbrecord [EXTRACTED 1.00]
- **Volume Level Icon Set** — assets_volume_0_icon_speaker_only, assets_volume_1_icon_muted_cross, assets_volume_2_icon_low_volume, assets_volume_off_icon_high_volume, assets_volume_x_icon_muted_full [EXTRACTED 1.00]
- **E2E Test Fixtures (audio-only profanity test + full video AAC test)** — e2e_ru_profanity, e2e_valid_with_aac [EXTRACTED 1.00]

## Communities (55 total, 15 thin omitted)

### Community 0 - "Export Modal + Context"
Cohesion: 0.08
Nodes (30): MediaPlayerContext, MediaPlayerProvider(), useMediaPlayerContext(), DictionaryManagerInner(), CODEC_LABELS, ExportButton, ExportButtonInner(), ExportFormat (+22 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.05
Nodes (40): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, node-web-audio-api, react (+32 more)

### Community 2 - "Dictionary + Aho-Corasick"
Cohesion: 0.15
Nodes (20): FastAhoScanner, DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord(), updateBleepLabel() (+12 more)

### Community 3 - "Bleep Sounds + Icons"
Cohesion: 0.14
Nodes (21): decodeAudio(), isRemoteUrl(), CloseIcon(), DownloadIcon(), FileIcon(), LinkIcon(), LoadingIcon(), PlayIcon() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (29): actualEndCorrection, Artifact Detection (every 50ms), Audio Engine, Audio Quality Monitoring, Backpressure, Bootstrap and Warmup, Bootstrap (at each startAudio), Bridge Silence (at speed transition) (+21 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 6 - "Backend Config + Server"
Cohesion: 0.40
Nodes (4): __dirname, handleTranscriptionRequest(), Bun TLS Server (port 3000), server

### Community 7 - "Media Player + Audio"
Cohesion: 0.07
Nodes (37): LoginModal(), LoginModalProps, formatSeconds(), PACKAGES, TopupModal(), TopupModalProps, DebugButton(), ErrorEntry (+29 more)

### Community 9 - "Volume Icons"
Cohesion: 0.80
Nodes (5): Volume Zero - Speaker Icon (No Sound Waves), Volume Muted - Speaker with X Overlay, Volume Low - Speaker with Single Arc, Volume High - Speaker with Double Arc, Volume Muted - Speaker with Arcs and Diagonal Slash

### Community 10 - "Audio Utilities"
Cohesion: 0.50
Nodes (4): audioBuffersToWav, WavProgress type, writeString utility, yieldToEventLoop utility

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (25): Actions, API Reference, Audio Utilities (`src/audio.ts`), Auth, authStore (`src/store/authStore.ts`), Bleep Sound I/O (`src/features/bleep-sounds/bleep-sqlite.ts`), Bleep Sound Persistence (`src/store/bleepDb.ts`), Bleep Sounds (+17 more)

### Community 13 - "README"
Cohesion: 0.50
Nodes (4): bun run build, bun x serve ./dist/, Install, obrez-ts

### Community 24 - "Community 24"
Cohesion: 0.40
Nodes (4): Documentation, graphify, Key Facts, Repomix

### Community 26 - "Community 26"
Cohesion: 0.24
Nodes (8): build(), buildVersion(), clients, DIST_DIR, getVersions(), PUBLIC_DIR, server, SRC_DIR

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (3): effects, transcription, version

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (15): ConfirmationModal(), ConfirmationModalProps, formatDuration(), AddWordModal, AddWordModalProps, EffectBadge, EffectModal, EffectModalProps (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): effects, transcription, version

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): BleepData, decodeBleep(), renderCensored()

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (17): Ahead Rendering, Audio, audioProcess Callback, Boundary Computation, Codec Selection, Design, Error Handling, Export Pipeline (+9 more)

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (11): computeSegmentBoundaries(), ensureBleepDecoded(), exportCensoredVideo(), getSoundEffects(), initProgress(), makeInitialPhases(), pickAudioCodec(), pickVideoCodec() (+3 more)

### Community 51 - "Community 51"
Cohesion: 0.13
Nodes (14): Action Pattern, Architecture Overview, Censoring, Component Tree, Core Abstractions (God Nodes), Data Flow, High-Level Design, Key Design Principles (+6 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (11): Auth Flow, JSON Format, Original Mode (`transcribeFormat: 'original'`) — Default, Overview, Packages, Progress Parsing, Results Display, Transcription (+3 more)

### Community 53 - "Community 53"
Cohesion: 0.18
Nodes (10): Build, Build process, Deploy, Dev server details, Development, Getting Started, Install, Prerequisites (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (9): Console Diagnostics, Diagnostic Hooks, Playwright Config, Running Tests, Test Fixtures, Test Suite, Testing Guide, `window.__audioDiagnostic` (+1 more)

## Knowledge Gaps
- **202 isolated node(s):** `DEFAULT_DICTIONARIES`, `LoginModalProps`, `AuthStore`, `Key Facts`, `Documentation` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Export Modal + Context` to `Dictionary + Aho-Corasick`, `Community 35`, `Bleep Sounds + Icons`, `Media Player + Audio`, `Community 50`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `FastAhoScanner` connect `Dictionary + Aho-Corasick` to `Media Player + Audio`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `DEFAULT_DICTIONARIES`, `LoginModalProps`, `AuthStore` to the rest of the system?**
  _202 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Export Modal + Context` be split into smaller, more focused modules?**
  _Cohesion score 0.08282828282828283 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `Bleep Sounds + Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._