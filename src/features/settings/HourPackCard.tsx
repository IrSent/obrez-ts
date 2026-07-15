import { memo } from 'react';
import type { HourPackType } from '../../types';

// ─── Hour pack data ───

export interface HourPack {
  type: HourPackType;
  hours: number;
  price: string;
  label: string;
  description: string;
  emoji: string;
  accent: string;
  bgFront: string;
  textGlow: string;
}

export const HOUR_PACKS: HourPack[] = [
  {
    type: 'free',
    hours: 5,
    price: 'Free',
    label: 'Free',
    description: 'Every 30 days',
    emoji: '🎁',
    accent: 'border-green-500/50',
    bgFront: 'from-green-950/80 via-zinc-900 to-green-950/60',
    textGlow: '0 0 12px rgba(34,197,94,0.4)',
  },
  {
    type: 'basic',
    hours: 10,
    price: '$0.99',
    label: 'Basic',
    description: '+10 hours of transcription',
    emoji: '⚡',
    accent: 'border-purple-500/50',
    bgFront: 'from-purple-950/80 via-zinc-900 to-purple-950/60',
    textGlow: '0 0 12px rgba(168,85,247,0.4)',
  },
  {
    type: 'pro',
    hours: 100,
    price: '$4.99',
    label: 'Pro',
    description: '+100 hours of transcription',
    emoji: '🚀',
    accent: 'border-amber-500/50',
    bgFront: 'from-amber-950/80 via-zinc-900 to-amber-950/60',
    textGlow: '0 0 12px rgba(245,158,11,0.4)',
  },
];

// ─── Card ───

interface HourPackCardProps {
  pack: HourPack;
  disabled: boolean;
  isLoading: boolean;
  onSelect: (type: HourPackType) => void;
  delay: number; // ms — stagger offset so cards don't spin in sync
}

export const HourPackCard = memo(({ pack, disabled, isLoading, onSelect, delay }: HourPackCardProps) => {
  const isFree = pack.type === 'free';
  const priceColor = isFree ? 'text-green-400' : pack.type === 'pro' ? 'text-amber-400' : 'text-purple-400';

  return (
    <div className="w-full" style={{ contain: 'layout style paint' }}>
    <button
      onClick={() => onSelect(pack.type)}
      disabled={disabled || isLoading}
      className={`group relative w-full cursor-pointer select-none rounded-2xl
        bg-gradient-to-br ${pack.bgFront} shadow-lg
        transition-shadow duration-300
        hover:shadow-xl hover:scale-[1.03]
        active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg`}
      style={{ perspective: '800px' }}
    >
      {/* Spinning inner — 3D rotate with inertia like a card settling on the table */}
      <div
        className={`relative w-full rounded-2xl border-2 ${pack.accent}`}
        style={{
          transformStyle: 'preserve-3d',
          animationName: 'card-spin',
          animationDuration: '5s',
          animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          animationIterationCount: 'infinite',
          animationDelay: `-${delay}ms`,
        }}
      >
        {/* ── Front ── */}
        <div
          className="p-5 flex flex-col gap-3"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl drop-shadow-lg">{pack.emoji}</span>
            <div>
              <div className="font-bold text-zinc-100 text-lg leading-tight">{pack.label}</div>
              <div className="text-[11px] text-zinc-400 leading-tight">{pack.description}</div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-300">+{pack.hours} hours</div>
            <div className={`text-xl font-extrabold ${priceColor}`} style={{ textShadow: pack.textGlow }}>
              {pack.price}
            </div>
          </div>

          {pack.type !== 'free' && (
            <div className="text-center text-[10px] text-zinc-500 italic">
              Payments coming soon
            </div>
          )}
        </div>

        {/* ── Back ── */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-800"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div className="text-center">
            <span className="text-5xl opacity-20">{pack.emoji}</span>
            <div className="text-[10px] text-zinc-600 mt-2 font-mono tracking-widest uppercase">
              Obrez
            </div>
          </div>
        </div>
      </div>

      {/* ── Keyframes: spin with inertia, decelerate to front, linger, spin again ── */}
      <style>{`
        @keyframes card-spin {
          0%   { transform: rotateY(0deg);   }
          8%   { transform: rotateY(90deg);  }
          16%  { transform: rotateY(180deg); }
          24%  { transform: rotateY(250deg); }
          30%  { transform: rotateY(360deg); }
          36%  { transform: rotateY(370deg); }
          42%  { transform: rotateY(360deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
    </button>
  </div>
  );
});
