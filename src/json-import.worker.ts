/**
 * Web Worker for parsing large JSON transcription files.
 * Runs JSON.parse and data mapping off the main thread so video
 * playback (rAF loop) is not blocked.
 */

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'PARSE') {
    try {
      const { text } = payload;

      if (!text || typeof text !== 'string' || text.length === 0) {
        throw new Error('No file content received');
      }

      self.postMessage({
        type: 'LOG',
        payload: `Parsing JSON file (${(text.length / 1024).toFixed(0)} KB)...`,
      });

      // Parse JSON — may take time for large files
      const data = JSON.parse(text);

      if (!data) {
        throw new Error('JSON parsed to null/undefined');
      }

      if (!data.version) {
        throw new Error(
          `Invalid transcription JSON format: missing 'version' field. Expected { version: N, transcription: [...] }`,
        );
      }

      if (!Array.isArray(data.transcription)) {
        throw new Error(
          `Invalid transcription JSON format: 'transcription' is not an array (got ${typeof data.transcription}). Expected { version: N, transcription: [...] }`,
        );
      }

      if (data.transcription.length === 0) {
        throw new Error(
          'No transcription data: the file contains an empty transcription array. The file was likely exported before any transcription was done.',
        );
      }

      // Map transcription segments
      const results: [number, number, string][] = [];
      for (let i = 0; i < data.transcription.length; i++) {
        const seg = data.transcription[i];
        if (
          typeof seg !== 'object' ||
          seg === null ||
          typeof seg.start !== 'number' ||
          typeof seg.end !== 'number' ||
          typeof seg.text !== 'string'
        ) {
          throw new Error(
            `Invalid transcription segment at index ${i}: expected { start: number, end: number, text: string }, got ${JSON.stringify(seg).slice(0, 100)}`,
          );
        }
        results.push([seg.start, seg.end, seg.text]);
      }

      // Filter sound effects
      const effects = (data.effects ?? []).filter(
        (ef: unknown) =>
          ef && typeof ef === 'object' && (ef as any).effectType === 'sound',
      );

      self.postMessage({
        type: 'LOG',
        payload: `Parsed ${results.length} segments, ${effects.length} effects.`,
      });

      // Post results back — these are plain data, safe to transfer
      self.postMessage({ type: 'PARSED', payload: { results, effects } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[json-import.worker] Error:', msg, err);
      self.postMessage({
        type: 'ERROR',
        payload: msg,
      });
    }
  }
};
