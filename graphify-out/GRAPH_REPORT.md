# Graph Report - .  (2026-06-10)

## Corpus Check
- 40 files · ~74,839 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 223 nodes · 411 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 93% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.87)
- Token cost: 245,740 input · 245,740 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Main UI Components|Main UI Components]]
- [[_COMMUNITY_Bleep Sound Manager|Bleep Sound Manager]]
- [[_COMMUNITY_Text Scanning Engine|Text Scanning Engine]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_Video Export Pipeline|Video Export Pipeline]]
- [[_COMMUNITY_Audio Processing|Audio Processing]]
- [[_COMMUNITY_State Persistence Layer|State Persistence Layer]]
- [[_COMMUNITY_Transcription UI|Transcription UI]]
- [[_COMMUNITY_App Initialization|App Initialization]]
- [[_COMMUNITY_Audio Utilities|Audio Utilities]]
- [[_COMMUNITY_Volume Icon Set|Volume Icon Set]]
- [[_COMMUNITY_Documentation & Transcripts|Documentation & Transcripts]]
- [[_COMMUNITY_Configuration Files|Configuration Files]]
- [[_COMMUNITY_Transcription Server|Transcription Server]]
- [[_COMMUNITY_HTML Entry Point|HTML Entry Point]]
- [[_COMMUNITY_Brand Identity|Brand Identity]]
- [[_COMMUNITY_Pause Icon|Pause Icon]]
- [[_COMMUNITY_Play Icon|Play Icon]]
- [[_COMMUNITY_Replay Icon|Replay Icon]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 30 edges
2. `playerActions` - 16 edges
3. `useMediaPlayer()` - 15 edges
4. `useMediaPlayerContext()` - 13 edges
5. `compilerOptions` - 13 edges
6. `SoundCensoringEffect` - 12 edges
7. `usePlayerActions()` - 11 edges
8. `FastAhoScanner` - 10 edges
9. `DbRecord` - 9 edges
10. `exportCensoredVideo` - 9 edges

## Surprising Connections (you probably didn't know these)
- `VideoPlayback E2E Tests` --references--> `PlaywrightConfig`  [INFERRED]
  e2e/playback.spec.ts → playwright.config.ts
- `ExportProgressBar()` --semantically_similar_to--> `TranscribeProgressBar()`  [INFERRED] [semantically similar]
  src/features/export/ExportModal.tsx → src/features/transcription/TranscriptionResults.tsx
- `VideoPlayback E2E Tests` --references--> `FileLoader()`  [INFERRED]
  e2e/playback.spec.ts → src/features/file-loader/FileLoader.tsx
- `VideoPlayback E2E Tests` --references--> `PlayerDisplay`  [INFERRED]
  e2e/playback.spec.ts → src/features/player/PlayerDisplay.tsx
- `VideoPlayback E2E Tests` --references--> `ProgressBar`  [INFERRED]
  e2e/playback.spec.ts → src/features/player/ProgressBar.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sound effect engine — playback and export paths for censoring audio** — hooks_usemediaplayer_triggersoundeffect, hooks_usemediaplayer_checksoundingeffects, export_rendercensoredaudio, export_ensurebleepdecoded, export_getsoundeffects [INFERRED 0.85]
- **Bleep sound persistence — IndexedDB storage and in-memory hydration** — store_bleepdb_getallbleeprecords, store_bleepdb_putbleeprecord, store_bleepdb_deletebleeprecord, store_bleepdb_updatebleeplabel, store_bleepdb_dbupdateurl, store_bleepdb_upsertbleepdata, store_playerstore_hydratebleepsounds, store_playerstore_recordstosounds, types_index_bleepsound, store_bleepdb_dbrecord [EXTRACTED 1.00]
- **Transcription pipeline — audio extraction, server forwarding, and result integration** — hooks_usemediaplayer_transcribe, server_handletranscriptionrequest, audio_audiobufferstowav, store_playerstore_playeractions, types_index_transcriptionresulttuple [INFERRED 0.90]
- **Player UI Control Components** — player_playerdisplay_playerdisplay, player_progressbar_progressbar, player_volumecontrols_volumecontrols [INFERRED 0.95]
- **Transcription and Censoring Pipeline** — transcription_transcriptionresults_transcriptionresults, transcription_effectmodal_effectmodal, dictionary_dictionarymanager_dictionarymanager, bleep_sounds_bleepsoundmanager_bleepsoundmanager [INFERRED 0.85]
- **Bleep Sound Lifecycle** — bleep_sounds_bleepsoundmanager_bleepsoundmanager, bleep_sounds_bleepsoundmanager_addmodal, bleep_sounds_bleepsoundmanager_decodeaudio, bleep_sounds_bleepsoundmanager_exportbleepsounds, bleep_sounds_bleepsoundmanager_importbleepsounds [EXTRACTED 1.00]
- **Volume Level Icon Set** — assets_volume_0_icon_speaker_only, assets_volume_1_icon_muted_cross, assets_volume_2_icon_low_volume, assets_volume_off_icon_high_volume, assets_volume_x_icon_muted_full [EXTRACTED 1.00]

## Communities (24 total, 4 thin omitted)

### Community 0 - "Package Metadata"
Cohesion: 0.06
Nodes (35): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, react, react-dom (+27 more)

### Community 1 - "Main UI Components"
Cohesion: 0.19
Nodes (18): BleepSoundManagerInner(), MediaPlayerContext, useMediaPlayerContext(), DEFAULT_DICTIONARIES, DictionaryManager, DictionaryManagerInner(), VideoPlayback E2E Tests, FileLoader() (+10 more)

### Community 2 - "Bleep Sound Manager"
Cohesion: 0.12
Nodes (8): AddModal, AddModalProps, BleepSoundManager, decodeAudio(), exportBleepSounds(), importBleepSounds(), SoundRow, SoundRowProps

### Community 3 - "Text Scanning Engine"
Cohesion: 0.19
Nodes (10): FastAhoScanner class, Worker message handler, FastAhoScanner, BasicCensoringEffect, BleepSound, CensoringEffect, Dictionary, PlayerState (+2 more)

### Community 4 - "TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 5 - "Video Export Pipeline"
Cohesion: 0.23
Nodes (11): ExportButton, ExportButtonInner(), ExportModal, ExportModalProps, ExportProgressBar(), ensureBleepDecoded(), exportCensoredVideo(), getSoundEffects() (+3 more)

### Community 6 - "Audio Processing"
Cohesion: 0.21
Nodes (14): audioBuffersToWav, WavProgress type, writeString utility, yieldToEventLoop utility, ensureBleepDecoded, exportCensoredVideo, getSoundEffects, pickAudioCodec (+6 more)

### Community 7 - "State Persistence Layer"
Cohesion: 0.44
Nodes (12): DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord(), updateBleepLabel(), upsertBleepData() (+4 more)

### Community 8 - "Transcription UI"
Cohesion: 0.22
Nodes (7): EffectBadge, EffectModal, EffectModalProps, findClosestSegment(), parseStage(), TranscribeProgressBar(), TranscriptionResults

### Community 9 - "App Initialization"
Cohesion: 0.35
Nodes (11): App component, MediaPlayerProvider(), cleanup function, initMediaPlayer, pause function, play function, runAudioIterator, seekToTime (+3 more)

### Community 10 - "Audio Utilities"
Cohesion: 0.53
Nodes (4): audioBuffersToWav(), WavProgress, writeString(), yieldToEventLoop()

### Community 11 - "Volume Icon Set"
Cohesion: 0.80
Nodes (5): Volume Zero - Speaker Icon (No Sound Waves), Volume Muted - Speaker with X Overlay, Volume Low - Speaker with Single Arc, Volume High - Speaker with Double Arc, Volume Muted - Speaker with Arcs and Diagonal Slash

### Community 12 - "Documentation & Transcripts"
Cohesion: 0.60
Nodes (5): bun run build, bun x serve ./dist/, obrez-ts, Censored Russian profanity transcript, Raw Russian profanity transcript (AAC)

### Community 13 - "Configuration Files"
Cohesion: 0.50
Nodes (4): obrez-ts, PlaywrightConfig, TailwindConfig, TypeScriptConfig

### Community 14 - "Transcription Server"
Cohesion: 0.67
Nodes (3): __dirname, handleTranscriptionRequest(), server

### Community 15 - "HTML Entry Point"
Cohesion: 0.50
Nodes (3): index.css, main.tsx, root div

## Ambiguous Edges - Review These
- `playerActions` → `uid()`  [AMBIGUOUS]
  src/store/playerStore.ts · relation: references

## Knowledge Gaps
- **67 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `playerActions` and `uid()`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `usePlayerStore` connect `Main UI Components` to `Bleep Sound Manager`, `Text Scanning Engine`, `Video Export Pipeline`, `Audio Processing`, `State Persistence Layer`, `Transcription UI`, `App Initialization`, `Audio Utilities`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `useMediaPlayer()` connect `App Initialization` to `Main UI Components`, `Audio Utilities`, `Audio Processing`, `State Persistence Layer`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `playerActions` connect `State Persistence Layer` to `Main UI Components`, `Text Scanning Engine`, `Video Export Pipeline`, `Audio Processing`, `App Initialization`, `Audio Utilities`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Bleep Sound Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.12380952380952381 - nodes in this community are weakly interconnected._