import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { HourPackCard, HOUR_PACKS, CurrencySelector } from '../settings/HourPackCard';
import { canFreeTopup, daysUntilFreeTopup, formatSeconds } from '../../utils/auth';
import { PaymentModal } from './PaymentModal';
import type { HourPackType, FiatCurrency } from '../../types';

interface TopupModalProps {
  onClose: () => void;
  onTopup: () => void;
}

export function TopupModal({ onClose, onTopup }: TopupModalProps) {
  const user = useAuthStore((s) => s.user);
  const topup = useAuthStore((s) => s.topup);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const activeInvoice = useAuthStore((s) => s.activeInvoice);
  const clearActiveInvoice = useAuthStore((s) => s.clearActiveInvoice);

  const [selectedCurrency, setSelectedCurrency] = useState<FiatCurrency>('USD');
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null);

  const handleTopup = async (pkgType: HourPackType) => {
    await topup(pkgType, selectedCurrency);
    const err = useAuthStore.getState().error;
    const inv = useAuthStore.getState().activeInvoice;
    if (!err && !inv) {
      // Free pack — show success message
      const hours = pkgType === 'free' ? 5 : '?';
      setTopupSuccess(`+${hours} hours added!`);
      setTimeout(() => setTopupSuccess(null), 3000);
    }
  };

  const handlePaymentPaid = () => {
    setTopupSuccess('Payment received! Your balance has been updated.');
    setTimeout(() => {
      clearActiveInvoice(); // Remove this after the success message is shown
      onTopup();
    }, 2000);
  };

  const handlePaymentClose = () => {
    clearActiveInvoice();
    // Re-check auth to get fresh balance
    useAuthStore.getState().checkAuth();
  };

  const freeAvailable = user ? canFreeTopup(user.last_free_topup) : false;
  const daysLeft = user ? daysUntilFreeTopup(user.last_free_topup) : null;

  // If there's an active invoice, show the payment modal instead
  if (activeInvoice) {
    return (
      <PaymentModal
        invoice={activeInvoice}
        onPaid={handlePaymentPaid}
        onClose={handlePaymentClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)] max-h-[85vh] overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Transcription Balance</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Auth indicator */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-zinc-700/50 rounded-lg">
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-sm font-semibold">
              {user?.first_name?.charAt(0) || '?'}
            </div>
          )}
          <div className="text-sm">
            <div className="text-zinc-100 font-medium">{user?.first_name || '—'}</div>
            <div className="text-zinc-400">
              Balance: <span className="text-purple-400">{formatSeconds(user?.remaining_seconds || 0)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-500 mb-3">
          +5 hours every 30 days free. Add more hours below.
        </p>

        {/* Currency selector */}
        <div className="mb-3">
          <div className="text-xs text-zinc-400 mb-1.5">Currency</div>
          <CurrencySelector value={selectedCurrency} onChange={setSelectedCurrency} />
        </div>

        {daysLeft !== null && daysLeft > 0 && (
          <p className="text-xs text-yellow-400 mb-3">
            Free topup available in {daysLeft} day{daysLeft > 1 ? 's' : ''}
          </p>
        )}

        {/* Hour pack cards */}
        <div className="space-y-3">
          {HOUR_PACKS.map((pack, i) => {
            const isFree = pack.type === 'free';
            const isDisabled = isFree && !freeAvailable;
            return (
              <HourPackCard
                key={pack.type}
                pack={pack}
                disabled={isDisabled}
                isLoading={isLoading}
                onSelect={handleTopup}
                delay={i * 1200}
              />
            );
          })}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={clearError} className="text-xs text-red-300 underline mt-1">
              Dismiss
            </button>
          </div>
        )}
        {topupSuccess && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
            <p className="text-xs text-green-400">✓ {topupSuccess}</p>
          </div>
        )}
      </div>
    </div>
  );
}
