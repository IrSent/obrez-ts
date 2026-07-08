# Export Pipeline

## Overview

The export pipeline produces a censored video file from the original media, applying sound effects (bleep), dampening, and re-encoding. It runs entirely in the browser using MediaBunny's WebCodecs-based `Conversion` API.

## Pipeline Architecture

Three tasks run in parallel, connected by a shared `WritableBuffer`:

```
┌─────────────┐     WritableBuffer     ┌──────────────┐
│  collectTask │ ──writes frames──→     │ renderEncodeTask │
│             │                         │ (wait→read→render)│
└─────────────┘                         └──────────────┘
                                            │
┌─────────────┐                            encoding
│  prepTask   │ ──bleep+codec──→ (feeds into renderEncodeTask)
└─────────────┘
```

### Task Descriptions

1. **collectTask**: Consumes `AudioBufferSink.buffers(0)`, writes raw frames to `WritableBuffer`, computes RMS for auto-volume bleeps
2. **prepTask**: Decodes bleep sounds via `OfflineAudioContext`, selects video/audio codecs
3. **renderEncodeTask**: Waits for prep, then reads segments from `WritableBuffer`, renders censored audio via `OfflineAudioContext`, feeds into MediaBunny `Conversion`

## Phases

The UI shows five export phases with progress:

| Key | Label | What it does |
|---|---|---|
| `collect` | Collecting audio | Raw frame collection + RMS |
| `bleep` | Preparing bleeps | Decode bleep sounds |
| `render` | Rendering censored | Per-segment OfflineAudioContext |
| `codec` | Choosing codecs | Video + audio codec selection |
| `encode` | Encoding video | MediaBunny Conversion |

## WritableBuffer

A growable per-channel `Float32Array` buffer with frame-ready signaling:

```typescript
class WritableBuffer {
  // Write side (collectTask)
  write(chunk, chunkFrames, chunkCount, estimatedTotalChunks)
  
  // Read side (renderEncodeTask)
  wait(frames): Promise<void>  // resolves when enough frames collected
  
  // Lifecycle
  markDone()         // signals end of collection
  finalize()         // trim to actual size, return Float32Array[]
}
```

### Design

- **Over-allocation**: estimated total frames × 1.1 margin to minimize growth events
- **Growth**: if `ensure()` needs to grow, doubles the array size
- **Wait queue**: multiple concurrent waiters, each resolved independently when their threshold is met
- **Progress**: updates `collect` phase at ≥2% intervals

## Segment Rendering

### Boundary Computation

Segments are defined by effect boundaries. `computeSegmentBoundaries()` collects all unique start/end times from effects and splits the timeline into segments where each effect falls entirely within one segment.

Segments > 60s are further split into 60s chunks.

### Per-Segment Rendering

Each segment is rendered in its own `OfflineAudioContext`:

```typescript
async function renderSegment(
  segChannelData: Float32Array[],  // audio for this segment only
  sampleRate: number,
  getRms: (segStart: number) => number,
  globalTranscriptionResults: [number, number, string][],
  segmentEffects: SoundCensoringEffect[],
  segStartFrames: number,
): Promise<AudioBuffer>
```

Inside:
1. Create `OfflineAudioContext` with segment dimensions
2. Build segment buffer from channel data
3. Apply dampening via `GainNode` (sharp or parabolic)
4. Schedule bleep sounds at local times (offset by segment start)
5. Return rendered `AudioBuffer`

### Ahead Rendering

The pipeline renders one segment ahead to hide OfflineAudioContext latency:

```typescript
const startAheadRender = (index: number) => {
  aheadPromise = (async () => {
    const seg = await renderSegmentData(index);
    aheadData = seg.data;
    aheadFrames = seg.frames;
  })();
};
```

When the current segment is exhausted, the ahead data is ready (or nearly ready).

### audioProcess Callback

MediaBunny's `Conversion` calls `audioProcess(sample)` for each audio frame request:

1. Close the input sample immediately (we've read what we need)
2. Fill the output with rendered segment data
3. When current segment is exhausted → switch to ahead data
4. On error → fill silence (pipeline doesn't crash)

## Codec Selection

### Video

1. Try the original codec first
2. Fall back to format defaults: `avc`/`hevc` for MP4, `vp9`/`vp8` for WebM
3. Last resort: try all codecs and pick the first available

### Audio

1. Try the original codec first
2. MP4: prefer `aac`, then `mp3`
3. WebM: prefer `opus`, then `vorbis`

## Progress Reporting

Progress is reported at multiple levels:

- **Collect phase**: every ≥2% change → `chunkCount/estimatedTotalChunks`
- **Render phase**: per segment → `segment N/M · Xs / Ys · elapsed · ETA`
- **Encode phase**: MediaBunny `conversion.onProgress` → percentage + segment index

Elapsed time is tracked from `performance.now()` at export start.

## Error Handling

- **Bleep decode failure**: throws with `Bleep sound "X" could not be decoded`
- **audioProcess error**: fills silence, logs error, continues — doesn't crash the pipeline
- **ahead render failure**: treated as no data, main loop fills silence
- **No output buffer**: throws `Export completed but no output buffer was produced`
- **collectTask failure**: awaited after renderEncodeTask to ensure cleanup
