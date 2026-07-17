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
  const triggeredEffectsRef = React.createRef<Set<string>>(new Set());

  /**
   * Запускает звуковой эффект цензуры в нужное время.
   * Проигрывает звук бипа с заданной громкостью и скоростью,
   * при необходимости приглушает оригинальный аудио.
   */
  function triggerSoundEffect(
    effect: SoundCensoringEffect,
    segmentEnd: number,
  ): void {
    const ctx = deps.audioContextRef.current;
    const gainNode = deps.gainNodeRef.current;
    if (!ctx || !gainNode) return;

    const sound = usePlayerStore.getState().bleepSounds[effect.soundId];
    if (!sound || !sound.audioBuffer) return;

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

    // Dampen original audio for the full segment duration,
    // independent of the bleep sound's playback rate.
    if (effect.dampenOriginal) {
      const currentGain = gainNode.gain.value;
      const dampenedGain = currentGain * (1 - effect.dampenAmount);
      // Convert media-time segment duration to wall-clock duration
      const spd = usePlayerStore.getState().playbackSpeed;
      const segmentDuration = (segmentEnd - effect.segmentStart) / spd;

      if (effect.dampenType === 'sharp') {
        // Immediate drop, hold, immediate restore at segment end
        gainNode.gain.setValueAtTime(dampenedGain, now);
        gainNode.gain.setValueAtTime(currentGain, now + segmentDuration);
      } else {
        // Parabolic: smooth dip and restore using setTargetAtTime
        const tau = segmentDuration * 0.3;
        gainNode.gain.setValueAtTime(dampenedGain, now);
        gainNode.gain.setTargetAtTime(currentGain, now + tau, tau);
        // Force-restore at segment end to avoid lingering drift
        gainNode.gain.setValueAtTime(currentGain, now + segmentDuration);
      }
    }
  }

  /**
   * Проверяет время воспроизведения против списка звуковых эффектов
   * и запускает те, которые ещё не сработали в текущей сессии.
   */
  function checkSoundEffects(playbackTime: number): void {
    const { censoringEffects, transcriptionResults, censoringMode } =
      usePlayerStore.getState();
    if (!censoringMode || !censoringEffects || !transcriptionResults) return;

    for (const e of censoringEffects) {
      if (e.effectType !== 'sound') continue;
      if (triggeredEffectsRef.current.has(e.id)) continue;

      // Find the segment end time from transcription results
      const seg = transcriptionResults.find(
        ([s]) => Math.abs(s - e.segmentStart) < 0.01,
      );
      if (!seg) continue;

      const [start, end] = seg;
      if (playbackTime >= start && playbackTime < end) {
        triggeredEffectsRef.current.add(e.id);
        triggerSoundEffect(e, end);
      }
    }
  }

  return { triggeredEffectsRef, checkSoundEffects };
}
