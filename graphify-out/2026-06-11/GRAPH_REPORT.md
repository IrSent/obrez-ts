# Graph Report - obrez-ts  (2026-06-11)

## Corpus Check
- 34 files · ~75,091 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 238 nodes · 416 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1f370b20`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Bleep Sound System|Bleep Sound System]]
- [[_COMMUNITY_Bleep Sound System|Bleep Sound System]]
- [[_COMMUNITY_Audio Export Pipeline|Audio Export Pipeline]]
- [[_COMMUNITY_Backend Integration|Backend Integration]]
- [[_COMMUNITY_Backend Integration|Backend Integration]]
- [[_COMMUNITY_Backend Integration|Backend Integration]]
- [[_COMMUNITY_Audio Export Pipeline|Audio Export Pipeline]]
- [[_COMMUNITY_Backend Integration|Backend Integration]]
- [[_COMMUNITY_Volume Icons|Volume Icons]]
- [[_COMMUNITY_Media Hooks|Media Hooks]]
- [[_COMMUNITY_HTML Entry|HTML Entry]]
- [[_COMMUNITY_Transcription Effects|Transcription Effects]]
- [[_COMMUNITY_README|README]]
- [[_COMMUNITY_Brand Identity|Brand Identity]]
- [[_COMMUNITY_Pause Icon|Pause Icon]]
- [[_COMMUNITY_Play Icon|Play Icon]]
- [[_COMMUNITY_Play Icon|Play Icon]]
- [[_COMMUNITY_Community 22|Community 22]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 23 edges
2. `useMediaPlayerContext()` - 13 edges
3. `compilerOptions` - 13 edges
4. `usePlayerActions()` - 10 edges
5. `FastAhoScanner` - 10 edges
6. `SoundCensoringEffect` - 9 edges
7. `exportCensoredVideo` - 9 edges
8. `BleepSoundManagerInner()` - 8 edges
9. `DbRecord` - 8 edges
10. `scripts` - 7 edges

## Surprising Connections (you probably didn't know these)
- `ru-profanity.mp4 (audio-only AAC LC test fixture)` --references--> `DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords)`  [INFERRED]
  e2e/ru-profanity.mp4 → src/features/dictionary/DictionaryManager.tsx
- `renderCensoredAudio` --semantically_similar_to--> `triggerSoundEffect (bleep + dampening)`  [INFERRED] [semantically similar]
  src/export.ts → src/hooks/useMediaPlayer.ts
- `ExportProgressBar()` --semantically_similar_to--> `TranscribeProgressBar()`  [INFERRED] [semantically similar]
  src/features/export/ExportModal.tsx → src/features/transcription/TranscriptionResults.tsx
- `VideoPlayback E2E Tests` --references--> `FileLoader()`  [INFERRED]
  e2e/playback.spec.ts → src/features/file-loader/FileLoader.tsx
- `VideoPlayback E2E Tests` --references--> `PlayerDisplay`  [INFERRED]
  e2e/playback.spec.ts → src/features/player/PlayerDisplay.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sound effect engine — playback and export paths for censoring audio** — hooks_usemediaplayer_triggersoundeffect, hooks_usemediaplayer_checksoundingeffects, export_rendercensoredaudio, export_ensurebleepdecoded, export_getsoundeffects [INFERRED 0.85]
- **Player UI Control Components** — player_playerdisplay_playerdisplay, player_progressbar_progressbar, player_volumecontrols_volumecontrols [INFERRED 0.95]
- **Transcription Flow (collect, remux, send, WebSocket status, display results)** — hooks_usemediaplayer_transcribe, config_backendpath, config_backendwspath, features_transcription_transcriptionresults, features_transcription_transcribeprogress [EXTRACTED 1.00]
- **Sound Censoring Pipeline (rAF checks effects, triggers bleep/dampening, UI adds/removes effects)** — hooks_usemediaplayer_renderloop, hooks_usemediaplayer_checksoundeffects, hooks_usemediaplayer_triggersoundeffect, features_transcription_transcriptionresults [EXTRACTED 1.00]
- **Bleep sound persistence — IndexedDB storage and in-memory hydration** — store_bleepdb_getallbleeprecords, store_bleepdb_putbleeprecord, store_bleepdb_deletebleeprecord, store_bleepdb_updatebleeplabel, store_bleepdb_dbupdateurl, store_bleepdb_upsertbleepdata, store_playerstore_hydratebleepsounds, store_playerstore_recordstosounds, types_index_bleepsound, store_bleepdb_dbrecord [EXTRACTED 1.00]
- **Volume Level Icon Set** — assets_volume_0_icon_speaker_only, assets_volume_1_icon_muted_cross, assets_volume_2_icon_low_volume, assets_volume_off_icon_high_volume, assets_volume_x_icon_muted_full [EXTRACTED 1.00]
- **E2E Test Fixtures (audio-only profanity test + full video AAC test)** — e2e_ru_profanity, e2e_valid_with_aac [EXTRACTED 1.00]
- **Bleep sound persistence flow – IndexedDB ↔ in-memory store ↔ SQLite export/import** — store_player_store_useplayerstore, store_player_store_hydratebleepsounds, store_player_store_recordstosounds, store_player_store_playeractions, bleep_sounds_bleep_sqlite_exportbleepsounds, bleep_sounds_bleep_sqlite_importbleepsounds [EXTRACTED 1.00]
- **Bleep sound decode-and-play flow – decode on mount, play on demand** — bleep_sounds_bleepsoundmanager_bleepsoundmanagerinner, bleep_sounds_bleep_audio_decodeaudio, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]
- **Bleep sound add flow – modal → uid → playerActions → IndexedDB + in-memory** — bleep_sounds_bleepsoundmanager_addmodal, utils_uid_uid, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]

## Communities (23 total, 4 thin omitted)

### Community 0 - "Package Metadata"
Cohesion: 0.06
Nodes (35): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, react, react-dom (+27 more)

### Community 1 - "Bleep Sound System"
Cohesion: 0.14
Nodes (23): BleepSound – shared type for a bleep sound with id, label, url, dataUrl, and audioBuffer fields, decodeAudio(), isRemoteUrl(), CloseIcon(), DownloadIcon(), FileIcon(), LinkIcon(), LoadingIcon() (+15 more)

### Community 2 - "Bleep Sound System"
Cohesion: 0.20
Nodes (9): FastAhoScanner class, Worker message handler, FastAhoScanner, BasicCensoringEffect, CensoringEffect, Dictionary, PlayerState, TranscriptionResultTuple (+1 more)

### Community 3 - "Audio Export Pipeline"
Cohesion: 0.12
Nodes (19): audioBuffersToWav, WavProgress type, writeString utility, yieldToEventLoop utility, ensureBleepDecoded, exportCensoredVideo, getSoundEffects, pickAudioCodec (+11 more)

### Community 4 - "Backend Integration"
Cohesion: 0.15
Nodes (20): App component, MediaPlayerContext, MediaPlayerProvider(), useMediaPlayerContext(), VideoPlayback E2E Tests, FileLoader(), useMediaPlayer(), React root entry (+12 more)

### Community 5 - "Backend Integration"
Cohesion: 0.13
Nodes (16): backendPath, BACKEND_URL, backendWsPath, DictionaryManager, ru-profanity.mp4 (audio-only AAC LC test fixture), valid-with-aac.mp4 (H.264+AAC test fixture), DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords), findClosestSegment (binary search) (+8 more)

### Community 6 - "Backend Integration"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 7 - "Audio Export Pipeline"
Cohesion: 0.23
Nodes (11): ExportButton, ExportButtonInner(), ExportModal, ExportModalProps, ExportProgressBar(), ensureBleepDecoded(), exportCensoredVideo(), getSoundEffects() (+3 more)

### Community 8 - "Backend Integration"
Cohesion: 0.24
Nodes (9): DEFAULT_DICTIONARIES, DictionaryManagerInner(), audioBuffersToWav(), WavProgress, writeString(), yieldToEventLoop(), backendPath(), backendWsPath() (+1 more)

### Community 9 - "Volume Icons"
Cohesion: 0.80
Nodes (5): Volume Zero - Speaker Icon (No Sound Waves), Volume Muted - Speaker with X Overlay, Volume Low - Speaker with Single Arc, Volume High - Speaker with Double Arc, Volume Muted - Speaker with Arcs and Diagonal Slash

### Community 10 - "Media Hooks"
Cohesion: 0.40
Nodes (5): FileLoader, checkSoundEffects, initMediaPlayer, rAF renderLoop (always-on), triggerSoundEffect (bleep + dampening)

### Community 11 - "HTML Entry"
Cohesion: 0.50
Nodes (3): index.css, main.tsx, root div

### Community 12 - "Transcription Effects"
Cohesion: 0.67
Nodes (3): parseStage, TranscribeProgress, TranscribeProgressBar

### Community 13 - "README"
Cohesion: 1.00
Nodes (3): bun run build, bun x serve ./dist/, obrez-ts

### Community 22 - "Community 22"
Cohesion: 0.47
Nodes (10): DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord(), updateBleepLabel(), upsertBleepData() (+2 more)

## Knowledge Gaps
- **76 isolated node(s):** `AddModalProps`, `SoundRowProps`, `name`, `version`, `private` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Audio Export Pipeline` to `Bleep Sound System`, `Backend Integration`, `Audio Export Pipeline`, `Backend Integration`, `Community 22`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `renderCensoredAudio` connect `Audio Export Pipeline` to `Media Hooks`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `DictionaryManager` connect `Backend Integration` to `Backend Integration`, `Backend Integration`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `AddModalProps`, `SoundRowProps`, `name` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Bleep Sound System` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `Audio Export Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.1168091168091168 - nodes in this community are weakly interconnected._