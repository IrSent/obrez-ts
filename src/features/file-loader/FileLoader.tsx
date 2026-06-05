import { useRef } from 'react';
import { usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

export const FileLoader = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const actions = usePlayerActions();
  const { initMediaPlayer } = useMediaPlayerContext();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    actions.setFileName(file.name);
    actions.setError(null);
    actions.setWarning(null);
    actions.setTranscriptionResults(null);
    actions.setTranscribing(false);
    actions.setCensoringEffects(null);

    try {
      await initMediaPlayer(file);
    } catch (error) {
      console.error('Error loading file:', error);
      actions.setError('Failed to load file: ' + (error as Error).message);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleUrlClick = () => {
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
    actions.setCensoringEffects(null);

    initMediaPlayer(url);
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
