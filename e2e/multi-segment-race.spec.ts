import { test, expect } from '@playwright/test';

/**
 * Тест на гонку при pause → play + seek.
 * Сокращённые таймауты: 3s → 1.5s, 5s → 2s.
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

/**
 * Wait until the video is truly playing (diagnostic time advances).
 * If not, force pause → play to reset the player.
 */
async function ensurePlaying(page: import('@playwright/test').Page): Promise<void> {
  const getTime = () => page.evaluate(() => (window as any).__audioDiagnostic?.getPlaybackTime ?? 0);

  let t0 = await getTime();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500);
    const t = await getTime();
    if (t > t0 + 0.5) return; // video is advancing
    t0 = t;
  }

  // Force pause → play to reset
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /pause/i }).click();
  await page.waitForTimeout(1000);
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /play/i }).click();
  await page.waitForTimeout(5000);
}

test.describe('Multi-segment race condition', () => {

  test('rapid pause → play + seek: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(1500);

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    // Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    // Play + Seek simultaneously
    await page.evaluate(async () => {
      const playButton = document.querySelector('[aria-label="Play"]');
      const progressBar = document.querySelector('[role="progressbar"]');
      Promise.all([
        new Promise<void>(resolve => {
          (playButton as HTMLElement)?.click();
          resolve();
        }),
        new Promise<void>(resolve => {
          if (progressBar) {
            const rect = (progressBar as HTMLElement).getBoundingClientRect();
            (progressBar as HTMLElement).dispatchEvent(
              new MouseEvent('click', {
                clientX: rect.left + rect.width * 0.5,
                clientY: rect.top + rect.height / 2,
                bubbles: true
              })
            );
          }
          resolve();
        }),
      ]);
    });

    await page.waitForTimeout(2000);
    await ensurePlaying(page);
    await checkNoMultipleStreams(page);

    const raceLogs = consoleLogs.filter(log =>
      log.includes('[gap]') || log.includes('bootstrap timeout') ||
      log.includes('old iterator still running')
    );
    expect(raceLogs.length).toBe(0);

    const getTime = () => page.evaluate(() => (window as any).__audioDiagnostic?.getPlaybackTime ?? 0);
    const time1 = await getTime();
    await page.waitForTimeout(2000);
    const time2 = await getTime();
    expect(time2 - time1).toBeGreaterThan(0.5);
  });

  test('rapid seek during playback: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page);

    // Wait for video to actually be playing
    let waited = 0;
    while (waited < 10000) {
      await page.waitForTimeout(500);
      waited += 500;
      const t = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
      if (t > 0.5) break;
    }

    // Rapidly seek multiple times
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');

    for (const pct of [0.2, 0.8, 0.3, 0.7]) {
      await page.mouse.click(rect.x + rect.width * pct, rect.y + rect.height / 2);
      await page.waitForTimeout(50);
    }

    await ensurePlaying(page);
    await checkNoMultipleStreams(page);

    const raceLogs = consoleLogs.filter(log =>
      log.includes('[gap]') || log.includes('bootstrap timeout') ||
      log.includes('old iterator still running')
    );
    expect(raceLogs.length).toBe(0);

    const getTime = () => page.evaluate(() => (window as any).__audioDiagnostic?.getPlaybackTime ?? 0);
    const time1 = await getTime();
    await page.waitForTimeout(2000);
    const time2 = await getTime();
    expect(time2 - time1).toBeGreaterThan(0.5);
  });

  test('pause → play → immediate seek: no concurrent iterators', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await loadFile(page);

    // Wait for video to actually be playing
    let waited = 0;
    while (waited < 10000) {
      await page.waitForTimeout(500);
      waited += 500;
      const t = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
      if (t > 0.5) break;
    }

    // Hover to show controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);

    // Pause
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(500);

    // Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /play/i }).click();

    // Wait for playback to resume (time advances)
    const timeAfterPlayClick = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    waited = 0;
    while (waited < 10000) {
      await page.waitForTimeout(500);
      waited += 500;
      const t = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
      if (t > timeAfterPlayClick + 0.3) break;
    }

    // Seek to 30%
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const progressBar = document.querySelector('[role="progressbar"]');
      if (progressBar) {
        const rect = (progressBar as HTMLElement).getBoundingClientRect();
        (progressBar as HTMLElement).dispatchEvent(
          new MouseEvent('click', {
            clientX: rect.left + rect.width * 0.3,
            clientY: rect.top + rect.height / 2,
            bubbles: true
          })
        );
      }
    });
    await page.waitForTimeout(2000);

    await ensurePlaying(page);
    await checkNoMultipleStreams(page);

    const raceLogs = consoleLogs.filter(log =>
      log.includes('[gap]') || log.includes('bootstrap timeout') ||
      log.includes('old iterator still running')
    );
    expect(raceLogs.length).toBe(0);

    const getTime = () => page.evaluate(() => (window as any).__audioDiagnostic?.getPlaybackTime ?? 0);
    const time1 = await getTime();
    await page.waitForTimeout(2000);
    const time2 = await getTime();
    expect(time2 - time1).toBeGreaterThan(0.5);
  });
});
