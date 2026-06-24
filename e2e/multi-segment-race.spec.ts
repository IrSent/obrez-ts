import { test, expect } from '@playwright/test';

/**
 * Тест на гонку при pause → play + seek.
 *
 * Сценарий: pause → (play + seek параллельно) → оба перехода
 * запускаются одновременно → play() читает state='paused' и
 * вызывает transitionRef('playing'), seek() читает state='paused'
 * и вызывает transitionRef('paused', t). Один из них останавливает
 * аудио, другой запускает — если они пересекутся, получится
 * два итератора одновременно.
 *
 * Также проверяем: load → play → seek (быстро) → pause → play.
 */

function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(p => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function checkNoMultipleStreams(page: import('@playwright/test').Page): Promise<void> {
  const { actuallyPlaying, peakPlayingSources, hasIterator, iteratorLocked, playbackState } =
    await page.evaluate(() => (window as any).__audioDiagnostic || {});

  if (actuallyPlaying > 2 || peakPlayingSources > 2) {
    console.warn(
      `[race] peakPlayingSources=${peakPlayingSources}, actuallyPlaying=${actuallyPlaying}, ` +
      `state=${playbackState}, hasIterator=${hasIterator}, locked=${iteratorLocked}`
    );
  }
  expect(actuallyPlaying, 'actuallyPlaying ≤ 2').toBeLessThanOrEqual(2);
  expect(peakPlayingSources, 'peakPlayingSources ≤ 2').toBeLessThanOrEqual(2);
}

test.describe('Multi-segment race condition', () => {

  test('rapid pause → play + seek: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto('/');

    // Load file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // Let it play for 3 seconds
    await page.waitForTimeout(3000);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    // Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    // Play + Seek simultaneously (evaluate in page to fire both at once)
    await page.evaluate(async () => {
      // Get the player actions from the context
      const canvas = document.querySelector('canvas[aria-label="Video canvas"]');
      // Click play button AND seek at the same time
      const playButton = document.querySelector('[aria-label="Play"]');
      const progressBar = document.querySelector('[role="progressbar"]');

      // Schedule both actions simultaneously
      Promise.all([
        new Promise<void>(resolve => {
          // Click play
          (playButton as HTMLElement)?.click();
          resolve();
        }),
        new Promise<void>(resolve => {
          // Click progress bar at 50% position
          if (progressBar) {
            const rect = (progressBar as HTMLElement).getBoundingClientRect();
            const midX = rect.left + rect.width * 0.5;
            const midY = rect.top + rect.height / 2;
            (progressBar as HTMLElement).dispatchEvent(
              new MouseEvent('click', { clientX: midX, clientY: midY, bubbles: true })
            );
          }
          resolve();
        }),
      ]);
    });

    // Wait for transitions to settle
    await page.waitForTimeout(5000);

    // Check no multiple streams
    await checkNoMultipleStreams(page);

    // Check console for race indicators
    const raceLogs = consoleLogs.filter(log =>
      log.includes('startAudio: old iterator still running') ||
      log.includes('runAudioIterator skipped') ||
      log.includes('[gap]') ||
      log.includes('bootstrap timeout') ||
      log.includes('stopAudio: iterator.return() timed out') ||
      log.includes('runAudioIterator still locked')
    );
    if (raceLogs.length > 0) {
      console.log('[race] Race condition indicators:');
      raceLogs.forEach(l => console.log('  ', l));
    }

    // Print all audio-related logs for debugging
    const audioLogs = consoleLogs.filter(log =>
      log.includes('[audio]') || log.includes('transition')
    );
    console.log('[race] Audio/transition logs:');
    audioLogs.forEach(l => console.log('  ', l));

    // Check diagnostic state
    const diag = await page.evaluate(() => (window as any).__audioDiagnostic || {});
    console.log('[race] Final diagnostic:', diag);

    // Verify playback is progressing
    const currentTimeEl = page.locator('span.text-xs.opacity-60').first();
    const time1 = parseTime(await currentTimeEl.textContent());
    await page.waitForTimeout(2000);
    const time2 = parseTime(await currentTimeEl.textContent());
    console.log(`[race] Time: ${time1} → ${time2} (delta=${time2 - time1})`);
    expect(time2 - time1).toBeGreaterThan(1); // should have progressed
  });

  test('rapid seek during playback: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');

    // Load file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // Let it play for 2 seconds
    await page.waitForTimeout(2000);

    // Rapidly seek multiple times
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');

    // Click at different positions rapidly
    for (const pct of [0.2, 0.8, 0.3, 0.7]) {
      await page.mouse.click(rect.x + rect.width * pct, rect.y + rect.height / 2);
      await page.waitForTimeout(50); // 50ms between clicks — very aggressive
    }

    // Wait for all transitions to settle
    await page.waitForTimeout(5000);

    // Check no multiple streams
    await checkNoMultipleStreams(page);

    // Check console for race indicators
    const raceLogs = consoleLogs.filter(log =>
      log.includes('startAudio: old iterator still running') ||
      log.includes('runAudioIterator skipped') ||
      log.includes('[gap]') ||
      log.includes('bootstrap timeout') ||
      log.includes('stopAudio: iterator.return() timed out') ||
      log.includes('runAudioIterator still locked')
    );
    if (raceLogs.length > 0) {
      console.log('[race] Rapid seek race indicators:');
      raceLogs.forEach(l => console.log('  ', l));
    }

    // Verify playback is progressing
    const currentTimeEl = page.locator('span.text-xs.opacity-60').first();
    const time1 = parseTime(await currentTimeEl.textContent());
    await page.waitForTimeout(2000);
    const time2 = parseTime(await currentTimeEl.textContent());
    expect(time2 - time1).toBeGreaterThan(1);
  });

  test('pause → play → immediate seek: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');

    // Load file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // Let it play briefly
    await page.waitForTimeout(2000);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    // Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    // Play, then immediately seek (within same event loop tick)
    await page.evaluate(async () => {
      const playButton = document.querySelector('[aria-label="Play"]');
      const progressBar = document.querySelector('[role="progressbar"]');

      // Start play
      (playButton as HTMLElement)?.click();

      // Seek immediately after (don't wait for play to complete)
      if (progressBar) {
        const rect = (progressBar as HTMLElement).getBoundingClientRect();
        const midX = rect.left + rect.width * 0.3;
        const midY = rect.top + rect.height / 2;
        (progressBar as HTMLElement).dispatchEvent(
          new MouseEvent('click', { clientX: midX, clientY: midY, bubbles: true })
        );
      }
    });

    // Wait for transitions
    await page.waitForTimeout(5000);

    // Check no multiple streams
    await checkNoMultipleStreams(page);

    // Check console for race indicators
    const raceLogs = consoleLogs.filter(log =>
      log.includes('startAudio: old iterator still running') ||
      log.includes('runAudioIterator skipped') ||
      log.includes('[gap]') ||
      log.includes('bootstrap timeout') ||
      log.includes('stopAudio: iterator.return() timed out') ||
      log.includes('runAudioIterator still locked')
    );
    if (raceLogs.length > 0) {
      console.log('[race] play+seek race indicators:');
      raceLogs.forEach(l => console.log('  ', l));
    }

    // Verify playback is progressing
    const currentTimeEl = page.locator('span.text-xs.opacity-60').first();
    const time1 = parseTime(await currentTimeEl.textContent());
    await page.waitForTimeout(2000);
    const time2 = parseTime(await currentTimeEl.textContent());
    expect(time2 - time1).toBeGreaterThan(1);
  });
});
