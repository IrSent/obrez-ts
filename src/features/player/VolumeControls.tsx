import { memo, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

/**
 * Icon: volume up
 */
const VolumeUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

/**
 * Icon: volume off
 */
const VolumeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const MODAL_SHADOW = 'shadow-[0_30px_90px_rgba(0,0,0,0.8),0_18px_50px_rgba(0,0,0,0.6),0_8px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(113,113,122,0.5)]';

const VolumeControlsInner = () => {
  const volume = usePlayerStore((state) => state.volume);
  const isMuted = usePlayerStore((state) => state.isMuted);
  const { setVolume, toggleMute } = useMediaPlayerContext();
  const [showModal, setShowModal] = useState(false);
  const [overdrive, setOverdrive] = useState(false);

  const maxVal = overdrive ? 200 : 100;
  const currentVal = Math.round((isMuted ? 0 : volume) * 100);

  const handleVolumeChange = useCallback((v: number) => {
    const vol = v / 100;
    setVolume(vol);
  }, [setVolume]);

  const handleOverdriveToggle = useCallback((next: boolean) => {
    setOverdrive(next);
    if (!next && volume > 1) {
      setVolume(1);
    }
  }, [volume, setVolume]);

  const volumeIcon = isMuted
    ? <VolumeOffIcon />
    : <VolumeUpIcon />;

  return (
    <>
      {/* Volume button in the row */}
      <button
        onClick={() => setShowModal(true)}
        className="h-10 flex items-center justify-center gap-1 rounded-b-lg px-3 py-2 flex-shrink-0 text-[11px] font-semibold
          shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(0,0,0,0.25)]
          bg-zinc-700 hover:bg-zinc-600 text-zinc-200 active:bg-zinc-600"
        title={`Volume: ${currentVal}%`}
        aria-label="Open volume controls"
      >
        {volumeIcon}
        <span className="tabular-nums">{currentVal}%</span>
      </button>

      {/* Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowModal(false)}>
          <div
            className={`relative bg-zinc-800 rounded-2xl p-8 flex flex-col items-center justify-center ${MODAL_SHADOW}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 3D inner bevel */}
            <div className="absolute inset-0 rounded-2xl border border-transparent border-t-[rgba(255,255,255,0.08)] border-b-[rgba(0,0,0,0.2)] pointer-events-none" />
            {/* Inner depth gradient */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[rgba(255,255,255,0.04)] to-transparent pointer-events-none" />

            <div className="relative flex flex-col items-center gap-6">
              {/* Close button */}
              <button
                onClick={() => setShowModal(false)}
                className="absolute -top-1 -right-1 p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400
                  shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(0,0,0,0.25)]"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>

              {/* Title */}
              <div className="flex items-center gap-2 text-zinc-300">
                <VolumeUpIcon />
                <span className="text-xs font-semibold uppercase tracking-wider">Volume</span>
              </div>

              {/* Mute button */}
              <button
                onClick={toggleMute}
                className="flex items-center justify-center gap-1 rounded-b-lg px-4 py-2 text-[11px] font-semibold
                  shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(0,0,0,0.25)]
                  bg-zinc-700 hover:bg-zinc-600 text-zinc-200 active:bg-zinc-600"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                <span className="tabular-nums">{isMuted ? 'Muted' : currentVal}%</span>
              </button>

              {/* Vertical slider */}
              <VerticalSlider
                value={currentVal}
                max={maxVal}
                onChange={handleVolumeChange}
                isOverdrive={overdrive}
              />

              {/* Overdrive checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400 hover:text-zinc-200 transition-colors">
                <input
                  type="checkbox"
                  checked={overdrive}
                  onChange={(e) => handleOverdriveToggle(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                  overdrive
                    ? 'bg-purple-600 border-purple-500'
                    : 'bg-zinc-700 border-zinc-600'
                }`}>
                  {overdrive && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-xs font-semibold">Overdrive (up to 200%)</span>
              </label>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

/**
 * Custom vertical slider — premium audio equipment style.
 * LED-style VU meter gradient (green → amber → red),
 * chrome thumb with grip lines, metallic groove track.
 * Bottom = 0%, Top = max%. When isOverdrive, top half is 100-200%.
 */
function VerticalSlider({
  value,
  max,
  onChange,
  isOverdrive,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  isOverdrive: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const pct = max > 0 ? (value / max) * 100 : 0;

  const handlePointer = useCallback((clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = 1 - (clientY - rect.top) / rect.height;
    const clamped = Math.max(0, Math.min(1, raw));
    const v = Math.round(clamped * max);
    onChange(v);
  }, [max, onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    handlePointer(e.clientY);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [handlePointer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    handlePointer(e.clientY);
  }, [handlePointer]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // LED color based on level
  const ledColor = value > 100
    ? { glow: '#ef4444', fill: '#dc2626' }   // red — overdrive
    : value > 70
      ? { glow: '#f59e0b', fill: '#d97706' } // amber
      : { glow: '#22c55e', fill: '#16a34a' }; // green

  return (
    <div
      ref={trackRef}
      className="relative w-16 h-56 cursor-pointer select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Outer metallic frame */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-zinc-600 via-zinc-700 to-zinc-600">
        <div className="absolute inset-0 rounded-lg border border-zinc-500/30" />
      </div>

      {/* Groove track — recessed channel */}
      <div className="absolute left-[7px] right-[7px] top-[6px] bottom-[6px] rounded-full bg-zinc-950 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9),inset_0_1px_2px_rgba(0,0,0,0.6)]">
        {/* Metallic groove highlight left */}
        <div className="absolute left-[3px] top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-transparent via-zinc-600/30 to-transparent" />

        {/* Overdrive zone — top half when enabled */}
        {isOverdrive && (
          <div className="absolute inset-x-0 top-0 h-1/2">
            <div className="absolute inset-x-[3px] top-1 bottom-1 rounded-t-full bg-red-950/20">
              <div className="absolute inset-x-1 top-1 text-[6px] text-red-500/60 font-mono text-center leading-none tracking-widest">
                OVR
              </div>
            </div>
          </div>
        )}

        {/* LED Fill — glowing bar from bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-full"
          style={{ height: `${pct}%` }}
        >
          <div
            className="w-full h-full rounded-b-full"
            style={{
              background: value > 100
                ? 'linear-gradient(to top, #dc2626, #f59e0b, #22c55e)'
                : value > 50
                  ? 'linear-gradient(to top, #16a34a, #f59e0b)'
                  : 'linear-gradient(to top, #16a34a, #22c55e)',
              boxShadow: `0 0 10px ${ledColor.glow}80, 0 0 20px ${ledColor.glow}40, inset 0 0 4px ${ledColor.glow}60`,
            }}
          />
        </div>

        {/* LED dots — tick marks along the track */}
        <div className="absolute inset-x-[10px] top-0 bottom-0">
          {Array.from({ length: 20 }).map((_, i) => {
            const tickPct = (i / 19) * 100;
            const isActive = tickPct <= pct;
            return (
              <div
                key={i}
                className="absolute left-0 right-0 h-[1px]"
                style={{ bottom: `${tickPct}%` }}
              >
                <div
                  className={`w-[3px] h-[3px] rounded-full mx-auto ${isActive ? 'shadow-[0_0_3px_1px_rgba(0,0,0,0)]' : ''}`}
                  style={isActive ? {
                    backgroundColor: value > 100 ? '#ef4444' : value > 70 ? '#f59e0b' : '#22c55e',
                    boxShadow: `0 0 4px ${ledColor.glow}80`,
                  } : {
                    backgroundColor: 'rgba(100,116,139,0.3)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Chrome thumb with grip lines */}
        <div
          className="absolute left-[-2px] right-[-2px] h-7 transition-all duration-75"
          style={{
            bottom: `${pct}%`,
            transform: 'translateY(50%)',
          }}
        >
          {/* Thumb body — metallic gradient */}
          <div className="absolute inset-x-0 top-[3px] bottom-[3px] rounded-md bg-gradient-to-b from-zinc-300 via-zinc-400 to-zinc-300 shadow-[0_2px_8px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]">
            {/* Grip lines */}
            <div className="absolute inset-x-1 top-0 bottom-0 flex flex-col justify-evenly">
              {[0, 1, 2, 3, 4].map((j) => (
                <div key={j} className="h-[1px] bg-zinc-500/60" />
              ))}
            </div>
          </div>
          {/* Thumb top highlight */}
          <div className="absolute inset-x-1 top-0 h-[3px] rounded-t-md bg-gradient-to-b from-white/40 to-transparent" />
          {/* Thumb bottom shadow */}
          <div className="absolute inset-x-1 bottom-0 h-[3px] rounded-b-md bg-gradient-to-t from-black/30 to-transparent" />
          {/* LED indicator dot on thumb */}
          <div
            className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: ledColor.fill,
              boxShadow: `0 0 6px ${ledColor.glow}, 0 0 12px ${ledColor.glow}60`,
            }}
          />
        </div>
      </div>

      {/* Labels — dB style */}
      <div className="absolute -left-1 bottom-0 text-[7px] text-zinc-500 font-mono tabular-nums">MIN</div>
      {isOverdrive ? (
        <>
          <div className="absolute -left-1 top-[49%] -translate-y-1/2 text-[7px] text-zinc-500 font-mono tabular-nums">0dB</div>
          <div className="absolute -left-1 top-0 text-[7px] text-red-400 font-mono tabular-nums">MAX</div>
        </>
      ) : (
        <div className="absolute -left-1 top-0 text-[7px] text-zinc-500 font-mono tabular-nums">MAX</div>
      )}

      {/* Value display */}
      <div
        className="absolute -right-1 top-1/2 -translate-y-1/2 text-xs font-mono tabular-nums"
        style={{ color: value > 100 ? '#ef4444' : value > 70 ? '#f59e0b' : '#22c55e', textShadow: `0 0 8px ${ledColor.glow}60` }}
      >
        {value}
      </div>
    </div>
  );
}

export const VolumeControls = memo(VolumeControlsInner);
