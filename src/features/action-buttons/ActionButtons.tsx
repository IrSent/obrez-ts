import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { exportCensoredVideo } from '../../export';
import { canFreeTopup } from '../../utils/auth';
import { saveSession } from '../../utils/idb';
import { LoginModal } from '../auth/LoginModal';
import { TopupModal } from '../auth/TopupModal';
import { ConfirmationModal } from '../auth/ConfirmationModal';

const AUTOPLAY_KEY = 'obrez_play_on_load';

// ─── Icons ─────────────────────────────────────────────────────

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const UrlIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const TranscribeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path d="M19 10v2a7 7 0 01-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const UnloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

// ─── Codec helpers ─────────────────────────────────────────────

const CODEC_LABELS: Record<string, string> = {
  avc: 'H.264', hevc: 'H.265', vp8: 'VP8', vp9: 'VP9', av1: 'AV1',
  aac: 'AAC', opus: 'Opus', vorbis: 'Vorbis', mp3: 'MP3',
};

function codecLabel(raw: string | null | undefined): string {
  return CODEC_LABELS[raw ?? ''] ?? (raw ?? '?');
}

type ExportFormat = 'same' | 'mp4' | 'webm';

// ─── ActionButtons ─────────────────────────────────────────────

const ActionButtonsInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const duration = usePlayerStore((state) => state.duration);
  const transcribing = usePlayerStore((state) => state.transcribing);
  const actions = playerActions;
  const { initMediaPlayer, play, transcribe, getInput, getAudioTrack, getAudioSink, getVideoTrack } = useMediaPlayerContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasFile = !!fileName;
  const hasTranscription = !!(transcriptionResults && transcriptionResults.length > 0);

  // ─── File loading ────────────────────────────────────────────

  const shouldAutoplay = () => localStorage.getItem(AUTOPLAY_KEY) === 'true';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    actions.setFileName(file.name);
    actions.setError(null);
    actions.setWarning(null);
    actions.setTranscriptionResults(null);
    actions.setTranscribing(false);
    actions.setCensoringEffects([]);

    await saveSession({
      fileName: file.name,
      fileBlob: file,
      transcriptionResults: null,
      censoringEffects: null,
      duration: null,
      authModal: null,
      wasTranscribing: false,
    });

    try {
      await initMediaPlayer(file);
      if (shouldAutoplay()) {
        await new Promise((r) => setTimeout(r, 1000));
        await play();
      }
    } catch (error) {
      actions.setError('Failed to load file: ' + (error as Error).message);
    }
  };

  const handleUrlClick = async () => {
    const url = prompt(
      'Please enter a URL of a media file. Note that it must be HTTPS and support cross-origin requests, so have the right CORS headers set.',
      'https://remotion.media/BigBuckBunny.mp4',
    );
    if (!url) return;

    actions.setFileName(url);
    actions.setError(null);
    actions.setWarning(null);
    actions.setTranscriptionResults(null);
    actions.setTranscribing(false);
    actions.setCensoringEffects([]);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await saveSession({
        fileName: url,
        fileBlob: blob,
        transcriptionResults: null,
        censoringEffects: null,
        duration: null,
        authModal: null,
        wasTranscribing: false,
      });
      const file = new File([blob], url.split('/').pop() || 'video', { type: blob.type });
      await initMediaPlayer(file);
      if (shouldAutoplay()) {
        await new Promise((r) => setTimeout(r, 1000));
        await play();
      }
    } catch (error) {
      saveSession({ fileBlob: null });
      actions.setError('Failed to load URL: ' + (error as Error).message);
    }
  };

  // ─── Unload ──────────────────────────────────────────────────

  const handleUnload = async () => {
    actions.setFileName('');
    actions.setError(null);
    actions.setWarning(null);
    actions.setIsEnded(false);
    actions.setTranscriptionResults(null);
    actions.setTranscribing(false);
    actions.setCensoringEffects([]);
    actions.setDuration(0);

    try {
      const { clearSession } = await import('../../utils/idb');
      await clearSession();
    } catch {}

    const canvas = document.getElementById('videoCanvas') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // ─── Transcribe with auth flow ───────────────────────────────

  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'topup' | 'confirm' | null>(null);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const authModalRetryRef = useRef<(() => Promise<void>) | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authError = useAuthStore((s) => s.error);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const clearAuthError = useAuthStore((s) => s.clearError);

  const _handleTranscribe = async () => {
    // 1. Check auth (retry up to 3 times — localtunnel can be flaky)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await checkAuth();
        break;
      } catch { /* ignore */ }
      const lastErr = useAuthStore.getState().error;
      if (!lastErr) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    const authErr = useAuthStore.getState().error;
    if (authErr) {
      setAuthModalError(authErr);
      authModalRetryRef.current = async () => {
        setAuthModal(null);
        _handleTranscribe();
      };
      setAuthModal('login');
      return;
    }

    const user = useAuthStore.getState().user;
    if (!user) {
      // Not logged in — save session
      const censoringEffects = usePlayerStore.getState().censoringEffects;
      await saveSession({
        authModal: 'login',
        transcriptionResults,
        censoringEffects: censoringEffects ?? null,
        duration,
        wasTranscribing: transcribing,
      });
      setAuthModalError(null);
      authModalRetryRef.current = null;
      setAuthModal('login');
      return;
    }

    // 2. Check if topup needed
    const freeAvailable = canFreeTopup(user.last_free_topup);
    const balanceInsufficient = duration > user.remaining_seconds;
    if (freeAvailable || balanceInsufficient) {
      setAuthModal('topup');
      return;
    }

    // 3. Show confirmation
    setAuthModal('confirm');
  };

  // React to login: when user gets authenticated, proceed
  useEffect(() => {
    if ((authModal === 'login' || authModal === 'confirm') && isAuthenticated && !authError) {
      const user = useAuthStore.getState().user;
      if (user) {
        const freeAvailable = canFreeTopup(user.last_free_topup);
        const balanceInsufficient = duration > user.remaining_seconds;
        if (freeAvailable || balanceInsufficient) {
          setAuthModal('topup');
        } else {
          setAuthModal('confirm');
        }
      }
    }
  }, [isAuthenticated, authModal, authError, duration]);

  const handleConfirmTranscribe = async () => {
    setAuthModal(null);
    setTranscribeLoading(true);
    try {
      await transcribe();
      setTranscribeLoading(false);
      await checkAuth();
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('402') || msg.includes('quota')) {
        setAuthModal('topup');
      } else {
        actions.setError('Failed to transcribe: ' + msg);
      }
      setTranscribeLoading(false);
    }
  };

  // ─── Export ──────────────────────────────────────────────────

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('same');
  const [exportError, setExportError] = useState<string | null>(null);
  const exporting = usePlayerStore((state) => state.exporting);
  const exportProgress = usePlayerStore((state) => state.exportProgress);

  const originalExt = (fileName?.match(/\.[^.]+$/) ?? [])[0]?.toLowerCase() ?? '';
  const originalFormat: 'mp4' | 'webm' =
    ['mp4', 'mov', 'm4v'].includes(originalExt) ? 'mp4' :
    ['webm', 'mkv', 'ogg'].includes(originalExt) ? 'webm' :
    'mp4';

  const videoCodec = getVideoTrack()?.codec ?? null;
  const audioCodec = getAudioTrack()?.codec ?? null;
  const altFormat: 'mp4' | 'webm' = originalFormat === 'mp4' ? 'webm' : 'mp4';
  const altVidCodec = altFormat === 'mp4' ? 'avc' : 'vp9';
  const altAudCodec = altFormat === 'mp4' ? 'aac' : 'opus';

  const handleExport = useCallback(async () => {
    setExportError(null);
    actions.setExporting(true);

    try {
      const input = getInput();
      const audioTrack = getAudioTrack();
      const audioSink = getAudioSink();
      const videoTrack = getVideoTrack();

      if (!input) throw new Error('No media loaded');
      if (!audioTrack) throw new Error('No audio track found');
      if (!audioSink) throw new Error('Audio sink not available');

      const targetFormat: 'mp4' | 'webm' = exportFormat === 'same' ? originalFormat : exportFormat;

      const buffer = await exportCensoredVideo(
        input, audioTrack, audioSink, targetFormat,
        videoTrack?.codec ?? null,
        audioTrack.codec ?? null,
      );

      const mimeType = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';
      const baseName = (fileName || 'video').replace(/\.[^.]+$/, '');

      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_censored.${targetFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      actions.setExportDone();
    }
  }, [exportFormat, fileName, originalFormat, actions, getInput, getAudioTrack, getAudioSink, getVideoTrack]);

  return (
    <div className="relative bg-zinc-800 rounded-xl p-4 space-y-2 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none" />
      {/* Load File — only when no file */}
      {!hasFile && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-2 rounded transition-colors"
          >
            <FileIcon /> Load File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,video/x-matroska,video/mp2t,.ts,audio/*,audio/aac"
            onChange={handleFileChange}
            className="hidden"
          />
        </>
      )}

      {/* Load URL — only when no file */}
      {!hasFile && (
        <button
          onClick={handleUrlClick}
          className="w-full flex items-center gap-2 text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-2 rounded transition-colors"
        >
          <UrlIcon /> Load URL
        </button>
      )}

      {/* Unload — only when file is loaded */}
      {hasFile && (
        <button
          onClick={handleUnload}
          className="w-full flex items-center gap-2 text-xs font-semibold bg-red-900/40 hover:bg-red-800/50 text-red-300 px-3 py-2 rounded transition-colors border border-red-800/30"
        >
          <UnloadIcon /> Unload
        </button>
      )}

      {/* Transcribe — only when file is loaded */}
      {hasFile && (
        <button
          onClick={_handleTranscribe}
          className="w-full flex items-center gap-2 text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white px-3 py-2 rounded transition-colors"
        >
          <TranscribeIcon /> Transcribe
        </button>
      )}

      {/* Export — only when there's transcription data */}
      {hasTranscription && (
        <button
          onClick={() => {
            setExportError(null);
            setShowExportModal(true);
          }}
          className="w-full flex items-center gap-2 text-xs font-semibold bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded transition-colors"
        >
          <DownloadIcon /> Export
        </button>
      )}

      {/* Export error */}
      {exportError && (
        <div className="text-xs text-red-400 p-2 bg-red-900/20 rounded">
          {exportError}
        </div>
      )}

      {/* Export progress */}
      {exporting && exportProgress && (
        <div className="space-y-1">
          {exportProgress.phases.map((phase) => (
            <div key={phase.key} className="flex items-center gap-2 text-xs">
              <span className={
                phase.status === 'done' ? 'text-green-400' :
                phase.status === 'active' ? 'text-yellow-400' :
                'text-zinc-600'
              }>
                {phase.status === 'done' ? '✓' : phase.status === 'active' ? '⟳' : '○'}
              </span>
              <span className={`flex-1 min-w-0 ${
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
          ))}
          <div className="text-[10px] text-zinc-500 pt-0.5 border-t border-zinc-700/50">
            Elapsed: {exportProgress.elapsed.toFixed(1)}s
          </div>
        </div>
      )}

      {/* ─── Modals ─── */}

      {/* Auth modals for transcribe */}
      {authModal === 'login' && (
        <LoginModal
          onClose={() => setAuthModal(null)}
          onRetry={authModalRetryRef.current ?? undefined}
          initialError={authModalError}
        />
      )}
      {authModal === 'topup' && (
        <TopupModal
          onClose={() => {
            setAuthModal(null);
            clearAuthError();
          }}
          onTopup={async () => {
            await checkAuth();
            setAuthModal('confirm');
          }}
        />
      )}
      {authModal === 'confirm' && (
        <ConfirmationModal
          videoDuration={duration}
          onClose={() => setAuthModal(null)}
          onConfirm={handleConfirmTranscribe}
          onLogout={async () => {
            await useAuthStore.getState().logout();
            setAuthModal(null);
          }}
        />
      )}

      {/* Export modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative bg-zinc-800 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
            <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <DownloadIcon /> Export Video
              </h3>
              <button onClick={() => setShowExportModal(false)} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
                <CloseIcon />
              </button>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Format</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('same')}
                  className={`flex-1 text-xs py-2 px-2 rounded font-semibold transition-colors ${
                    exportFormat === 'same' ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {videoCodec && audioCodec
                    ? `Same (${codecLabel(videoCodec)} + ${codecLabel(audioCodec)})`
                    : 'Same as input'}
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat(altFormat)}
                  className={`flex-1 text-xs py-2 px-2 rounded font-semibold transition-colors ${
                    exportFormat === altFormat ? 'bg-green-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  <span>.{altFormat.toUpperCase()}</span>
                  <span className="text-[9px] opacity-70 block">{codecLabel(altVidCodec)} + {codecLabel(altAudCodec)}</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => { handleExport(); setShowExportModal(false); }}
              className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-semibold py-2 rounded transition-colors flex items-center justify-center gap-2"
            >
              <DownloadIcon /> Export
            </button>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Video will be re-encoded with censored audio.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const ActionButtons = memo(ActionButtonsInner);
