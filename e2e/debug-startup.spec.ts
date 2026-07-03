import { test, expect } from '@playwright/test';

/**
 * Тест: проверяет что в первые секунды воспроизведения нет каши.
 * Читаем analyser каждые 100ms.
 */
test('first 3 seconds are clean', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 1 секунду
  await page.waitForTimeout(1000);

  // Читаем analyser каждые 100ms в течение 3 секунд
  const readings: Array<{
    wallTime: number;
    peak: number;
    rms: number;
    concurrent: number;
    time: number;
  }> = [];

  const startTime = Date.now();

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);

    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (!d) continue;

    readings.push({
      wallTime: (Date.now() - startTime) / 1000,
      peak: d.analyserPeak,
      rms: d.analyserRms,
      concurrent: d.concurrentSources,
      time: d.getPlaybackTime,
    });
  }

  // Выводим данные
  console.log('\n═══ FIRST 3 SECONDS ═══');
  for (const r of readings) {
    console.log(
      `t=${r.wallTime.toFixed(1)}s | peak=${r.peak.toFixed(4)} | rms=${r.rms.toFixed(4)} | ` +
      `concurrent=${r.concurrent} | media=${r.time.toFixed(2)}s`
    );
  }

  // Проверяем что peak не превышает 0.99 (клиппинг)
  const maxPeak = Math.max(...readings.map(r => r.peak));
  expect(maxPeak, 'no clipping in first 3s').toBeLessThan(0.99);

  // Логи для диагностики
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]') || l.includes('[output-')) {
      console.log(l.slice(0, 150));
    }
  }
});
