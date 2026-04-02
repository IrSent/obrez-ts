import { FastAhoScanner } from "./aho-corasick.ts";

let scanner: FastAhoScanner | null = null;

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === "INIT_DICT") {
    // payload — это массив строк/словарь
    scanner = new FastAhoScanner(payload);
  }

  if (type === "SEARCH" && scanner) {
    const { text, timestamp } = payload;
    const hits = scanner.findMatches(text);
    if (hits.length > 0) {
      self.postMessage({ type: "RESULTS", payload: { hits, timestamp } });
    }
  }
};
