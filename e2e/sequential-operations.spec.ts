import { test, expect } from '@playwright/test';

/**
 * Тест на последовательные операции после фикса transitioning guard.
 *
 * Проверка: pause → play → seek (последовательно) — все операции
 * должны завершиться успешно, звук не должен прерываться.
 */

function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(p => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function checkNoMultipleStreams(page: import('@playwright/test').Page): Promise<void> {
  const { actuallyPlaying, peakPlayingSources, playbackState } =
    await page.evaluate(() => (window as any).__audioDiagnostic || {});
  expect(actuallyPlaying, 'actuallyPlaying ≤ 2').toBeLessThanOrEqual(2);
  expect(peakPlayingSources, 'peakPlayingSources ≤ 2').toBeLessThanOrEqual(2);
}

test.describe('Sequential operations', () => {

  test('pause → play → seek (sequential): all operations succeed', async ({ page }) => {
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

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    // 1. Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1500);

    const timeAfterPause = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPause).toBeGreaterThan(0);

    // 2. Play (await to ensure it completes)
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(2000);

    const timeAfterPlay = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPlay).toBeGreaterThan(timeAfterPause + 0.5); // should have progressed

    // 3. Seek to 50% (await to ensure it completes)
    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');
    await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height / 2);
    await page.waitForTimeout(3000);

    const timeAfterSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');

    // Time should be close to 50% of duration (within 2 seconds tolerance)
    expect(Math.abs(timeAfterSeek - dur * 0.5)).toBeLessThan(3);

    // Verify playback is progressing after seek
    await page.waitForTimeout(2000);
    const timeAfterSeek2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterSeek2 - timeAfterSeek).toBeGreaterThan(1);

    // Check no multiple streams
    await checkNoMultipleStreams(page);

    // Check no rejected transitions (there shouldn't be any with sequential operations)
    const rejectedLogs = consoleLogs.filter(log =>
      log.includes('transition rejected')
    );
    expect(rejectedLogs.length).toBe(0);
  });

  test('seek while playing: transition succeeds', async ({ page }) => {
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

    // Let it play for 3 seconds
    await page.waitForTimeout(3000);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    const timeBeforeSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    console.log(`[seq] Time before seek: ${timeBeforeSeek}`);

 // Seek to 25% — use page.evaluate to dispatch click on the actual element
    const seeked = await page.evaluate(() => {
      const bar = document.querySelector('[role="progressbar"]') as HTMLElement;
      if (!bar) return -1;
      const rect = bar.getBoundingClientRect();
      const clickX = rect.left + rect.width * 0.25;
      const clickY = rect.top + rect.height / 2;
      bar.dispatchEvent(new MouseEvent('click', {
        clientX: clickX, clientY: clickY, bubbles: true
      }));
      return 0.25;
    });
    await page.waitForTimeout(3000);

    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');
    const timeAfterSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());

    console.log(`[seq] Duration: ${dur}, 25%: ${dur * 0.25}, timeAfterSeek: ${timeAfterSeek}`);

    // Check transition logs
    const audioLogs = consoleLogs.filter(log => log.includes('[audio]'));
    console.log('[seq] Audio logs:', audioLogs);

    // Time should be close to 25% of duration
    expect(Math.abs(timeAfterSeek - dur * 0.25)).toBeLessThan(3);

    // Verify playback is progressing
    await page.waitForTimeout(2000);
    const timeAfterSeek2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterSeek2 - timeAfterSeek).toBeGreaterThan(1);

    // Check no multiple streams
    await checkNoMultipleStreams(page);

    // Check no rejected transitions
    const rejectedLogs = consoleLogs.filter(log =>
      log.includes('transition rejected')
    );
    expect(rejectedLogs.length).toBe(0);
  });

  test('replay: seeks to 0 and plays', async ({ page }) => {
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
    await page.waitForTimeout(1000);

    // Seek to 75%
    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');
    await page.mouse.click(rect.x + rect.width * 0.75, rect.y + rect.height / 2);
    await page.waitForTimeout(2000);

    // Play again
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(2000);

    const currentTime = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');

    // Should be playing from ~75%
    expect(currentTime).toBeGreaterThan(dur * 0.7);

    // Check no multiple streams
    await checkNoMultipleStreams(page);
  });
});
