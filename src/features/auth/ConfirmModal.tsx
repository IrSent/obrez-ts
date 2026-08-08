import ReactDOM from 'react-dom';

const MODAL_SHADOW = 'shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]';

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmStyle?: 'red' | 'purple';
  onClose: () => void;
}

/**
 * Generic confirmation modal — used for delete actions, overwrites, etc.
 * Rendered via Portal to avoid overflow clipping.
 */
export function ConfirmModal({
  title,
  message,
  onConfirm,
  confirmLabel = 'Delete',
  confirmStyle = 'red',
  onClose,
}: ConfirmModalProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const confirmBg = confirmStyle === 'red'
    ? 'bg-red-700 hover:bg-red-600 text-white'
    : 'bg-purple-600 hover:bg-purple-500 text-white';

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`relative bg-zinc-800 rounded-xl p-5 w-full max-w-sm space-y-4 ${MODAL_SHADOW}`}>
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 rounded p-1 transition-colors"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <p className="text-xs text-zinc-300">{message}</p>
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded ${confirmBg} transition-colors`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
