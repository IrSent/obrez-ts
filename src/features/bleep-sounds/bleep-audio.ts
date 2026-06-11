import type { BleepSound } from '../../types';

/**
 * Check if a URL is a remote URL (http/https) rather than a data URL.
 */
export function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Decode an audio source (base64 data URL or remote URL) into an AudioBuffer.
 * Prefers dataUrl if available; falls back to url.
 */
export async function decodeAudio(
  sound: BleepSound,
  context: AudioContext,
): Promise<AudioBuffer> {
  const src = sound.dataUrl || sound.url;
  if (!src) throw new Error('No audio source');

  let arrayBuffer: ArrayBuffer;

  if (src.startsWith('data:')) {
    // base64 data URL
    const binary = atob(src.split(',')[1] || src);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    // remote URL
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  }

  return context.decodeAudioData(arrayBuffer);
}
