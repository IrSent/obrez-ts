import { test, expect } from '@playwright/test';

test('debug: check audio output', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[audio]') || text.includes('error') || text.includes('Error') || text.includes('[gap]')) {
      console.log(text.slice(0, 120));
    }
  });

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 5 секунд и смотрим diagnostic
  await page.waitForTimeout(5000);

  const d = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('\n═══ DIAGNOSTIC ═══');
  console.log(JSON.stringify(d, null, 2));

  // Считаем время
  const time = await page.locator('span.text-xs.opacity-60').first().textContent();
  console.log(`Current media time: ${time}`);

  // Проверяем аудио через analyser
  const analyserData = await page.evaluate(() => {
    const diag = (window as any).__audioDiagnostic;
    return {
      state: diag?.playbackState,
      locked: diag?.iteratorLocked,
      hasIterator: diag?.hasIterator,
      concurrent: diag?.concurrentSources,
      playing: diag?.actuallyPlaying,
      peak: diag?.peakPlayingSources,
      time: diag?.getPlaybackTime,
    };
  });
  console.log('\n═══ AUDIO STATE ═══');
  console.log(JSON.stringify(analyserData, null, 2));

  // Ключевые логи
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('bootstrap') || l.includes('firstBuffer')) {
      console.log(l.slice(0, 150));
    }
  }
});
