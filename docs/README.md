# Obrez — Documentation

> Browser-based video censorship tool: load a video, transcribe its audio, mark segments for censoring, and export the censored result — all in the client.

- [Getting Started](getting-started.md) — setup, dev server, build, deploy
- [Architecture Overview](architecture.md) — system design, data flow, core abstractions
- [Audio Engine](audio-engine.md) — PhaseVocoderNode, state machine, dual-path gain, quality principles
- [Export Pipeline](export-pipeline.md) — parallel collect/prep/render/encode, WritableBuffer, codec selection
- [Transcription](transcription.md) — backend flow, WebSocket protocol, auth integration
- [API Reference](api-reference.md) — types, stores, hooks, config, utility functions
- [Testing Guide](testing.md) — e2e strategy, running tests, diagnostic hooks
