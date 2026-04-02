function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export function audioBuffersToWav(chunks: AudioBuffer[], sampleRate: number): Blob {
  // 1. Подсчитываем общую длину всех буферов
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const numberOfChannels = chunks[0]?.numberOfChannels;
  console.log('numberOfChannels:', numberOfChannels);
  if (!numberOfChannels) {
    console.error("could not get numberOfChannels from the first chunk");
  }
  // Создаем результирующий Float32Array
  const result = new Float32Array(totalLength * numberOfChannels);

  // 2. Копируем данные из всех чанков в один массив (Interleaved формат)
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        result[offset++] = chunk.getChannelData(channel)[i];
      }
    }
  }

  // 3. Создаем WAV заголовок и конвертируем данные в Int16 (стандарт для WAV)
  const buffer = new ArrayBuffer(44 + result.length * 2);
  const view = new DataView(buffer);

  // Пишем заголовки RIFF/WAV
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + result.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM формат
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, result.length * 2, true);

  // Записываем PCM данные
  let index = 44;
  for (let i = 0; i < result.length; i++) {
    // Ограничиваем амплитуду и конвертируем в 16-битное целое число
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    index += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
