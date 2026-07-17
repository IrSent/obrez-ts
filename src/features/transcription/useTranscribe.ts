import { useCallback } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import {
  ALL_FORMATS,
  ReadableStreamSource,
  Input,
  Mp4OutputFormat,
  Output,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
} from 'mediabunny';
import { audioBuffersToWav } from '../../audio';
import { loadBackendUrl, backendPath, backendWsPath, backendHeaders } from '../../config';

export interface TranscribeDeps {
  audioTrackRef: React.RefObject<any | null>;
  resourceRef: React.RefObject<File | string | null>;
  audioSinkRef: React.RefObject<any | null>;
}

export function useTranscribe(deps: TranscribeDeps): () => Promise<void> {
  const { audioTrackRef, resourceRef, audioSinkRef } = deps;

  const transcribe = useCallback(async () => {
    if (!audioTrackRef.current) {
      playerActions.setError('No audio track available for transcription');
      return;
    }

    try {
      playerActions.setTranscribing(true);
      playerActions.setTranscribeStage('Collecting audio data…');

      const format = usePlayerStore.getState().transcribeFormat;
      const fileName = usePlayerStore.getState().fileName;

      let audioBlob: Blob;
      let audioFileName: string;

      if (format === 'original') {
        // Создать отдельный Input для транскрипции, чтобы не конкурировать
        // с воспроизведением за пакеты — пауза не нужна.
        const resource = resourceRef.current;
        if (!resource) throw new Error('No media resource available');

        // Используем ReadableStreamSource для транскрипции — стримит из Blob
        const transcribeSource = new ReadableStreamSource(
          (resource as Blob).stream(),
          { maxCacheSize: 32 * 1024 * 1024 }
        );
        const transcribeInput = new Input({ source: transcribeSource, formats: ALL_FORMATS });
        const transcribeAudioTrack = await transcribeInput.getPrimaryAudioTrack();
        if (!transcribeAudioTrack) throw new Error('No audio track found for transcription');

        const codec = await transcribeAudioTrack.getCodec();
        if (!codec) throw new Error('Audio track codec could not be determined');

        const codecParamString = await transcribeAudioTrack.getCodecParameterString();
        const decoderConfig = await transcribeAudioTrack.getDecoderConfig();

        // Потоковый ремукс: один проход — чтение пакета → мультиплексирование в MP4.
        // Без сканирования метаданных, без накопления пакетов в памяти.
        const outputFormat = new Mp4OutputFormat();
        const bufferTarget = new BufferTarget();
        const output = new Output({ format: outputFormat, target: bufferTarget });
        const encodedSource = new EncodedAudioPacketSource(codec);
        await output.addAudioTrack(encodedSource);
        await output.start();

        // Собираем метаданные чанка для первого вызова add() — требуется муксером.
        // Для AAC: передаём description (AudioSpecificConfig), чтобы муксер не
        // пытался парсить ADTS-заголовки из сырых пакетов.
        const chunkMeta = {
          decoderConfig: {
            codec: codecParamString ?? codec,
            sampleRate: decoderConfig?.sampleRate ?? transcribeAudioTrack.sampleRate,
            numberOfChannels:
              decoderConfig?.numberOfChannels ?? transcribeAudioTrack.numberOfChannels,
            description: decoderConfig?.description ?? undefined,
          },
        };

        const encodedSink = new EncodedPacketSink(transcribeAudioTrack);
        const YIELD_EVERY = 100;
        let packetCount = 0;
        let tsShift = 0;

        // Чтение и мультиплексирование за один проход. Временные метки AAC
        // монотонны, поэтому первый пакет даёт tsShift (отрицательный → сдвиг к 0).
        for await (const pkt of encodedSink.packets()) {
          if (packetCount === 0) {
            tsShift = pkt.timestamp < 0 ? -pkt.timestamp : 0;
          }

          if (tsShift > 0) {
            await encodedSource.add(
              new EncodedPacket(
                pkt.data,
                pkt.type,
                pkt.timestamp + tsShift,
                pkt.duration,
              ),
              packetCount === 0 ? chunkMeta : undefined,
            );
          } else {
            await encodedSource.add(pkt, packetCount === 0 ? chunkMeta : undefined);
          }
          packetCount++;

          // Уступаем управление event loop, чтобы UI оставался отзывчивым
          if (packetCount % YIELD_EVERY === 0) {
            playerActions.setTranscribeStage(
              `Remuxing audio — ${packetCount} packets`
            );
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        playerActions.setTranscribeStage(
          `Remuxing audio — ${packetCount} packets (finalizing…)`
        );
        await output.finalize();

        const result = bufferTarget.buffer;
        if (!result) {
          throw new Error('Remux completed but no output buffer was produced');
        }

        audioBlob = new Blob([result], { type: 'video/mp4' });
        audioFileName = `${fileName}.mp4`;

        // Очистка: уничтожаем Input транскрипции для освобождения ресурсов.
        transcribeInput.dispose();
      } else {
        // Путь WAV: собираем декодированные буферы, кодируем в PCM WAV
        if (!audioSinkRef.current) {
          throw new Error('Audio sink not available for WAV encoding');
        }

        const chunks: AudioBuffer[] = [];
        for await (const { buffer } of audioSinkRef.current.buffers(0)) {
          chunks.push(buffer);
          playerActions.setTranscribeStage(`Collecting audio data… (${chunks.length} chunks)`);
        }

        playerActions.setTranscribeStage(`Encoding WAV — ${chunks.length} chunks to process`);
        audioBlob = await audioBuffersToWav(chunks, audioTrackRef.current.sampleRate, (stage, done, total) => {
          const pct = Math.round((done / total) * 100);
          playerActions.setTranscribeStage(`${stage} — ${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
        });
        audioFileName = `${fileName}.wav`;
      }

      playerActions.setTranscribeStage('Sending to server…');
      await loadBackendUrl(); // гарантируем загрузку конфига перед backendPath()
      const formData = new FormData();
      formData.append('file', audioBlob, audioFileName);

      const response = await fetch(backendPath('/transcribe'), {
        headers: backendHeaders(),
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const { task_id } = await response.json();

      playerActions.setTranscribeStage('Waiting for transcription…');

      // Считаем секунды ожидания ответа сервера
      const waitStart = Date.now();
      const waitInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - waitStart) / 1000);
        playerActions.setTranscribeStage(`Waiting for server… (${secs}s)`);
      }, 1000);

      const socket = new WebSocket(backendWsPath(`/ws/status/${task_id}`));

      await new Promise((resolve, reject) => {
        socket.onmessage = (event) => {
          clearInterval(waitInterval);
          const msg = JSON.parse(event.data);
          if (msg.status === 'PROCESSING') {
            playerActions.setTranscribing(true);

            // Сервер может отправлять информацию о прогрессе в results: { progress, segments, time, phase }
            const prog = msg.results;
            if (prog && typeof prog === 'object' && 'progress' in prog) {
              const pct = prog.progress ?? 0;
              const segs = prog.segments ?? '';
              const time = prog.time ?? '';
              const phase = prog.phase ?? '';
              const validPct = isNaN(pct) ? 0 : pct;

              if (phase === 'segmenting') {
                const detail = [validPct > 0 ? validPct + '%' : '', segs].filter(Boolean).join(' · ');
                playerActions.setTranscribeStage(`Segmenting — ${detail}`);
              } else {
                const detail = [validPct + '%', segs, time].filter(Boolean).join(' · ');
                playerActions.setTranscribeStage(`Transcribing — ${detail}`);
              }
            } else {
              playerActions.setTranscribeStage('Server is transcribing…');
            }
          } else if (msg.status === 'DONE') {
            const resultsInSeconds = msg.results.map(
              ([start, end, text]: [number, number, string]) => [start / 1000, end / 1000, text] as [number, number, string]
            );
            // Откладываем к макрозадаче: цикл rAF успевает отрендерить
            // текущий кадр видео перед дорогой отрисовкой транскрипции в React.
            setTimeout(() => {
              playerActions.setTranscriptionDone(resultsInSeconds);
              socket.close();
              resolve(true);
            }, 0);
          } else if (msg.status === 'ERROR') {
            playerActions.setTranscribing(false);
            reject(new Error(msg.results || 'Transcription error'));
          }
        };

        socket.onerror = (error) => {
          clearInterval(waitInterval);
          playerActions.setTranscribing(false);
          console.error('WebSocket error:', error);
          playerActions.setError('Failed to connect to transcription server');
          socket.close();
          reject(new Error('WebSocket error'));
        };
      });
    } catch (error) {
      console.error('Transcription error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Transcription failed');
    }
  }, [audioSinkRef, audioTrackRef]);

  return transcribe;
}
