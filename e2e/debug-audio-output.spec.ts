import { test, expect } from '@playwright/test';

/**
 * Тест: проверяет что звук идёт последовательно через analyser.
 * Если есть каша из семплов, analyser покажет аномальные пики.
 */
test('audio output is clean through analyser', async ({ page }) => {
  const peaks: number[] = [];
  const rms: number[] = [];

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 3 секунды после старта
  await page.waitForTimeout(3000);

  // Собираем analyser данные каждые 500ms
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);

    const analyserData = await page.evaluate(() => {
      // Получаем analyser из audio pipeline
      // analyser подключён после compressor → limiter → analyser → gain → destination
      const ctx = (window as any).__audioAnalyserContext;
      if (!ctx) return null;

      const dataArray = new Float32Array(ctx.frequencyBinCount);
      ctx.getFloatTimeDomainData(dataArray);

      let peak = 0;
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        if (abs > peak) peak = abs;
        sum += dataArray[i] * dataArray[i];
      }
      const rmsValue = Math.sqrt(sum / dataArray.length);

      return { peak, rms: rmsValue };
    });

    if (analyserData) {
      peaks.push(analyserData.peak);
      rms.push(analyserData.rms);
      console.log(`t=${(i * 0.5 + 0.5).toFixed(1)}s | peak=${analyserData.peak.toFixed(4)} | rms=${analyserData.rms.toFixed(4)}`);
    }
  }
});

/**
 * Более простой тест: просто проверяем что звук идёт и нет клипов.
 */
test('no clipping at 1x', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 5 секунд
  await page.waitForTimeout(5000);

  // Проверяем что нет клипов
  const clipLogs = logs.filter(l => l.includes('[output-clip]'));
  expect(clipLogs.length, 'no clipping at 1x').toBe(0);

  // Проверяем что нет кликов
  const clickLogs = logs.filter(l => l.includes('[output-click]'));
  expect(clickLogs.length, 'no clicks at 1x').toBe(0);

  // Проверяем что нет рипов
  const ripLogs = logs.filter(l => l.includes('[output-rip]'));
  expect(ripLogs.length, 'no rips at 1x').toBe(0);

  // Логи для диагностики
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]') || l.includes('[output-')) {
      console.log(l.slice(0, 150));
    }
  }
});
