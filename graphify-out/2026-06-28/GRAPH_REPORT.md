# Graph Report - obrez-ts  (2026-06-26)

## Corpus Check
- 56 files · ~261,160 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 475 nodes · 845 edges · 56 communities (46 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `544274ec`
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
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 21 edges
2. `process()` - 14 edges
3. `useMediaPlayerContext()` - 14 edges
4. `compilerOptions` - 13 edges
5. `process()` - 12 edges
6. `usePlayerActions()` - 11 edges
7. `FastAhoScanner` - 10 edges
8. `putSamples()` - 9 edges
9. `extract()` - 9 edges
10. `receive()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `ru-profanity.mp4 (audio-only AAC LC test fixture)` --references--> `DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords)`  [INFERRED]
  e2e/ru-profanity.mp4 → src/features/dictionary/DictionaryManager.tsx
- `Bun TLS Server (port 3000)` --shares_data_with--> `BACKEND_URL`  [INFERRED]
  server.ts → src/config.ts
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

## Communities (56 total, 10 thin omitted)

### Community 0 - "Export Modal + Context"
Cohesion: 0.07
Nodes (36): MediaPlayerContext, MediaPlayerProvider(), useMediaPlayerContext(), DEFAULT_DICTIONARIES, DictionaryManagerInner(), CODEC_LABELS, ExportButton, ExportButtonInner() (+28 more)

### Community 1 - "Package Dependencies"
Cohesion: 0.05
Nodes (37): author, bugs, url, dependencies, @fontsource-variable/rubik, mediabunny, react, react-dom (+29 more)

### Community 2 - "Dictionary + Aho-Corasick"
Cohesion: 0.08
Nodes (26): FastAhoScanner, DbRecord, dbUpdateUrl(), deleteBleepRecord(), getAllBleepRecords(), openDb(), putBleepRecord(), updateBleepLabel() (+18 more)

### Community 3 - "Bleep Sounds + Icons"
Cohesion: 0.14
Nodes (21): decodeAudio(), isRemoteUrl(), CloseIcon(), DownloadIcon(), FileIcon(), LinkIcon(), LoadingIcon(), PlayIcon() (+13 more)

### Community 4 - "Transcription Modals"
Cohesion: 0.07
Nodes (10): calculateEffectiveRateAndTempo(), getKernelStateRecord(), getOutputBufferAdapter(), isFloatDifferent(), lanczosWeight(), normalizedSinc(), pitch(), pitchOctaves() (+2 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, outDir (+8 more)

### Community 6 - "Backend Config + Server"
Cohesion: 0.17
Nodes (11): backendPath, BACKEND_URL, backendWsPath, DictionaryManager, ru-profanity.mp4 (audio-only AAC LC test fixture), valid-with-aac.mp4 (H.264+AAC test fixture), DEFAULT_DICTIONARIES (ru-profanity, ru-stopwords), __dirname (+3 more)

### Community 7 - "Media Player + Audio"
Cohesion: 0.50
Nodes (3): effects, transcription, version

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

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (21): beforePipeProcess(), bootstrapMidBuffer(), dropFrames(), ensureAdditionalCapacity(), ensureCapacity(), ensureScratchCapacity(), extract(), extractSamples() (+13 more)

### Community 29 - "Community 29"
Cohesion: 0.27
Nodes (10): constructor(), normalizeParams(), readStrategyId(), readStrategySelection(), requireRegisteredStrategy(), resolveInterpolationStrategy(), resolveInterpolationStrategyRuntime(), resolveKernelRegistration() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (11): advanceInputByNominalSkip(), appendSamples(), captureOverlapHistory(), frameCount(), getBoundBuffer(), overlapStereo(), processOneWindow(), putFrom() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.20
Nodes (15): applyPendingRuntimeUpdates(), calculateOverlapLength(), calculateSequenceParameters(), checkLimits(), clear(), clearMidBuffer(), clone(), normalizeWindowInvariants() (+7 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (13): calculateEffectiveRateAndTempo(), constructor(), createPhaseVocoderFactory(), getKernelStateRecord(), getOutputBufferAdapter(), isFloatDifferent(), lanczosWeight(), makeHannWindow() (+5 more)

### Community 34 - "Community 34"
Cohesion: 0.36
Nodes (8): calculateCrossCorrelationStereo(), generateFractionalScanOffsets(), generateSymmetricScanOffsets(), getQuickScanOffsets(), preCalculateCorrelationReferenceStereo(), seekBestOverlapPosition(), seekBestOverlapPositionStereo(), seekBestOverlapPositionStereoQuick()

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (21): beforePipeProcess(), bootstrapMidBuffer(), dropFrames(), ensureAdditionalCapacity(), ensureCapacity(), ensureScratchCapacity(), extract(), extractSamples() (+13 more)

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): BleepData, decodeBleep(), renderCensored()

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (11): advanceInputByNominalSkip(), appendSamples(), captureOverlapHistory(), frameCount(), getBoundBuffer(), overlapStereo(), processOneWindow(), putFrom() (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.52
Nodes (6): ensureBleepDecoded(), exportCensoredVideo(), getSoundEffects(), pickAudioCodec(), pickVideoCodec(), renderCensoredAudioWorker()

### Community 51 - "Community 51"
Cohesion: 0.31
Nodes (10): calculateOverlapLength(), calculateSequenceParameters(), checkLimits(), clone(), normalizeWindowInvariants(), overlapMs(), setParameters(), setStretchParameters() (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.36
Nodes (8): calculateCrossCorrelationStereo(), generateFractionalScanOffsets(), generateSymmetricScanOffsets(), getQuickScanOffsets(), preCalculateCorrelationReferenceStereo(), seekBestOverlapPosition(), seekBestOverlapPositionStereo(), seekBestOverlapPositionStereoQuick()

### Community 53 - "Community 53"
Cohesion: 0.32
Nodes (8): normalizeParams(), readStrategyId(), readStrategySelection(), requireRegisteredStrategy(), resolveInterpolationStrategy(), resolveInterpolationStrategyRuntime(), resolveKernelRegistration(), resolveStrategy()

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (6): applyPendingRuntimeUpdates(), clear(), clearMidBuffer(), reset(), setInterpolationStrategy(), setInterpolationStrategyParams()

### Community 55 - "Community 55"
Cohesion: 1.00
Nodes (3): fft(), ifft(), _processChannel()

## Knowledge Gaps
- **91 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+86 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `usePlayerStore` connect `Export Modal + Context` to `Dictionary + Aho-Corasick`, `Community 50`, `Bleep Sounds + Icons`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `DictionaryManager` connect `Backend Config + Server` to `Export Modal + Context`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _91 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Export Modal + Context` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `Dictionary + Aho-Corasick` be split into smaller, more focused modules?**
  _Cohesion score 0.08233117483811286 - nodes in this community are weakly interconnected._
- **Should `Bleep Sounds + Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._