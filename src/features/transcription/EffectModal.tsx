import { memo, useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
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
 * Icon: lightning bolt (effect)
 */
const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
  </svg>
);

/**
 * Icon: trash (remove)
 */
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

interface EffectModalProps {
  segmentStart: number;
  onClose: () => void;
  onAdd: (effect: SoundCensoringEffect) => void;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const EffectModal = memo(({ segmentStart, onClose, onAdd }: EffectModalProps) => {
  const bleepSounds = usePlayerStore((state) => state.bleepSounds);
  const soundList = Object.values(bleepSounds);

  const [selectedSoundId, setSelectedSoundId] = useState('');
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [dampenOriginal, setDampenOriginal] = useState(false);
  const [dampenAmount, setDampenAmount] = useState(0.7);
  const [dampenType, setDampenType] = useState<'sharp' | 'parabolic'>('sharp');

  const handleSubmit = () => {
    if (!selectedSoundId) return;

    const effect: SoundCensoringEffect = {
      id: uid(),
      segmentStart,
      soundId: selectedSoundId,
      volume,
      playbackRate,
      dampenOriginal,
      dampenAmount,
      dampenType,
      effectType: 'sound',
    };
    onAdd(effect);
    onClose();
  };

  const canSubmit = selectedSoundId !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BoltIcon /> Add Effect
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
            <CloseIcon />
          </button>
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
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
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
              id="dampenToggle"
              checked={dampenOriginal}
              onChange={(e) => setDampenOriginal(e.target.checked)}
              className="accent-purple-500"
            />
            <label htmlFor="dampenToggle" className="text-xs text-zinc-300">
              Dampen original audio
            </label>
          </div>

          {dampenOriginal && (
            <>
              {/* Dampen amount */}
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
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>50%</span>
                  <span>100% (mute)</span>
                </div>
              </div>

              {/* Dampen type */}
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
          className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Effect
        </button>
      </div>
    </div>
  );
});

/**
 * Badge shown on a transcription row that has a sound effect attached.
 */
const EffectBadge = memo(({ effect, onRemove }: { effect: SoundCensoringEffect; onRemove: (id: string) => void }) => {
  const bleepSounds = usePlayerStore((state) => state.bleepSounds);
  const soundLabel = bleepSounds[effect.soundId]?.label ?? 'Unknown';

  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded group">
      <BoltIcon />
      <span className="truncate max-w-[80px]">{soundLabel}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(effect.id); }}
        className="hidden group-hover:flex items-center text-red-400 hover:text-red-300"
        title="Remove effect"
      >
        <TrashIcon />
      </button>
    </span>
  );
});

export { EffectModal, EffectBadge };