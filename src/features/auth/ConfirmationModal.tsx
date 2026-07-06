import { useAuthStore } from '../../store/authStore';

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface ConfirmationModalProps {
  videoDuration: number;
  onClose: () => void;
  onConfirm: () => void;
  onLogout: () => void;
}

export function ConfirmationModal({ videoDuration, onClose, onConfirm, onLogout }: ConfirmationModalProps) {
  const user = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.user);
  const logout = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.logout);

  if (!user) return null;

  const remainingAfter = Math.max(0, user.remaining_seconds - videoDuration);
  const displayName = user.username ? `@${user.username}` : user.first_name;

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Confirm transcription</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Auth indicator */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-zinc-700/50 rounded-lg">
          {user.photo_url ? (
            <img
              src={user.photo_url}
              alt={user.first_name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-lg font-semibold">
              {user.first_name.charAt(0)}
            </div>
          )}
          <div className="text-sm flex-1 min-w-0">
            <div className="text-zinc-100 font-medium truncate">{displayName}</div>
            <div className="text-zinc-400">Signed in via Telegram</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-zinc-500 hover:text-red-400 transition-colors whitespace-nowrap"
            title="Sign out"
          >
            Sign out
          </button>
        </div>

        {/* Balance info */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Video duration</span>
            <span className="text-zinc-200 font-semibold">{formatDuration(videoDuration)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Current balance</span>
            <span className="text-purple-400 font-semibold">{formatDuration(user.remaining_seconds)}</span>
          </div>
          <div className="flex justify-between text-sm border-t border-zinc-700 pt-2">
            <span className="text-zinc-400">After transcription</span>
            <span className="font-semibold text-zinc-200">
              {formatDuration(remainingAfter)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
          >
            Transcribe
          </button>
        </div>
      </div>
    </div>
  );
}
