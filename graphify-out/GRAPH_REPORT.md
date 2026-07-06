# Graph Report - obrez-ts  (2026-07-06)

## Corpus Check
- 62 files · ~106,313 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 353 nodes · 537 edges · 48 communities (33 shown, 15 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01b2ea0c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Export Modal + Context|Export Modal + Context]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dictionary + Aho-Corasick|Dictionary + Aho-Corasick]]
- [[_COMMUNITY_Bleep Sounds + Icons|Bleep Sounds + Icons]]
- [[_COMMUNITY_Transcription Modals|Transcription Modals]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Backend Config + Server|Backend Config + Server]]
- [[_COMMUNITY_Media Player + Audio|Media Player + Audio]]
- [[_COMMUNITY_Volume Icons|Volume Icons]]
- [[_COMMUNITY_Audio Utilities|Audio Utilities]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_App Entry|App Entry]]
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
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 22 edges
2. `useMediaPlayerContext()` - 14 edges
3. `compilerOptions` - 13 edges
4. `usePlayerActions()` - 11 edges
5. `FastAhoScanner` - 10 edges
6. `WritableBuffer` - 10 edges
7. `exportCensoredVideo()` - 9 edges
8. `useAuthStore` - 9 edges
9. `scripts` - 8 edges
10. `DbRecord` - 8 edges

## Surprising Connections (you probably didn't know these)
- `ProgressBarInner()` --calls--> `formatSeconds()`  [INFERRED]
  src/features/player/ProgressBar.tsx → src/features/auth/TopupModal.tsx
- `ExportProgressBar()` --calls--> `usePlayerStore`  [EXTRACTED]
  src/features/export/ExportModal.tsx → src/store/playerStore.ts
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

## Communities (48 total, 15 thin omitted)

### Community 0 - "Export Modal + Context"
Cohesion: 0.11
Nodes (28): MediaPlayerContext, MediaPlayerProvider(), useMediaPlayerContext(), DEFAULT_DICTIONARIES, DictionaryManager, DictionaryManagerInner(), ExportButtonInner(), FileLoader() (+20 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.05
Nodes (40): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, node-web-audio-api, react (+32 more)

### Community 2 - "Dictionary + Aho-Corasick"
Cohesion: 0.14
Nodes (21): FastAhoScanner, DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord(), updateBleepLabel() (+13 more)

### Community 3 - "Bleep Sounds + Icons"
Cohesion: 0.14
Nodes (21): decodeAudio(), isRemoteUrl(), CloseIcon(), DownloadIcon(), FileIcon(), LinkIcon(), LoadingIcon(), PlayIcon() (+13 more)

### Community 4 - "Transcription Modals"
Cohesion: 0.07
Nodes (26): ConfirmationModal(), ConfirmationModalProps, formatDuration(), LoginModal(), LoginModalProps, formatSeconds(), PACKAGES, TopupModal() (+18 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 6 - "Backend Config + Server"
Cohesion: 0.40
Nodes (4): __dirname, handleTranscriptionRequest(), Bun TLS Server (port 3000), server

### Community 7 - "Media Player + Audio"
Cohesion: 0.60
Nodes (4): audioBuffersToWav(), WavProgress, writeString(), yieldToEventLoop()

### Community 9 - "Volume Icons"
Cohesion: 0.80
Nodes (5): Volume Zero - Speaker Icon (No Sound Waves), Volume Muted - Speaker with X Overlay, Volume Low - Speaker with Single Arc, Volume High - Speaker with Double Arc, Volume Muted - Speaker with Arcs and Diagonal Slash

### Community 10 - "Audio Utilities"
Cohesion: 0.50
Nodes (4): audioBuffersToWav, WavProgress type, writeString utility, yieldToEventLoop utility

### Community 12 - "App Entry"
Cohesion: 0.50
Nodes (3): index.css, main.tsx, root div

### Community 13 - "README"
Cohesion: 0.50
Nodes (4): bun run build, bun x serve ./dist/, Install, obrez-ts

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (5): clients, DIST_DIR, PUBLIC_DIR, server, SRC_DIR

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (9): Fix 1: Add render-quantum margin to `actualEndCorrection` (main fix), Fix 2: Wait for all `onended` before releasing the lock, Fix 3: Increase `stopAudio` node-stop wait from 10ms to 20ms, Fix 4: Defensive — check for truly-silent before starting new buffers, Fixes, Plan: Fix audio buffer overlap (multiple segments playing simultaneously), Root Cause, Summary of changes (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (3): effects, transcription, version

### Community 35 - "Community 35"
Cohesion: 0.80
Nodes (4): parseStack(), renderErrors(), showErrorItem(), updateBadge()

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): effects, transcription, version

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): BleepData, decodeBleep(), renderCensored()

### Community 50 - "Community 50"
Cohesion: 0.08
Nodes (18): CODEC_LABELS, ExportButton, ExportFormat, ExportModal, ExportModalProps, ExportProgressBar(), computeSegmentBoundaries(), ensureBleepDecoded() (+10 more)

## Knowledge Gaps
- **116 isolated node(s):** `AddModalProps`, `SoundRowProps`, `DEFAULT_DICTIONARIES`, `SegmentItem`, `rowRendererDeps` (+111 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Export Modal + Context` to `Dictionary + Aho-Corasick`, `Community 50`, `Bleep Sounds + Icons`, `Transcription Modals`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `FastAhoScanner` connect `Dictionary + Aho-Corasick` to `Export Modal + Context`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `AddModalProps`, `SoundRowProps`, `DEFAULT_DICTIONARIES` to the rest of the system?**
  _116 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Export Modal + Context` be split into smaller, more focused modules?**
  _Cohesion score 0.10975609756097561 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `Dictionary + Aho-Corasick` be split into smaller, more focused modules?**
  _Cohesion score 0.14482758620689656 - nodes in this community are weakly interconnected._
- **Should `Bleep Sounds + Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._