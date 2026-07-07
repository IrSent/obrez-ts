import { memo, useState, useCallback } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { exportCensoredVideo } from '../../export';

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Compact export button for the header.
 * Click → export directly (same format as input).
 * Progress bar drops down from the button during export.
 * After done → "File in downloads", click to dismiss.
 */
const HeaderExportButtonInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const exporting = usePlayerStore((state) => state.exporting);
  const progress = usePlayerStore((state) => state.exportProgress);
  const actions = usePlayerActions();
  const { getInput, getAudioTrack, getAudioSink, getVideoTrack } = useMediaPlayerContext();

  const canExport = fileName && (censoringEffects?.length ?? 0) > 0;

  const originalExt = (fileName?.match(/\.[^.]+$/) ?? [])[0]?.toLowerCase() ?? '';
  const originalFormat: 'mp4' | 'webm' =
    ['mp4', 'mov', 'm4v'].includes(originalExt) ? 'mp4' :
    ['webm', 'mkv', 'ogg'].includes(originalExt) ? 'webm' :
    'mp4';

  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setError(null);
    actions.setExporting(true);

    try {
      const input = getInput();
      const audioTrack = getAudioTrack();
      const audioSink = getAudioSink();
      const videoTrack = getVideoTrack();

      if (!input) throw new Error('No media loaded');
      if (!audioTrack) throw new Error('No audio track found');
      if (!audioSink) throw new Error('Audio sink not available');

      const buffer = await exportCensoredVideo(
        input, audioTrack, audioSink, originalFormat,
        videoTrack?.codec ?? null,
        audioTrack.codec ?? null,
      );

      const mimeType = originalFormat === 'mp4' ? 'video/mp4' : 'video/webm';
      const extension = originalFormat;
      const baseName = (fileName || 'video').replace(/\.[^.]+$/, '');

      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_censored.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      console.error('Export error:', err);
    } finally {
      actions.setExportDone();
    }
  }, [fileName, originalFormat, getInput, getAudioTrack, getAudioSink, getVideoTrack, actions]);

  // Determine state: 'idle' | 'exporting' | 'done' | 'error'
  const state = error ? 'error' : progress ? 'exporting' : exporting ? 'done' : 'idle';

  if (!canExport) return null;

  return (
    <div className="relative inline-block">
      {/* Button */}
      <button
        onClick={state === 'idle' ? handleExport : () => {}}
        className={`w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${
          state === 'idle' ? 'hover:bg-zinc-700 text-zinc-300' :
          state === 'exporting' ? 'text-green-400 cursor-default' :
          state === 'done' ? 'text-green-400' :
          'text-red-400'
        }`}
        title="Export Censored Video"
      >
        <DownloadIcon />
      </button>

      {/* Dropdown progress bar */}
      {(state === 'exporting' || state === 'done' || state === 'error') && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-zinc-800 rounded-lg shadow-2xl border border-zinc-700 p-3 z-50">
          {state === 'error' && error ? (
            <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
              {error}
            </div>
          ) : state === 'done' ? (
            <div
              className="text-xs text-green-400 cursor-pointer hover:text-green-300 select-none p-1"
              onClick={() => actions.setExportDone()}
            >
              ✅ File in downloads — click to dismiss
            </div>
          ) : (
            <HeaderExportProgress />
          )}
        </div>
      )}
    </div>
  );
};

export const HeaderExportButton = memo(HeaderExportButtonInner);

/**
 * Progress bar shown inside the dropdown.
 * Reads from store — same as ExportProgressBar but compact.
 */
function HeaderExportProgress() {
  const progress = usePlayerStore((state) => state.exportProgress);
  if (!progress) return null;

  return (
    <div className="space-y-1.5">
      {progress.phases.map((phase) => (
        <div key={phase.key} className="flex items-center gap-2 text-xs">
          <PhaseIcon status={phase.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={`${
                phase.status === 'active' ? 'text-white font-semibold' :
                phase.status === 'done' ? 'text-zinc-300' :
                'text-zinc-500'
              }`}>
                {phase.label}
              </span>
              {(phase.status === 'active' || phase.status === 'done') && phase.pct > 0 && (
                <span className="text-zinc-400 tabular-nums">{phase.pct}%</span>
              )}
            </div>
            {phase.status === 'active' && phase.detail && (
              <div className="text-[10px] text-zinc-500 truncate">{phase.detail}</div>
            )}
          </div>
          {phase.status === 'active' && (
            <div className="w-8 bg-zinc-700 rounded-full h-1 overflow-hidden shrink-0">
              <div className="bg-green-400 h-1 rounded-full transition-all duration-200"
                   style={{ width: `${phase.pct}%` }} />
            </div>
          )}
        </div>
      ))}
      <div className="text-[10px] text-zinc-500 pt-0.5 border-t border-zinc-700/50">
        Elapsed: {progress.elapsed.toFixed(1)}s
      </div>
    </div>
  );
}

function PhaseIcon({ status }: { status: 'active' | 'done' | 'pending' }) {
  if (status === 'done') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (status === 'active') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-yellow-400 animate-spin">
        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-600">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
