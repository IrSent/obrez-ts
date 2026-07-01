import { memo } from 'react';
import { usePlayerStore } from '../../store/playerStore';

/**
 * Modal overlay showing import progress.
 * Standalone component — subscribes only to importing + importStage,
 * so it doesn't re-render the main TranscriptionResults during import.
 */
function ImportProgressModalInner() {
  const importing = usePlayerStore((state) => state.importing);
  const importStage = usePlayerStore((state) => state.importStage);

  if (!importing || !importStage) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Importing JSON</h3>
        <div className="space-y-1">
          <div className="text-xs text-zinc-400">{importStage}</div>
          <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
            <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export const ImportProgressModal = memo(ImportProgressModalInner);
