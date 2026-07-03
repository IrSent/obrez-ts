import { test, expect } from '@playwright/test';

/**
 * Тест: проверяет что getPlaybackTime() соответствует реальному времени аудио.
 *
 * Если есть каша (звук торопится или видео отстаёт), разница между
 * getPlaybackTime() и реальным временем будет расти.
 */
test('getPlaybackTime matches audio reality', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 2 секунды после старта (warmup + bootstrap)
  await page.waitForTimeout(2000);

  // Собираем данные каждые 500ms
  const samples: Array<{
    wallTime: number;
    mediaTime: number;
    concurrent: number;
    playing: number;
    locked: boolean;
    state: string;
  }> = [];

  const startTime = Date.now();

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);

    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    const wallTime = (Date.now() - startTime) / 1000;

    samples.push({
      wallTime,
      mediaTime: d?.getPlaybackTime ?? 0,
      concurrent: d?.concurrentSources ?? 0,
      playing: d?.actuallyPlaying ?? 0,
      locked: d?.iteratorLocked ?? false,
      state: d?.playbackState ?? 'unknown',
    });
  }

  // Проверяем линейность: каждая дельта mediaTime / wallTime ≈ 1.0
  console.log('\n═══ TIME MATCH ═══');
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dMedia = samples[i].mediaTime - samples[i - 1].mediaTime;
    const dWall = samples[i].wallTime - samples[i - 1].wallTime;
    const rate = dMedia / dWall;
    deltas.push(rate);
    console.log(
      `delta ${i}: media=${dMedia.toFixed(3)}s wall=${dWall.toFixed(3)}s rate=${rate.toFixed(4)}x ` +
      `concurrent=${samples[i].concurrent} playing=${samples[i].playing}`
    );
  }

  const avgRate = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  console.log(`Average rate: ${avgRate.toFixed(4)}x (expected ~1.00x)`);

  // Каждая дельта в [0.70, 1.30] — ±30% при 1x
  const outOfRange = deltas.filter(r => r < 0.70 || r > 1.30);
  expect(outOfRange.length,
    `all deltas in [0.70, 1.30]x, violations: ${outOfRange.map(r => r.toFixed(3)).join(', ')}`
  ).toBe(0);

  // Среднее близко к 1.0
  expect(avgRate, 'average rate ≈ 1.0x').toBeGreaterThan(0.90);
  expect(avgRate, 'average rate ≈ 1.0x').toBeLessThan(1.10);

  // Логи для диагностики
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]')) {
      console.log(l.slice(0, 150));
    }
  }
});

/**
 * Тот же тест но на 2x после перехода.
 */
test('getPlaybackTime matches audio reality at 2x', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 2 секунды на 1x
  await page.waitForTimeout(2000);

  // Смена на 2x
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '1x' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '2x' }).click();

  // Bootstrap + settle
  await page.waitForTimeout(3000);

  // Собираем данные каждые 500ms
  const samples: Array<{
    wallTime: number;
    mediaTime: number;
    concurrent: number;
    playing: number;
  }> = [];

  const startTime = Date.now();

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);

    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    const wallTime = (Date.now() - startTime) / 1000;

    samples.push({
      wallTime,
      mediaTime: d?.getPlaybackTime ?? 0,
      concurrent: d?.concurrentSources ?? 0,
      playing: d?.actuallyPlaying ?? 0,
    });
  }

  // Проверяем линейность: каждая дельта mediaTime / wallTime ≈ 2.0
  console.log('\n═══ 2x TIME MATCH ═══');
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dMedia = samples[i].mediaTime - samples[i - 1].mediaTime;
    const dWall = samples[i].wallTime - samples[i - 1].wallTime;
    const rate = dMedia / dWall;
    deltas.push(rate);
    console.log(
      `delta ${i}: media=${dMedia.toFixed(3)}s wall=${dWall.toFixed(3)}s rate=${rate.toFixed(4)}x ` +
      `concurrent=${samples[i].concurrent} playing=${samples[i].playing}`
    );
  }

  const avgRate = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  console.log(`Average rate: ${avgRate.toFixed(4)}x (expected ~2.00x)`);

  // Каждая дельта в [1.40, 2.60] — ±30% от 2x
  const outOfRange = deltas.filter(r => r < 1.40 || r > 2.60);
  expect(outOfRange.length,
    `all deltas in [1.40, 2.60]x, violations: ${outOfRange.map(r => r.toFixed(3)).join(', ')}`
  ).toBe(0);

  // Среднее близко к 2.0
  expect(avgRate, 'average rate ≈ 2.0x').toBeGreaterThan(1.70);
  expect(avgRate, 'average rate ≈ 2.0x').toBeLessThan(2.30);

  // Логи для диагностики
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]')) {
      console.log(l.slice(0, 150));
    }
  }
});
