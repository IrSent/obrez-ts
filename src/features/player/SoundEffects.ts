import React from 'react';
import { usePlayerStore } from '../../store/playerStore';
import type { SoundCensoringEffect } from '../../types';

/**
 * Зависимости, требуемые для работы движка звуковых эффектов.
 * Все ссылки передаются из хука useMediaPlayer, чтобы не дублировать
 * создание AudioContext и GainNode внутри фабрики.
 */
export interface SoundEffectsDeps {
  audioContextRef: React.RefObject<AudioContext | null>;
  gainNodeRef: React.RefObject<GainNode | null>;
  queuedAudioNodesRef: React.RefObject<Set<AudioBufferSourceNode>>;
  playbackSpeedRef: React.RefObject<number>;
}

/**
 * Возвращаемый интерфейс движка звуковых эффектов.
 */
export interface SoundEffectsEngine {
  /** Множество ID эффектов, которые уже сработали в текущей сессии воспроизведения. */
  triggeredEffectsRef: React.MutableRefObject<Set<string>>;

  /**
   * Проверяет текущее время воспроизведения и запускает звуковые эффекты,
   * которые ещё не сработали.
   */
  checkSoundEffects: (playbackTime: number) => void;
}

/**
 * Фабрика для создания движка звуковых эффектов.
 * Выделяет логику проигрывания звуков цензуры (бипы) из хука useMediaPlayer,
 * чтобы упростить тестирование и повторное использование.
 */
export function createSoundEffectsEngine(deps: SoundEffectsDeps): SoundEffectsEngine {
  const triggeredEffectsRef = { current: new Set<string>() };

  /**
   * Запускает звуковой эффект цензуры в нужное время.
   * Проигрывает звук бипа с заданной громкостью и скоростью,
   * при необходимости приглушает оригинальный аудио.
   */
  function triggerSoundEffect(
    effect: SoundCensoringEffect,
    segmentEnd: number,
    pvnLatency: number,
  ): void {
    const ctx = deps.audioContextRef.current;
    const gainNode = deps.gainNodeRef.current;
    if (!ctx || !gainNode) return;

    const sound = usePlayerStore.getState().bleepSounds[effect.soundId];
    if (!sound) return;

    const spd = deps.playbackSpeedRef.current;

    // 'silence' — no audio to play, only dampen original
    if (effect.soundId === 'silence') {
      if (effect.dampenOriginal) {
        // The trigger fires early (pvnLatency before word start) so the
        // PhaseVocoderNode doesn't let the word through before dampening.
        // But silence itself must cover exactly the word: start→end.
        // Audio at media time `start` reaches the gain node
        // `pvnLatency / spd` wall-clock seconds after trigger.
        const silenceStartDelay = pvnLatency / spd;
        const wordDuration = (segmentEnd - effect.segmentStart) / spd;
        // Use nominal gain — the "intended" volume level, ignoring automation
        // from other effects. For non-overlapping effects (the common case),
        // this is correct: each effect dampens from nominal and restores to nominal.
        const currentGain = gainNode.gain.value;
        const dampenedGain = currentGain * (1 - effect.dampenAmount);
        gainNode.gain.setValueAtTime(dampenedGain, ctx.currentTime + silenceStartDelay);
        gainNode.gain.setValueAtTime(currentGain, ctx.currentTime + silenceStartDelay + wordDuration);
      }
      return;
    }

    if (!sound.audioBuffer) return;

    const now = ctx.currentTime;

    // Play the bleep sound at the configured volume and rate
    const source = ctx.createBufferSource();
    source.buffer = sound.audioBuffer;
    source.playbackRate.value = effect.playbackRate;

    const volGain = ctx.createGain();
    volGain.gain.value = effect.volume ** 2; // perceptual scaling
    source.connect(volGain);
    volGain.connect(ctx.destination);
    source.start(now);
    deps.queuedAudioNodesRef.current.add(source);
    source.onended = () => deps.queuedAudioNodesRef.current.delete(source);

    // Dampen original audio — aligned to the exact word boundaries.
    // The trigger fires early (pvnLatency before word start), so we must
    // delay dampen until the word audio actually reaches the gain node.
    // independent of the bleep sound's playback rate.
    if (effect.dampenOriginal) {
      const currentGain = gainNode.gain.value;
      const dampenedGain = currentGain * (1 - effect.dampenAmount);
      // Audio at media time `start` reaches the gain node
      // `pvnLatency / spd` wall-clock seconds after trigger.
      const delay = pvnLatency / spd;
      // Convert media-time segment duration to wall-clock duration
      const segmentDuration = (segmentEnd - effect.segmentStart) / spd;

      if (effect.dampenType === 'sharp') {
        // Immediate drop at word start, hold, immediate restore at word end
        gainNode.gain.setValueAtTime(dampenedGain, now + delay);
        gainNode.gain.setValueAtTime(currentGain, now + delay + segmentDuration);
      } else {
        // Parabolic: smooth dip and restore using setTargetAtTime
        const tau = segmentDuration * 0.3;
        gainNode.gain.setValueAtTime(dampenedGain, now + delay);
        gainNode.gain.setTargetAtTime(currentGain, now + delay + tau, tau);
        // Force-restore at word end to avoid lingering drift
        gainNode.gain.setValueAtTime(currentGain, now + delay + segmentDuration);
      }
    }
  }

  /**
   * Проверяет время воспроизведения против списка звуковых эффектов
   * и запускает те, которые ещё не сработали в текущей сессии.
   *
   * PhaseVocoderNode introduces latency (~43ms at fftSize=2048, 48kHz).
   * Without compensation, the dampening starts after the segment audio
   * has already been output → user hears the word before it's censored.
   * We trigger earlier by the equivalent media-time latency so the
   * gainNode automation aligns with the audio that reaches the listener.
   */
  function checkSoundEffects(playbackTime: number): void {
    const { censoringEffects, transcriptionResults, censoringMode, bleepSounds }
      = usePlayerStore.getState();
    if (!censoringMode || !censoringEffects || !transcriptionResults) return;

    const speed = deps.playbackSpeedRef.current;
    // PhaseVocoderNode latency in audio-context seconds.
    // At 1x the vocoder is bypassed → negligible latency.
    // At >1x latency ≈ fftSize / sampleRate (2048 / 48000 ≈ 42.7ms).
    // Convert to media-time: latency / speed.
    const pvnLatency = speed > 1 ? 0.043 / speed : 0;

    for (const e of censoringEffects) {
      if (e.effectType !== 'sound') continue;
      if (triggeredEffectsRef.current.has(e.id)) continue;

      // Find the segment end time from transcription results
      const seg = transcriptionResults.find(
        ([s]) => Math.abs(s - e.segmentStart) < 0.01,
      );
      if (!seg) continue;

      const [start, end] = seg;
      // Trigger earlier by the PhaseVocoderNode latency so dampening
      // aligns with the audio that reaches the listener.
      if (playbackTime >= start - pvnLatency && playbackTime < end) {
        triggeredEffectsRef.current.add(e.id);
        triggerSoundEffect(e, end, pvnLatency);
      }
    }
  }

  return { triggeredEffectsRef, checkSoundEffects };
}
