import { useAuthStore } from '../../store/authStore';
import { PlanCard, PLANS } from '../settings/PlanCard';
import { canFreeTopup, daysUntilFreeTopup, formatSeconds } from '../../utils/auth';

interface TopupModalProps {
  onClose: () => void;
  onTopup: () => void;
}

export function TopupModal({ onClose, onTopup }: TopupModalProps) {
  const user = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.user);
  const topup = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.topup);
  const isLoading = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.isLoading);
  const error = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.error);
  const clearError = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.clearError);

  const handleTopup = async (pkgType: string) => {
    await topup(pkgType as Parameters<typeof topup>[0]);
    if (!useAuthStore.getState().error) {
      onTopup();
    }
  };

  const freeAvailable = user ? canFreeTopup(user.last_free_topup) : false;
  const daysLeft = user ? daysUntilFreeTopup(user.last_free_topup) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-zinc-700 max-h-[85vh] overflow-y-auto">
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

        {daysLeft !== null && daysLeft > 0 && (
          <p className="text-xs text-yellow-400 mb-3">
            Free topup available in {daysLeft} day{daysLeft > 1 ? 's' : ''}
          </p>
        )}

        {/* Plan cards */}
        <div className="space-y-3">
          {PLANS.map((plan, i) => {
            const isFree = plan.type === 'free';
            const isDisabled = isFree && !freeAvailable;
            return (
              <PlanCard
                key={plan.type}
                plan={plan}
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
      </div>
    </div>
  );
}
