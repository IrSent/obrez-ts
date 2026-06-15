import { memo, useState, useCallback } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { exportCensoredVideo } from '../../export';

/**
 * Icon: close (X)
 */
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Icon: download
 */
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Progress bar component reused from TranscriptionResults styling.
 */
function ExportProgressBar({ stage }: { stage: string }) {
  const pctMatch = stage.match(/\b(\d+)%\b/);
  const pct = pctMatch ? parseInt(pctMatch[1], 10) : null;
  const label = pct != null ? stage.replace(/\s*·?\s*\d+%\s*/g, '').trim() : stage;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-zinc-400">
        <span>{label}</span>
        {pct != null && <span>{pct}%</span>}
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`bg-green-500 h-1.5 rounded-full transition-all duration-200 ${pct == null ? 'animate-pulse' : ''}`}
          style={{ width: pct != null ? `${pct}%` : '100%' }}
        />
      </div>
    </div>
  );
}

/**
 * Human-readable codec labels.
 */
const CODEC_LABELS: Record<string, string> = {
  avc: 'H.264',
  hevc: 'H.265',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  aac: 'AAC',
  opus: 'Opus',
  vorbis: 'Vorbis',
  mp3: 'MP3',
};

function codecLabel(raw: string | null | undefined): string {
  return CODEC_LABELS[raw ?? ''] ?? (raw ?? '?');
}

type ExportFormat = 'same' | 'mp4' | 'webm';

/**
 * Modal for choosing export format.
 * Does NOT hold export state — that lives in ExportButtonInner so closing
 * the modal does not cancel the export.
 */
interface ExportModalProps {
  format: ExportFormat;
  onFormatChange: (f: ExportFormat) => void;
  onExport: () => void;
  onClose: () => void;
  videoCodec: string | null;
  audioCodec: string | null;
  originalFormat: 'mp4' | 'webm';
}

const ExportModal = memo(({ format, onFormatChange, onExport, onClose, videoCodec, audioCodec, originalFormat }: ExportModalProps) => {
  const sameLabel = videoCodec && audioCodec
    ? `Same as input (${codecLabel(videoCodec)} + ${codecLabel(audioCodec)})`
    : 'Same as input';

  const altFormat: 'mp4' | 'webm' = originalFormat === 'mp4' ? 'webm' : 'mp4';
  const altVidCodec = altFormat === 'mp4' ? 'avc' : 'vp9';
  const altAudCodec = altFormat === 'mp4' ? 'aac' : 'opus';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DownloadIcon /> Export Video
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
            <CloseIcon />
          </button>
        </div>

        {/* Format selection */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1.5">Format</label>
          <div className="flex gap-2">
            {/* Same as input */}
            <button
              type="button"
              onClick={() => onFormatChange('same')}
              className={`flex-1 text-xs py-2 px-2 rounded font-semibold transition-colors flex flex-col items-center gap-0.5 ${
                format === 'same'
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              <span>{sameLabel}</span>
            </button>

            {/* Alternate format */}
            <button
              type="button"
              onClick={() => onFormatChange(altFormat)}
              className={`flex-1 text-xs py-2 px-2 rounded font-semibold transition-colors flex flex-col items-center gap-0.5 ${
                format === altFormat
                  ? 'bg-green-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              <span>.{altFormat.toUpperCase()}</span>
              <span className="text-[9px] opacity-70">{codecLabel(altVidCodec)} + {codecLabel(altAudCodec)}</span>
            </button>
          </div>
        </div>

        {/* Export button inside modal */}
        <button
          onClick={() => { onExport(); onClose(); }}
          className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-semibold py-2 rounded transition-colors flex items-center justify-center gap-2"
        >
          <DownloadIcon />
          Export
        </button>

        {/* Note */}
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Video will be re-encoded with censored audio (bleep sounds + dampening).
          Original video quality may vary depending on browser codec support.
        </p>
      </div>
    </div>
  );
});

/**
 * Export button shown in the sidebar.
 * Holds all export state — closing the modal does not cancel the export.
 * Progress bar is visible in this sidebar block even after modal is dismissed.
 */
const ExportButtonInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const exportStage = usePlayerStore((state) => state.exportStage);
  const exporting = usePlayerStore((state) => state.exporting);
  const actions = usePlayerActions();
  const { getInput, getAudioTrack, getAudioSink, getVideoTrack } = useMediaPlayerContext();

  const [showModal, setShowModal] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('same');
  const [error, setError] = useState<string | null>(null);

  const canExport = fileName && (censoringEffects?.length ?? 0) > 0;

  // Detect original format from file extension
  const originalExt = (fileName?.match(/\.[^.]+$/) ?? [])[0]?.toLowerCase() ?? '';
  const originalFormat: 'mp4' | 'webm' =
    ['mp4', 'mov', 'm4v'].includes(originalExt) ? 'mp4' :
    ['webm', 'mkv', 'ogg'].includes(originalExt) ? 'webm' :
    'mp4';

  const videoTrack = getVideoTrack();
  const audioTrack = getAudioTrack();

  const handleExport = useCallback(async () => {
    setError(null);
    actions.setExporting(true);

    try {
      const input = getInput();
      const audioTrack = getAudioTrack();
      const videoTrack = getVideoTrack();
      const audioSink = getAudioSink();

      if (!input) throw new Error('No media loaded');
      if (!audioTrack) throw new Error('No audio track found');
      if (!audioSink) throw new Error('Audio sink not available');

      const targetFormat: 'mp4' | 'webm' = format === 'same' ? originalFormat : format;
      const preferOriginal = format === 'same';

      const buffer = await exportCensoredVideo(
        input, audioTrack, audioSink, targetFormat,
        preferOriginal ? (videoTrack?.codec ?? null) : null,
        preferOriginal ? (audioTrack.codec ?? null) : null,
      );

      const mimeType = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';
      const extension = targetFormat === 'mp4' ? 'mp4' : 'webm';
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
  }, [format, fileName, getInput, getAudioTrack, getAudioSink, getVideoTrack, actions, originalFormat]);

  return canExport ? (
    <>
      <div className="bg-zinc-800 rounded-lg p-4 space-y-3">
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded transition-colors"
        >
          <DownloadIcon />
          Export Censored Video
        </button>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 p-2 bg-red-900/20 rounded">
            {error}
          </div>
        )}

        {/* Progress bar visible even when modal is closed */}
        {exporting && exportStage && (
          <ExportProgressBar stage={exportStage} />
        )}
      </div>

      {showModal && (
        <ExportModal
          format={format}
          onFormatChange={setFormat}
          onExport={handleExport}
          onClose={() => setShowModal(false)}
          originalFormat={originalFormat}
          videoCodec={videoTrack?.codec ?? null}
          audioCodec={audioTrack?.codec ?? null}
        />
      )}
    </>
  ) : null;
};

export const ExportButton = memo(ExportButtonInner);
