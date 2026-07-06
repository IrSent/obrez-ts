// src/json-export.worker.ts
self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === "EXPORT_JSON") {
    try {
      const { transcription, effects } = payload;
      const data = JSON.stringify({
        version: 1,
        transcription,
        effects
      }, null, 2);
      self.postMessage({ type: "JSON_READY", payload: data });
    } catch (err) {
      self.postMessage({
        type: "ERROR",
        payload: err instanceof Error ? err.message : String(err)
      });
    }
  }
};

//# debugId=221AF948A948ECEE64756E2164756E21
