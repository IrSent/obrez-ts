/**
 * Web Worker for exporting transcription + effects as JSON.
 * Runs JSON.stringify off the main thread so large datasets
 * don't block video playback (rAF loop).
 */

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'EXPORT_JSON') {
    try {
      const { transcription, effects } = payload;

      const data = JSON.stringify(
        {
          version: 1,
          transcription,
          effects,
        },
        null,
        2,
      );

      self.postMessage({ type: 'JSON_READY', payload: data });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        payload: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
