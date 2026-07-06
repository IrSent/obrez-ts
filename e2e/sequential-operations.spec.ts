import { test, expect } from '@playwright/test';

/**
 * Тест на последовательные операции после фикса transitioning guard.
 * Сокращённые таймауты: 2s → 1s, 3s → 1.5s.
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

async function loadFile(page: import('@playwright/test').Page) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/valid-with-aac.mp4');
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });
}

test.describe('Sequential operations', () => {

  test('pause → play → seek (sequential): all operations succeed', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(2000);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    // 1. Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    const timeAfterPause = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPause).toBeGreaterThan(0);

    // 2. Play
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(1000);

    const timeAfterPlay = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPlay).toBeGreaterThan(timeAfterPause + 0.5);

    // 3. Seek to 50%
    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');
    await page.mouse.click(rect.x + rect.width * 0.5, rect.y + rect.height / 2);
    await page.waitForTimeout(1500);

    const timeAfterSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');
    expect(Math.abs(timeAfterSeek - dur * 0.5)).toBeLessThan(3);

    await page.waitForTimeout(1000);
    const timeAfterSeek2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterSeek2 - timeAfterSeek).toBeGreaterThan(0.5);
    await checkNoMultipleStreams(page);
    expect(consoleLogs.filter(l => l.includes('transition rejected')).length).toBe(0);
  });

  test('seek while playing: transition succeeds', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(1500);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    const timeBeforeSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());

    // Seek to 25%
    await page.evaluate(() => {
      const bar = document.querySelector('[role="progressbar"]') as HTMLElement;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      bar.dispatchEvent(new MouseEvent('click', {
        clientX: rect.left + rect.width * 0.25, clientY: rect.top + rect.height / 2, bubbles: true
      }));
    });
    await page.waitForTimeout(1500);

    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');
    const timeAfterSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(Math.abs(timeAfterSeek - dur * 0.25)).toBeLessThan(3);

    await page.waitForTimeout(1000);
    const timeAfterSeek2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterSeek2 - timeAfterSeek).toBeGreaterThan(0.5);
    await checkNoMultipleStreams(page);
  });

  test('replay: seeks to 0 and plays', async ({ page }) => {
    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(1500);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    // Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    // Seek to 75%
    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');
    await page.mouse.click(rect.x + rect.width * 0.75, rect.y + rect.height / 2);
    await page.waitForTimeout(1000);

    // Play again
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(1000);

    const currentTime = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    const duration = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(duration || '0');
    expect(currentTime).toBeGreaterThan(dur * 0.7);
    await checkNoMultipleStreams(page);
  });
});
