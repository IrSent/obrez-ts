import { memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { cdBtn } from '../player/cdBtn';
import { LoginModal } from '../auth/LoginModal';
import { TopupModal } from '../auth/TopupModal';
import { ConfirmationModal } from '../auth/ConfirmationModal';
import { useActionButtons, codecLabel } from './useActionButtons';

// ─── CSS media-query visibility helpers ────────────────────────
// Mobile landscape = landscape orientation with small width (phone turned sideways)
const panelStyle: React.CSSProperties = {
  '@media (orientation: landscape) and (max-width: 850px)': 'display: none',
};
const rowStyle: React.CSSProperties = {
  display: 'none',
  '@media (orientation: landscape) and (max-width: 850px)': 'display: block',
};

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
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

// ─── Compact icon button (mobile landscape) ────────────────────

const CompactIcon = ({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center rounded p-1.5 ${
      disabled
        ? 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed'
        : 'bg-zinc-700 text-zinc-200 active:bg-zinc-600'
    }`}
    disabled={disabled}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);

// ─── ActionButtons ─────────────────────────────────────────────
// Full panel shown on desktop / portrait. Compact icon row shown on
// mobile landscape (via CSS media queries). Modals always render
// via portal regardless of which UI variant is visible.

const ActionButtonsInner = () => {
  const {
    hasFile,
    hasTranscription,
    fileName,
    duration,
    exporting,
    exportProgress,
    exportFormat,
    exportError,
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
    fileInputRef,
    authModalRetryRef,
    handleFileChange,
    handleUrlClick,
    triggerFileInput,
    handleUnload,
    confirmUnload,
    setShowUnloadConfirm,
    _handleTranscribe,
    setAuthModal,
    handleConfirmTranscribe,
    clearAuthError,
    checkAuth,
    handleExport,
    setShowExportModal,
    setExportFormat,
    setExportError,
  } = useActionButtons();

  return (
    <>
      {/* ─── Full panel — visible on desktop / portrait ─── */}
      <div style={panelStyle}>
        <div className="relative bg-zinc-800 rounded-xl p-4 space-y-2 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
          {/* 3D inner bevel highlight */}
          <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none" />
          {/* Load File */}
          <button
            onClick={triggerFileInput}
            className={`${cdBtn} w-full flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded ${hasFile ? 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
            disabled={hasFile}
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

          {/* Load URL */}
          <button
            onClick={handleUrlClick}
            className={`${cdBtn} w-full flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded ${hasFile ? 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'}`}
            disabled={hasFile}
          >
            <UrlIcon /> Load URL
          </button>

          {/* Unload */}
          <button
            onClick={handleUnload}
            className={`${cdBtn} w-full flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded ${hasFile ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' : 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed'}`}
            disabled={!hasFile}
          >
            <UnloadIcon /> Unload
          </button>

          {/* Transcribe */}
          <button
            onClick={_handleTranscribe}
            className={`${cdBtn} w-full flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded ${hasFile ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' : 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed'}`}
            disabled={!hasFile}
          >
            <TranscribeIcon /> Transcribe
          </button>

          {/* Export */}
          <button
            onClick={() => {
              setExportError(null);
              setShowExportModal(true);
            }}
            className={`${cdBtn} w-full flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded ${hasTranscription ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200' : 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed'}`}
            disabled={!hasTranscription}
          >
            <DownloadIcon /> Export
          </button>

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
        </div>
      </div>

      {/* ─── Compact icon row — visible on mobile landscape ─── */}
      <div style={rowStyle}>
        <div className="flex items-center gap-1.5 bg-zinc-800/80 backdrop-blur-sm rounded-lg px-2 py-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,video/x-matroska,video/mp2t,.ts,audio/*,audio/aac"
            onChange={handleFileChange}
            className="hidden"
          />
          <CompactIcon icon={<FileIcon />} label="Load File" disabled={hasFile} onClick={triggerFileInput} />
          <CompactIcon icon={<UrlIcon />} label="Load URL" disabled={hasFile} onClick={handleUrlClick} />
          <CompactIcon icon={<UnloadIcon />} label="Unload" disabled={!hasFile} onClick={handleUnload} />
          <CompactIcon icon={<TranscribeIcon />} label="Transcribe" disabled={!hasFile} onClick={_handleTranscribe} />
          <CompactIcon icon={<DownloadIcon />} label="Export" disabled={!hasTranscription} onClick={() => { setExportError(null); setShowExportModal(true); }} />

          {/* Export progress indicator in compact row */}
          {exporting && exportProgress && (
            <span className="text-[9px] text-yellow-400 tabular-nums ml-1">
              ⟳ {exportProgress.phases.find((p: {status: string}) => p.status === 'active')?.pct ?? 0}%
            </span>
          )}
        </div>
      </div>

      {/* ─── Modals — rendered via Portal to escape PlayerDisplay overflow-hidden ─── */}

      {(authModalPending || authModal || showExportModal || showUnloadConfirm) && createPortal(
        <>
          {authModalPending && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
            </div>
          )}
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

          {showExportModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="relative bg-zinc-800 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
                <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <DownloadIcon /> Export Video
                  </h3>
                  <button onClick={() => setShowExportModal(false)} className={`${cdBtn} p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400`}>
                    <CloseIcon />
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Format</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExportFormat('same')}
                      className={`${cdBtn} flex-1 text-xs py-2 px-2 rounded font-semibold ${
                        exportFormat === 'same' ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      {videoCodec && audioCodec
                        ? `Same (${codecLabel(videoCodec)} + ${codecLabel(audioCodec)})`
                        : 'Same as input'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat(altFormat)}
                      className={`${cdBtn} flex-1 text-xs py-2 px-2 rounded font-semibold ${
                        exportFormat === altFormat ? 'bg-zinc-600 text-zinc-100' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                    >
                      <span>.{altFormat.toUpperCase()}</span>
                      <span className="text-[9px] opacity-70 block">{codecLabel(altVidCodec)} + {codecLabel(altAudCodec)}</span>
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { handleExport(); setShowExportModal(false); }}
                  className={`${cdBtn} w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold py-2 rounded flex items-center justify-center gap-2`}
                >
                  <DownloadIcon /> Export
                </button>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Video will be re-encoded with censored audio.
                </p>
              </div>
            </div>
          )}

          {showUnloadConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="relative bg-zinc-800 rounded-xl p-5 w-full max-w-sm space-y-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
                <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <UnloadIcon /> Unload File
                  </h3>
                  <button onClick={() => setShowUnloadConfirm(false)} className={`${cdBtn} p-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400`}>
                    <CloseIcon />
                  </button>
                </div>
                <p className="text-xs text-zinc-300">
                  Transcription is saved to IndexedDB. Export JSON before unloading?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowUnloadConfirm(false);
                      const exportBtn = document.querySelector('[data-testid="export-json"]');
                      if (exportBtn) (exportBtn as HTMLElement).click();
                    }}
                    className={`${cdBtn} flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold py-2 rounded flex items-center justify-center gap-2`}
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={confirmUnload}
                    className={`${cdBtn} flex-1 bg-red-800 hover:bg-red-700 text-white text-xs font-semibold py-2 rounded flex items-center justify-center gap-2`}
                  >
                    <UnloadIcon /> Unload
                  </button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
};

export const ActionButtons = memo(ActionButtonsInner);
