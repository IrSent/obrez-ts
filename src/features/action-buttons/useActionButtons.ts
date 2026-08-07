import { useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { exportCensoredVideo } from '../../export';
import { canFreeTopup } from '../../utils/auth';
import { saveSession } from '../../utils/idb';

type ExportFormat = 'same' | 'mp4' | 'webm';

/**
 * All ActionButtons logic extracted into a hook so both the full panel
 * (desktop / portrait) and the compact icon row (mobile landscape)
 * share the same state and handlers.
 */
export function useActionButtons() {
  const fileName = usePlayerStore((s) => s.fileName);
  const transcriptionResults = usePlayerStore((s) => s.transcriptionResults);
  const duration = usePlayerStore((s) => s.duration);
  const transcribing = usePlayerStore((s) => s.transcribing);
  const exporting = usePlayerStore((s) => s.exporting);
  const exportProgress = usePlayerStore((s) => s.exportProgress);
  const actions = playerActions;
  const {
    initMediaPlayer,
    cleanup,
    transcribe,
    getInput,
    getAudioTrack,
    getAudioSink,
    getVideoTrack,
  } = useMediaPlayerContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasFile = !!fileName;
  const hasTranscription = !!(transcriptionResults && transcriptionResults.length > 0);

  // ─── File loading ────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    actions.setFileName(file.name);
    actions.setFileSize(file.size);
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
      actions.setFileSize(blob.size);
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
    } catch (error) {
      saveSession({ fileBlob: null });
      actions.setError('Failed to load URL: ' + (error as Error).message);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  // ─── Unload ──────────────────────────────────────────────────

  const [showUnloadConfirm, setShowUnloadConfirm] = useState(false);

  const confirmUnload = async () => {
    setShowUnloadConfirm(false);

    actions.setFileName('');
    actions.setFileSize(0);
    actions.setError(null);
    actions.setWarning(null);
    actions.setIsEnded(false);
    actions.setTranscriptionResults(null);
    actions.setTranscribing(false);
    actions.setCensoringEffects([]);
    actions.setCurrentTime(0);
    actions.setDuration(0);

    await cleanup();

    try {
      const { clearSession } = await import('../../utils/idb');
      await clearSession();
    } catch (err) {
      console.error('Failed to clear session:', err);
    }
  };

  const handleUnload = () => {
    if (hasTranscription) {
      setShowUnloadConfirm(true);
    } else {
      confirmUnload();
    }
  };

  // ─── Transcribe with auth flow ───────────────────────────────

  const [transcribeLoading, setTranscribeLoading] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'topup' | 'confirm' | null>(null);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const [authModalPending, setAuthModalPending] = useState(false);
  const authModalRetryRef = useRef<(() => Promise<void>) | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authError = useAuthStore((s) => s.error);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const clearAuthError = useAuthStore((s) => s.clearError);

  const _handleTranscribe = async () => {
    setAuthModalPending(true);
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
      setAuthModalPending(false);
      return;
    }

    const user = useAuthStore.getState().user;
    if (!user) {
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
      setAuthModalPending(false);
      return;
    }

    const freeAvailable = canFreeTopup(user.last_free_topup);
    const balanceInsufficient = duration > user.remaining_seconds;
    if (freeAvailable || balanceInsufficient) {
      setAuthModal('topup');
      setAuthModalPending(false);
      return;
    }

    setAuthModal('confirm');
    setAuthModalPending(false);
  };

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

      if (!input) throw new Error('No media loaded');
      if (!audioTrack) throw new Error('No audio track found');
      if (!audioSink) throw new Error('Audio sink not available');

      const targetFormat: 'mp4' | 'webm' = exportFormat === 'same' ? originalFormat : exportFormat;

      const buffer = await exportCensoredVideo(
        input, audioTrack, audioSink, targetFormat,
        videoCodec ?? null,
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
  }, [exportFormat, fileName, originalFormat, actions, getInput, getAudioTrack, getAudioSink, getVideoTrack, videoCodec, audioCodec]);

  return {
    // State
    hasFile,
    hasTranscription,
    fileName,
    duration,
    exporting,
    exportProgress,
    exportFormat,
    exportError,
    originalFormat,
    altFormat,
    altVidCodec,
    altAudCodec,
    videoCodec,
    audioCodec,
    authModal,
    authModalError,
    authModalPending,
    showExportModal,
    showUnloadConfirm,

    // Refs
    fileInputRef,
    authModalRetryRef,

    // File handlers
    handleFileChange,
    handleUrlClick,
    triggerFileInput,

    // Unload handlers
    handleUnload,
    confirmUnload,
    setShowUnloadConfirm,

    // Auth handlers
    _handleTranscribe,
    setAuthModal,
    handleConfirmTranscribe,
    clearAuthError,
    checkAuth,

    // Export handlers
    handleExport,
    setShowExportModal,
    setExportFormat,
    setExportError,
  };
}

// ─── Shared codec helpers ──────────────────────────────────────

const CODEC_LABELS: Record<string, string> = {
  avc: 'H.264', hevc: 'H.265', vp8: 'VP8', vp9: 'VP9', av1: 'AV1',
  aac: 'AAC', opus: 'Opus', vorbis: 'Vorbis', mp3: 'MP3',
};

export function codecLabel(raw: string | null | undefined): string {
  return CODEC_LABELS[raw ?? ''] ?? (raw ?? '?');
}
