# Transcription

## Overview

Transcription sends the video's audio to the GigaAM backend for speech-to-text processing. Results are returned as timed word segments: `[start, end, text][]`.

## Two Modes

### WAV Mode (`transcribeFormat: 'wav'`)

Decodes all audio to PCM and encodes as WAV:

1. Collect `AudioBuffer` chunks from `AudioBufferSink.buffers(0)`
2. Interleave channels → `Float32Array`
3. Convert to `Int16` PCM
4. Write RIFF/WAVE header
5. Send as `audio/wav` blob

**Pros**: universal backend compatibility. **Cons**: large file size (uncompressed).

### Original Mode (`transcribeFormat: 'original'`) — Default

Streams raw compressed audio packets directly to an MP4 muxer — no decode, no re-encode:

1. Create a separate `Input` + `EncodedPacketSink` from the audio track
2. Mux packets into an MP4 container on-the-fly
3. Handle negative timestamps via `tsShift`
4. Send as `video/mp4` blob

**Pros**: much smaller, faster. **Cons**: requires backend to support the codec.

## Auth Flow

Before transcription, the user must be authenticated:

```
Transcribe button → checkAuth() →
  ├─ logged in → ConfirmationModal (show balance, duration estimate) → confirm → transcribe
  ├─ not logged in → LoginModal (Telegram widget) → checkAuth() → TopupModal → ConfirmationModal
  └─ error → retry with checkAuth()
```

### Packages

| Type | Hours | Price |
|---|---|---|
| Free | 5h | free (once per 30 days) |
| Basic | +10h | $0.99 |
| Pro | +100h | $4.99 |

New users start with `remaining_seconds = 0`. Free topup adds 5h (18000s).

## WebSocket Protocol

After POST `/transcribe`, the response includes `{ task_id }`. The client then connects to:

```
wss://{backend-host}/ws/status/{task_id}
```

Messages:

| Status | Payload |
|---|---|
| `PROCESSING` | `{ progress, segments, time, phase }` — or raw string `"Server is transcribing…"` |
| `DONE` | `[[start_ms, end_ms, text], ...]` — timestamps in **milliseconds**, converted to seconds client-side |
| `ERROR` | error message string |

### Progress Parsing

The `TranscribeProgress` component parses stage strings:

```
"Encoding — 1,234 / 5,678 (42%)"        → label + pct
"Transcribing — 45% · 3/8 · 120s"      → label + pct
"Remuxing audio — 12,345 packets"      → label, no pct
"Sending to server…"                    → label, no pct
```

## Results Display

Transcription results are shown as a `react-window` virtualized list (one row per word segment). Features:

- **Highlight on playback**: `startTranscribeFocus()` highlights the row matching the current time
- **Auto-scroll**: follows playback position (toggleable)
- **Add effects**: click the ⚡ badge on a row to open `EffectModal`
- **Manual entry**: `AddWordModal` for adding segments not detected by transcription
- **Export/Import JSON**: save and load transcription + effects to/from files

## JSON Format

```json
{
  "version": 1,
  "transcription": [
    { "start": 0.5, "end": 1.2, "text": "Hello" },
    { "start": 1.3, "end": 2.0, "text": "world" }
  ],
  "effects": [
    {
      "id": "eff-1",
      "segmentStart": 0.5,
      "soundId": "bleep-1",
      "volume": 1,
      "volumeMode": "manual",
      "playbackRate": 1,
      "dampenOriginal": true,
      "dampenAmount": 1,
      "dampenType": "sharp",
      "effectType": "sound"
    }
  ]
}
```
