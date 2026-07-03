import { test, expect } from '@playwright/test';

/**
 * Диагностический тест: pause → play цикл.
 * Сокращённые таймауты: 2s → 1s, 5s → 2s, 3s → 1.5s.
 */

function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(p => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function checkNoMultipleStreams(page: import('@playwright/test').Page): Promise<void> {
  const { actuallyPlaying, peakPlayingSources } =
    await page.evaluate(() => (window as any).__audioDiagnostic || {});
  expect(actuallyPlaying, 'actuallyPlaying ≤ 2').toBeLessThanOrEqual(2);
  expect(peakPlayingSources, 'peakPlayingSources ≤ 2').toBeLessThanOrEqual(2);
}

async function waitForDiagnostic(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (d) return;
    await page.waitForTimeout(50);
  }
}

// Shared helper to load a file
async function loadFile(page: import('@playwright/test').Page, file: string) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(`e2e/${file}`);
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });
  await waitForDiagnostic(page);
}

test.describe('Pause → Play Diagnostic', () => {

  test('load → pause → play: quick start, single stream', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');

    // Let it play briefly
    await page.waitForTimeout(1000);

    // Pause
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    const timeAfterPause1 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    await page.waitForTimeout(500);
    const timeAfterPause2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPause2 - timeAfterPause1).toBeLessThan(1);

    // Play — measure start time
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    const playClickTime = Date.now();
    await page.getByRole('button', { name: /play/i }).click();

    let started = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(100);
      const currentSecs = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
      if (currentSecs > timeAfterPause2 + 0.3) {
        started = true;
        console.log(`[diagnostic] Playback started after ${Date.now() - playClickTime}ms`);
        break;
      }
    }
    expect(started).toBe(true);

    // Check for artifacts
    await page.waitForTimeout(2000);
    await checkNoMultipleStreams(page);

    const raceIndicators = consoleLogs.filter(log =>
      log.includes('[gap]') ||
      log.includes('bootstrap timeout') ||
      log.includes('st-underrun')
    );
    expect(raceIndicators.length).toBe(0);

    // Repeat pause → play 2 more times
    for (let cycle = 1; cycle <= 2; cycle++) {
      // Pause
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /pause/i }).click();
      await page.waitForTimeout(500);

      // Play
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /play/i }).click();

      const prevSecs = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
      let cycleStarted = false;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        const currentSecs = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
        if (currentSecs > prevSecs + 0.3) {
          cycleStarted = true;
          break;
        }
      }
      expect(cycleStarted, `cycle ${cycle} started`).toBe(true);
      await checkNoMultipleStreams(page);
      await page.waitForTimeout(1000);
    }

    await expect(page.locator('text=Playback failed')).not.toBeVisible();
  });

  test('pause → play with speed change', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await page.waitForTimeout(1000);

    // Pause → Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(1000);
    await checkNoMultipleStreams(page);

    // Change speed to 1.5x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.getByRole('button', { name: '1.5x' }).click();
    await page.waitForTimeout(2000);

    // Pause → Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(1500);
    await checkNoMultipleStreams(page);

    const badLogs = consoleLogs.filter(log =>
      log.includes('[gap]') ||
      log.includes('old iterator still running')
    );
    expect(badLogs.length).toBe(0);
    await expect(page.locator('text=Playback failed')).not.toBeVisible();
  });

  test('initial load: no multiple streams at startup', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await page.waitForTimeout(2000);
    await checkNoMultipleStreams(page);

    const multiIteratorLogs = consoleLogs.filter(log =>
      log.includes('runAudioIterator skipped') ||
      log.includes('old iterator still running')
    );
    expect(multiIteratorLogs.length).toBe(0);
  });
});
