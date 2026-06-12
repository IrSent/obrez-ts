import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import type { SoundCensoringEffect } from '../../types';

/**
 * Icon: close (X)
 */
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Icon: plus
 */
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface UserDefinedWordModalProps {
  /** End time of the previous transcription row — this is our word's start */
  prevEnd: number;
  onClose: () => void;
}

const DELTA_OPTIONS = [0.1, 0.2, 0.3, 0.5, 0.8, 1.0];

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const UserDefinedWordModal = memo(({ prevEnd, onClose }: UserDefinedWordModalProps) => {
  const bleepSounds = usePlayerStore((state) => state.bleepSounds);
  const soundList = Object.values(bleepSounds);

  const [word, setWord] = useState('');
  const [selectedSoundId, setSelectedSoundId] = useState('');
  const [endDelta, setEndDelta] = useState(0.3);
  const [volume, setVolume] = useState(1);
  const [volumeMode, setVolumeMode] = useState<'manual' | 'auto'>('auto');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [dampenOriginal, setDampenOriginal] = useState(true);
  const [dampenAmount, setDampenAmount] = useState(1);
  const [dampenType, setDampenType] = useState<'sharp' | 'parabolic'>('sharp');

  const { seekToTime, play, pause } = useMediaPlayerContext();
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordStart = prevEnd;
  const wordEnd = prevEnd + endDelta;

  // Preview audio when endDelta changes
  const previewRef = useCallback((delta: number) => {
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);

    const duration = delta * 1000;
    seekToTime(wordStart).then(() => {
      play();
      previewTimeoutRef.current = setTimeout(() => {
        pause();
      }, Math.min(duration + 200, 2000));
    });
  }, [wordStart, seekToTime, play, pause]);

  useEffect(() => {
    previewRef(endDelta);
  }, [endDelta, previewRef]);

  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, []);

  const canSubmit = selectedSoundId !== '';

  const handleSubmit = () => {
    // Add the transcription row
    playerActions.addTranscriptionRow([wordStart, wordEnd, word || '...'] as [number, number, string]);

    // Add the sound effect
    const effect: SoundCensoringEffect = {
      id: uid(),
      segmentStart: wordStart,
      soundId: selectedSoundId,
      volume,
      volumeMode,
      playbackRate,
      dampenOriginal,
      dampenAmount,
      dampenType,
      effectType: 'sound',
    };
    playerActions.addSoundEffect(effect);

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <PlusIcon /> Add Word
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
            <CloseIcon />
          </button>
        </div>

        {/* Word input */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Word (optional)</label>
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500"
            placeholder="Enter the word..."
          />
        </div>

        {/* Time range */}
        <div className="text-xs text-zinc-400">
          <div>Start: {wordStart.toFixed(2)}s</div>
          <div>End: {wordEnd.toFixed(2)}s (Δ {endDelta.toFixed(1)}s)</div>
        </div>

        {/* End delta buttons */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Word Duration</label>
          <div className="flex flex-wrap gap-1">
            {DELTA_OPTIONS.map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => setEndDelta(delta)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  endDelta === delta
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                }`}
              >
                +{delta}s
              </button>
            ))}
          </div>
        </div>

        {/* Sound selection */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Bleep Sound</label>
          <select
            value={selectedSoundId}
            onChange={(e) => setSelectedSoundId(e.target.value)}
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">— Select a sound —</option>
            {soundList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {soundList.length === 0 && (
            <p className="text-[11px] text-zinc-500 mt-1">
              No bleep sounds available. Add sounds in the Bleep Sounds section first.
            </p>
          )}
        </div>

        {/* Volume */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-zinc-400">Effect Volume</label>
            <span className="text-xs text-zinc-300">{Math.round(volume * 100)}%</span>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setVolumeMode('manual')}
              className={`flex-1 text-xs py-1 rounded transition-colors ${
                volumeMode === 'manual'
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setVolumeMode('auto')}
              className={`flex-1 text-xs py-1 rounded transition-colors ${
                volumeMode === 'auto'
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              Match Word Gain
            </button>
          </div>
          {volumeMode === 'manual' && (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
          )}
          {volumeMode === 'auto' && (
            <p className="text-[10px] text-zinc-500">
              Bleep volume will match the loudness of the word being censored.
            </p>
          )}
        </div>

        {/* Playback rate */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-zinc-400">Playback Speed</label>
            <span className="text-xs text-zinc-300">{playbackRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
        </div>

        {/* Dampen original */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dampenToggleUD"
              checked={dampenOriginal}
              onChange={(e) => setDampenOriginal(e.target.checked)}
              className="accent-purple-500"
            />
            <label htmlFor="dampenToggleUD" className="text-xs text-zinc-300">
              Dampen original audio
            </label>
          </div>

          {dampenOriginal && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-zinc-400">Dampen Amount</label>
                  <span className="text-xs text-zinc-300">{Math.round(dampenAmount * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={dampenAmount * 100}
                  onChange={(e) => setDampenAmount(Number(e.target.value) / 100)}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Dampen Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDampenType('sharp')}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                      dampenType === 'sharp'
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    Sharp
                  </button>
                  <button
                    type="button"
                    onClick={() => setDampenType('parabolic')}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                      dampenType === 'parabolic'
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                    }`}
                  >
                    Parabolic
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-semibold py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Word + Effect
        </button>
      </div>
    </div>
  );
});

export { UserDefinedWordModal };
