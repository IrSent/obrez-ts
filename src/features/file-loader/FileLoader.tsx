import { useRef } from 'react';
import { usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { saveSession } from '../../utils/idb';

const AUTOPLAY_KEY = 'obrez_play_on_load';

export const FileLoader = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const actions = usePlayerActions();
  const { initMediaPlayer, play } = useMediaPlayerContext();

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

    // Persist file to IndexedDB for OIDC redirect resilience
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
        // Brief pause for audio context warmup after init
        await new Promise((r) => setTimeout(r, 1000));
        await play();
      }
    } catch (error) {
      console.error('Error loading file:', error);
      actions.setError('Failed to load file: ' + (error as Error).message);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleUrlClick = async () => {
    const url = prompt(
      'Please enter a URL of a media file. Note that it must be HTTPS and support cross-origin requests, so have the right CORS headers set.',
      'https://remotion.media/BigBuckBunny.mp4'
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
      await initMediaPlayer(blob);
      if (shouldAutoplay()) {
        await new Promise((r) => setTimeout(r, 1000));
        await play();
      }
    } catch (error) {
      saveSession({ fileBlob: null });
      console.error('Error loading URL:', error);
      actions.setError('Failed to load URL: ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={handleFileClick}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg transition-colors"
        >
          Load File
        </button>
        <button
          onClick={handleUrlClick}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg transition-colors"
        >
          Load URL
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,video/x-matroska,video/mp2t,.ts,audio/*,audio/aac"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
