function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export type WavProgress = (stage: string, done: number, total: number) => void;

export async function audioBuffersToWav(
  chunks: AudioBuffer[],
  sampleRate: number,
  onProgress?: WavProgress,
): Promise<Blob> {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const numberOfChannels = chunks[0]?.numberOfChannels;
  console.log('numberOfChannels:', numberOfChannels);
  if (!numberOfChannels) {
    console.error("could not get numberOfChannels from the first chunk");
  }

  // --- Phase 1: interleave channels (yield every 5 chunks) ---
  const result = new Float32Array(totalLength * numberOfChannels);
  let offset = 0;
  let accumulated = 0;
  const YIELD_EVERY = 10;

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const len = chunk.length;
    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < numberOfChannels; ch++) {
        result[offset++] = chunk.getChannelData(ch)[i];
      }
    }
    accumulated += len;

    if (onProgress) onProgress('Interleaving channels', accumulated, totalLength);

    if ((ci + 1) % YIELD_EVERY === 0) {
      await yieldToEventLoop();
    }
  }

  // --- Phase 2: Float32 → Int16 (batched) ---
  const buffer = new ArrayBuffer(44 + result.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + result.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, result.length * 2, true);

  const BATCH = 200000;
  const totalBatches = Math.ceil(result.length / BATCH);
  let index = 44;

  for (let start = 0; start < result.length; start += BATCH) {
    const end = Math.min(start + BATCH, result.length);
    for (let i = start; i < end; i++) {
      const s = result[i];
      view.setInt16(index, s < 0 ? s * 0x8000 : Math.min(s, 1) * 0x7fff, true);
      index += 2;
    }
    if (onProgress) onProgress('Converting to PCM', end, result.length);
    if (end < result.length) await yieldToEventLoop();
  }

  return new Blob([buffer], { type: "audio/wav" });
}
