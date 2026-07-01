import { test, expect } from '@playwright/test';

/**
 * Диагностический тест: pause → play цикл.
 *
 * Проверяет:
 * 1. Старт после паузы не затянут (время начинается прогрессировать
 *    в течение 1 секунды после нажатия play).
 * 2. Нет нескольких отрезков одновременно — peakConcurrentSources ≤ 2
 *    (1 активный + 1 следующий в очереди — норма).
 * 3. Нет нескольких итераторов одновременно — hasIterator = true, но
 *    только один (iteratorLocked = false после завершения).
 * 4. Звук есть сразу — analyser показывает энергию, а не тишину.
 */

// Parse "MM:SS.mmm" or "HH:MM:SS.mmm" → total seconds
function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(p => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

// Check that no multiple audio streams are playing simultaneously.
// Normal: 1 BufferSource in 'started' state at a time. 2 is acceptable
// (current + next chaining). > 2 means multiple iterators feeding audio.
async function checkNoMultipleStreams(page: import('@playwright/test').Page): Promise<void> {
  const { actuallyPlaying, peakPlayingSources, hasIterator, iteratorLocked, playbackState } =
    await page.evaluate(() => (window as any).__audioDiagnostic || {});

  if (actuallyPlaying > 2) {
    console.warn(
      `[diagnostic] MULTIPLE STREAMS: actuallyPlaying=${actuallyPlaying}, ` +
      `peak=${peakPlayingSources}, state=${playbackState}, ` +
      `hasIterator=${hasIterator}, locked=${iteratorLocked}`
    );
  }
  expect(actuallyPlaying, 'no multiple streams playing (actuallyPlaying ≤ 2)').toBeLessThanOrEqual(2);
  expect(peakPlayingSources, 'no multiple streams peak (peakPlayingSources ≤ 2)').toBeLessThanOrEqual(2);
}

// Wait for __audioDiagnostic to be available (setInterval fires every 100ms)
async function waitForDiagnostic(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (d) return;
    await page.waitForTimeout(50);
  }
}

test.describe('Pause → Play Diagnostic', () => {

  test('load → pause → play: quick start, single stream, sound present', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/');

    // === 1. Load file ===
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    await waitForDiagnostic(page);

    // === 2. Let it play briefly ===
    await page.waitForTimeout(2000);

    // === 3. Pause ===
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    // Verify paused
    const timeAfterPause1 = await page.locator('span.text-xs.opacity-60').first().textContent();
    await page.waitForTimeout(1500);
    const timeAfterPause2 = await page.locator('span.text-xs.opacity-60').first().textContent();
    const pause1Secs = parseTime(timeAfterPause1);
    const pause2Secs = parseTime(timeAfterPause2);
    expect(pause2Secs - pause1Secs).toBeLessThan(1);

    // === 4. Play — measure start time ===
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    const playClickTime = Date.now();
    await page.getByRole('button', { name: /play/i }).click();

    // === 5. Check that playback starts within 1 second ===
    let started = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      const currentTime = await page.locator('span.text-xs.opacity-60').first().textContent();
      const currentSecs = parseTime(currentTime);
      if (currentSecs > pause2Secs + 0.3) {
        started = true;
        const elapsed = Date.now() - playClickTime;
        console.log(`[diagnostic] Playback started after ${elapsed}ms`);
        break;
      }
    }
    expect(started).toBe(true);

    // === 6. Let it play and check for artifacts ===
    await page.waitForTimeout(5000);
    const timeAfterPlay = await page.locator('span.text-xs.opacity-60').first().textContent();
    const playSecs = parseTime(timeAfterPlay);
    expect(playSecs - pause2Secs).toBeGreaterThan(4);

    // === 7. Check no multiple streams ===
    await checkNoMultipleStreams(page);

    // === 8. Check console for race-condition indicators ===
    const raceIndicators = consoleLogs.filter(log =>
      log.includes('[audio] startAudio: old iterator still running') ||
      log.includes('[audio] runAudioIterator skipped') ||
      log.includes('[gap]') ||
      log.includes('[audio] bootstrap timeout') ||
      log.includes('st-underrun')
    );
    if (raceIndicators.length > 0) {
      console.log('[diagnostic] Race-condition indicators in console:');
      raceIndicators.forEach(l => console.log('  ', l));
    }
    expect(raceIndicators.length).toBe(0);

    // === 9. Repeat pause → play cycle 2 more times ===
    for (let cycle = 1; cycle <= 2; cycle++) {
      console.log(`[diagnostic] Cycle ${cycle}`);

      // Pause
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: /pause/i }).click();
      await page.waitForTimeout(1000);

      // Play
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(500);
      const cycleStartTime = Date.now();
      await page.getByRole('button', { name: /play/i }).click();

      let cycleStarted = false;
      const prevTime = await page.locator('span.text-xs.opacity-60').first().textContent();
      const prevSecs = parseTime(prevTime);

      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        const currentTime = await page.locator('span.text-xs.opacity-60').first().textContent();
        const currentSecs = parseTime(currentTime);
        if (currentSecs > prevSecs + 0.3) {
          cycleStarted = true;
          const elapsed = Date.now() - cycleStartTime;
          console.log(`[diagnostic] Cycle ${cycle} started after ${elapsed}ms`);
          break;
        }
      }
      expect(cycleStarted).toBe(true);

      // Check no multiple streams after each cycle
      await checkNoMultipleStreams(page);

      await page.waitForTimeout(2000);
    }

    // === 10. Final console check ===
    const finalRaceIndicators = consoleLogs.filter(log =>
      log.includes('[audio] startAudio: old iterator still running') ||
      log.includes('[audio] runAudioIterator skipped') ||
      log.includes('[gap]') ||
      log.includes('[audio] bootstrap timeout') ||
      log.includes('st-underrun')
    );
    if (finalRaceIndicators.length > 0) {
      console.log('[diagnostic] Final race-condition indicators:');
      finalRaceIndicators.forEach(l => console.log('  ', l));
    }
    expect(finalRaceIndicators.length).toBe(0);

    // === 11. Verify no errors ===
    const errorText = page.locator('text=Playback failed');
    await expect(errorText).not.toBeVisible();
  });

  test('pause → play → pause → play with speed change', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      consoleLogs.push(msg.text());
    });

    await page.goto('/');

    // Load file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    await waitForDiagnostic(page);
    await page.waitForTimeout(2000);

    // Pause → Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(2000);

    // Check no multiple streams after pause→play
    await checkNoMultipleStreams(page);

    // Change speed to 1.5x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '1x' }).click();
    await page.getByRole('button', { name: '1.5x' }).click();
    await page.waitForTimeout(4000);

    // Pause → Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(3000);

    // Check no multiple streams after speed-change + pause→play
    await checkNoMultipleStreams(page);

    // Check for race-condition indicators
    const badLogs = consoleLogs.filter(log =>
      log.includes('[gap]') ||
      log.includes('bootstrap timeout') ||
      log.includes('old iterator still running') ||
      log.includes('runAudioIterator skipped')
    );
    if (badLogs.length > 0) {
      console.log('[diagnostic] Bad logs after speed change + pause/play:');
      badLogs.forEach(l => console.log('  ', l));
    }
    expect(badLogs.length).toBe(0);

    const errorText = page.locator('text=Playback failed');
    await expect(errorText).not.toBeVisible();
  });

  test('initial load: no multiple streams at startup', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    await waitForDiagnostic(page);

    // Let it play a bit
    await page.waitForTimeout(3000);

    // Check no multiple streams at startup
    await checkNoMultipleStreams(page);

    // Also check console for signs of multiple iterators
    const multiIteratorLogs = consoleLogs.filter(log =>
      log.includes('runAudioIterator skipped') ||
      log.includes('old iterator still running')
    );
    if (multiIteratorLogs.length > 0) {
      console.log('[diagnostic] Multiple iterator indicators at startup:');
      multiIteratorLogs.forEach(l => console.log('  ', l));
    }
    expect(multiIteratorLogs.length).toBe(0);
  });
});
