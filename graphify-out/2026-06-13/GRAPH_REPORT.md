# Graph Report - .  (2026-06-12)

## Corpus Check
- 48 files · ~76,275 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 231 nodes · 386 edges · 24 communities (18 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Export Modal + Context|Export Modal + Context]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Dictionary + Aho-Corasick|Dictionary + Aho-Corasick]]
- [[_COMMUNITY_Bleep Sounds + Icons|Bleep Sounds + Icons]]
- [[_COMMUNITY_Transcription Modals|Transcription Modals]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Backend Config + Server|Backend Config + Server]]
- [[_COMMUNITY_Media Player + Audio|Media Player + Audio]]
- [[_COMMUNITY_Video Export Pipeline|Video Export Pipeline]]
- [[_COMMUNITY_Volume Icons|Volume Icons]]
- [[_COMMUNITY_Audio Utilities|Audio Utilities]]
- [[_COMMUNITY_Build Config|Build Config]]
- [[_COMMUNITY_App Entry|App Entry]]
- [[_COMMUNITY_README|README]]
- [[_COMMUNITY_Search + Worker|Search + Worker]]
- [[_COMMUNITY_Brand Identity|Brand Identity]]
- [[_COMMUNITY_Pause Icon|Pause Icon]]
- [[_COMMUNITY_Play Icon|Play Icon]]
- [[_COMMUNITY_Replay Icon|Replay Icon]]
- [[_COMMUNITY_Main Entry|Main Entry]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 19 edges
2. `useMediaPlayerContext()` - 14 edges
3. `compilerOptions` - 13 edges
4. `usePlayerActions()` - 11 edges
5. `FastAhoScanner` - 10 edges
6. `DbRecord` - 8 edges
7. `scripts` - 7 edges
8. `exportCensoredVideo()` - 7 edges
9. `BleepSoundManagerInner()` - 7 edges
10. `openDb()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `DictionaryManager` --shares_data_with--> `DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords)`  [INFERRED]
  src/features/dictionary/DictionaryManager.tsx → /home/irsent/gh/obrez-ts/src/features/dictionary/DictionaryManager.tsx
- `VideoPlayback E2E Tests` --references--> `FileLoader()`  [INFERRED]
  /home/irsent/gh/obrez-ts/e2e/playback.spec.ts → src/features/file-loader/FileLoader.tsx
- `VideoPlayback E2E Tests` --references--> `PlayerDisplay`  [INFERRED]
  /home/irsent/gh/obrez-ts/e2e/playback.spec.ts → src/features/player/PlayerDisplay.tsx
- `VideoPlayback E2E Tests` --references--> `ProgressBar`  [INFERRED]
  /home/irsent/gh/obrez-ts/e2e/playback.spec.ts → src/features/player/ProgressBar.tsx
- `ru-profanity.mp4 (audio-only AAC LC test fixture)` --references--> `DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords)`  [INFERRED]
  /home/irsent/gh/obrez-ts/e2e/ru-profanity.mp4 → /home/irsent/gh/obrez-ts/src/features/dictionary/DictionaryManager.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Bleep sound decode-and-play flow – decode on mount, play on demand** — bleep_sounds_bleepsoundmanager_bleepsoundmanagerinner, bleep_sounds_bleep_audio_decodeaudio, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]
- **Bleep sound add flow – modal → uid → playerActions → IndexedDB + in-memory** — bleep_sounds_bleepsoundmanager_addmodal, utils_uid_uid, store_player_store_playeractions, store_player_store_useplayerstore [INFERRED 0.95]
- **Bleep sound persistence — IndexedDB storage and in-memory hydration** — store_bleepdb_getallbleeprecords, store_bleepdb_putbleeprecord, store_bleepdb_deletebleeprecord, store_bleepdb_updatebleeplabel, store_bleepdb_dbupdateurl, store_bleepdb_upsertbleepdata, store_playerstore_hydratebleepsounds, store_playerstore_recordstosounds, types_index_bleepsound, store_bleepdb_dbrecord [EXTRACTED 1.00]
- **Volume Level Icon Set** — assets_volume_0_icon_speaker_only, assets_volume_1_icon_muted_cross, assets_volume_2_icon_low_volume, assets_volume_off_icon_high_volume, assets_volume_x_icon_muted_full [EXTRACTED 1.00]
- **E2E Test Fixtures (audio-only profanity test + full video AAC test)** — e2e_ru_profanity, e2e_valid_with_aac [EXTRACTED 1.00]

## Communities (24 total, 6 thin omitted)

### Community 0 - "Export Modal + Context"
Cohesion: 0.10
Nodes (27): MediaPlayerContext, MediaPlayerProvider(), useMediaPlayerContext(), DictionaryManagerInner(), VideoPlayback E2E Tests, CODEC_LABELS, ExportButton, ExportButtonInner() (+19 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.06
Nodes (35): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, react, react-dom (+27 more)

### Community 2 - "Dictionary + Aho-Corasick"
Cohesion: 0.15
Nodes (19): DEFAULT_DICTIONARIES, FastAhoScanner, DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord() (+11 more)

### Community 3 - "Bleep Sounds + Icons"
Cohesion: 0.14
Nodes (21): decodeAudio(), isRemoteUrl(), CloseIcon(), DownloadIcon(), FileIcon(), LinkIcon(), LoadingIcon(), PlayIcon() (+13 more)

### Community 4 - "Transcription Modals"
Cohesion: 0.13
Nodes (8): AddWordModal, AddWordModalProps, EffectBadge, EffectModal, EffectModalProps, parseStage(), TranscribeProgressBar(), SoundCensoringEffect

### Community 5 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 6 - "Backend Config + Server"
Cohesion: 0.17
Nodes (11): backendPath, BACKEND_URL, backendWsPath, DictionaryManager, ru-profanity.mp4 (audio-only AAC LC test fixture), valid-with-aac.mp4 (H.264+AAC test fixture), DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords), __dirname (+3 more)

### Community 7 - "Media Player + Audio"
Cohesion: 0.31
Nodes (7): audioBuffersToWav(), WavProgress, writeString(), yieldToEventLoop(), backendPath(), backendWsPath(), playerActions

### Community 8 - "Video Export Pipeline"
Cohesion: 0.62
Nodes (6): ensureBleepDecoded(), exportCensoredVideo(), getSoundEffects(), pickAudioCodec(), pickVideoCodec(), renderCensoredAudio()

### Community 9 - "Volume Icons"
Cohesion: 0.80
Nodes (5): Volume Zero - Speaker Icon (No Sound Waves), Volume Muted - Speaker with X Overlay, Volume Low - Speaker with Single Arc, Volume High - Speaker with Double Arc, Volume Muted - Speaker with Arcs and Diagonal Slash

### Community 10 - "Audio Utilities"
Cohesion: 0.50
Nodes (4): audioBuffersToWav, WavProgress type, writeString utility, yieldToEventLoop utility

### Community 11 - "Build Config"
Cohesion: 0.50
Nodes (4): obrez-ts, PlaywrightConfig, TailwindConfig, TypeScriptConfig

### Community 12 - "App Entry"
Cohesion: 0.50
Nodes (3): index.css, main.tsx, root div

### Community 13 - "README"
Cohesion: 1.00
Nodes (3): bun run build, bun x serve ./dist/, obrez-ts

## Knowledge Gaps
- **77 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+72 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DictionaryManager` connect `Backend Config + Server` to `Export Modal + Context`, `Dictionary + Aho-Corasick`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `usePlayerStore` connect `Export Modal + Context` to `Dictionary + Aho-Corasick`, `Bleep Sounds + Icons`, `Transcription Modals`, `Media Player + Audio`, `Video Export Pipeline`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Export Modal + Context` be split into smaller, more focused modules?**
  _Cohesion score 0.09634146341463415 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Bleep Sounds + Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._
- **Should `Transcription Modals` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._