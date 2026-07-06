import { useAuthStore } from '../../store/authStore';
import type { PackageType } from '../../types';

const PACKAGES: { type: PackageType; hours: number; price: string; label: string }[] = [
  { type: 'free', hours: 5, price: 'Free', label: '5 hours' },
  { type: 'basic', hours: 10, price: '$0.99', label: '+10 hours' },
  { type: 'pro', hours: 100, price: '$4.99', label: '+100 hours' },
];

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

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

  const handleTopup = async (pkgType: PackageType) => {
    await topup(pkgType);
    if (!useAuthStore.getState().error) {
      onTopup();
    }
  };

  const daysSinceTopup = user?.last_free_topup
    ? Math.floor((Date.now() - new Date(user.last_free_topup).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const freeAvailable = daysSinceTopup === null || daysSinceTopup >= 30;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl border border-zinc-700">
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

        <p className="text-xs text-zinc-500 mb-4">
          +5 hours every 30 days free. Add more hours below.
        </p>

        {daysSinceTopup !== null && !freeAvailable && (
          <p className="text-xs text-yellow-400 mb-4">
            Free topup available in {30 - daysSinceTopup} days
          </p>
        )}

        <div className="space-y-3">
          {PACKAGES.map((pkg) => {
            const isFree = pkg.type === 'free';
            const isDisabled = isFree && !freeAvailable;
            return (
              <button
                key={pkg.type}
                onClick={() => handleTopup(pkg.type)}
                disabled={isLoading || isDisabled}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all
                  ${isFree
                    ? isDisabled
                      ? 'border-zinc-600 bg-zinc-700/30 opacity-50 cursor-not-allowed'
                      : 'border-green-700/50 bg-green-900/20 hover:bg-green-900/30'
                    : 'border-zinc-600 hover:border-purple-500 hover:bg-zinc-700/50'
                  } disabled:opacity-50`}
              >
                <div className="text-left">
                  <div className="font-semibold text-zinc-100">{pkg.label}</div>
                  <div className="text-xs text-zinc-400">{pkg.hours} hours of transcription</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${isFree ? 'text-green-400' : 'text-purple-400'}`}>
                    {pkg.price}
                  </div>
                  {pkg.type !== 'free' && (
                    <div className="text-xs text-zinc-500">TODO: payments</div>
                  )}
                </div>
              </button>
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
