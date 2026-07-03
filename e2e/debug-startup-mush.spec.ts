import { test, expect } from '@playwright/test';

/**
 * Тест: детально проверяем первые 500ms воспроизведения на 1x и 2x.
 * Читаем analyser каждые 20ms для обнаружения каши из семплов.
 */
test('first 500ms at 1x — no mush', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Собираем analyser каждые 20ms в течение первых 500ms
  const readings: Array<{ wall: number; peak: number; rms: number; playing: number; media: number }> = [];

  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(20);

    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (!d) continue;

    readings.push({
      wall: (i * 20) / 1000,
      peak: d.analyserPeak ?? 0,
      rms: d.analyserRms ?? 0,
      playing: d.actuallyPlaying ?? 0,
      media: d.getPlaybackTime ?? 0,
    });
  }

  console.log('\n═══ FIRST 500ms AT 1x ═══');
  for (const r of readings) {
    const bar = '█'.repeat(Math.round(r.rms * 20));
    console.log(
      `t=${r.wall.toFixed(3)}s | media=${r.media.toFixed(2)}s | peak=${r.peak.toFixed(4)} | rms=${r.rms.toFixed(4)} | playing=${r.playing} | ${bar}`
    );
  }

  // Проверяем что нет >1 одновременно играющего источника
  const maxPlaying = Math.max(...readings.map(r => r.playing));
  expect(maxPlaying, 'max actuallyPlaying ≤ 2 at start').toBeLessThanOrEqual(2);

  // Проверяем что media time идёт монотонно (не каждый шаг — первые могут быть 0 до старта аудио)
  let prevMedia = 0;
  for (const r of readings) {
    expect(r.media, `media time non-decreasing`).toBeGreaterThanOrEqual(prevMedia);
    prevMedia = r.media;
  }

  // Проверяем что нет артефактов
  const gaps = logs.filter(l => l.includes('[gap]'));
  const clips = logs.filter(l => l.includes('[output-clip]'));
  const blubs = logs.filter(l => l.includes('[output-blub]'));
  expect(gaps.length, 'no gaps at 1x start').toBe(0);
  expect(clips.length, 'no clips at 1x start').toBe(0);
  expect(blubs.length, 'no blubs at 1x start').toBe(0);

  // Аудио логи
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-') || l.includes('[output-') || l.includes('[bootstrap') || l.includes('[warmup')) {
      console.log(l.slice(0, 200));
    }
  }
});

test('first 500ms at 2x — no mush', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Меняем скорость на 2x ПЕРЕД стартом (пауза → 2x → play)
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);

  // Pause first
  await page.getByRole('button', { name: /pause/i }).click();
  await page.waitForTimeout(500);

  // Change to 2x
  await page.getByRole('button', { name: '1x' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '2x' }).click();
  await page.waitForTimeout(1000); // wait for transition

  // Play
  await page.getByRole('button', { name: /play/i }).click();
  await page.waitForTimeout(2000); // wait for bootstrap

  // Собираем analyser каждые 20ms
  const readings: Array<{ wall: number; peak: number; rms: number; playing: number; media: number }> = [];

  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(20);

    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (!d) continue;

    readings.push({
      wall: (i * 20) / 1000,
      peak: d.analyserPeak ?? 0,
      rms: d.analyserRms ?? 0,
      playing: d.actuallyPlaying ?? 0,
      media: d.getPlaybackTime ?? 0,
    });
  }

  console.log('\n═══ FIRST 500ms AT 2x ═══');
  for (const r of readings) {
    const bar = '█'.repeat(Math.round(r.rms * 20));
    console.log(
      `t=${r.wall.toFixed(3)}s | media=${r.media.toFixed(2)}s | peak=${r.peak.toFixed(4)} | rms=${r.rms.toFixed(4)} | playing=${r.playing} | ${bar}`
    );
  }

  const maxPlaying = Math.max(...readings.map(r => r.playing));
  expect(maxPlaying, 'max actuallyPlaying ≤ 2 at 2x start').toBeLessThanOrEqual(2);

  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-') || l.includes('[output-') || l.includes('[bootstrap') || l.includes('[warmup')) {
      console.log(l.slice(0, 200));
    }
  }
});
