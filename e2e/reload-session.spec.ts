import { test, expect } from '@playwright/test';

function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(p => parseFloat(p));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function loadFile(page: import('@playwright/test').Page) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/valid-with-aac.mp4');
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });
}

test.describe('Reload session restore', () => {

  test('load → reload → unlock → unload: canvas is fully cleared', async ({ page }) => {
    await page.context().addInitScript(() => {
      localStorage.setItem('obrez_play_on_load', 'true');
    });

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(3000);

    // Verify video is playing — canvas has content
    const pixelBefore = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[aria-label="Video canvas"]');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const d = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    });
    expect(pixelBefore).not.toBeNull();
    expect(pixelBefore!.r + pixelBefore!.g + pixelBefore!.b).toBeGreaterThan(0);

    // --- reload ---
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Verify restored — duration > 0
    const durAfter = await page.locator('span.text-xs.opacity-60').last().textContent();
    expect(parseTime(durAfter)).toBeGreaterThan(0);

    // Click the lock overlay to unlock playback
    const lockOverlay = page.locator('[data-testid="audio-lock-overlay"]');
    if (await lockOverlay.isVisible().catch(() => false)) {
      await lockOverlay.click();
      await page.waitForTimeout(3000);
    }

    // --- unload ---
    await page.getByRole('button', { name: 'Unload' }).click();
    await page.waitForTimeout(3000);

    // "Load File" button should be visible
    await expect(page.getByRole('button', { name: 'Load File' })).toBeVisible();

    // Canvas should be fully blank
    const canvasCheck = await page.evaluate(() => {
      const canvas = document.querySelector('canvas[aria-label="Video canvas"]');
      if (!canvas) return { allBlank: true };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { allBlank: true };
      const w = canvas.width, h = canvas.height;
      for (const [x, y] of [[w/2, h/2], [w/4, h/4], [3*w/4, 3*h/4]]) {
        const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        if (d[0] > 0 || d[1] > 0 || d[2] > 0 || d[3] > 0) {
          return { allBlank: false, pixel: { x, y, r: d[0], g: d[1], b: d[2], a: d[3] } };
        }
      }
      return { allBlank: true };
    });
    expect(canvasCheck.allBlank, `canvas should be blank after unload, got ${JSON.stringify(canvasCheck)}`).toBe(true);
  });

  test('load → reload → unlock: click overlay starts audio+video', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.context().addInitScript(() => {
      localStorage.setItem('obrez_play_on_load', 'true');
    });

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(2000);

    // --- reload ---
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(8000);

    // Verify restored
    const durAfter = await page.locator('span.text-xs.opacity-60').last().textContent();
    expect(parseTime(durAfter)).toBeGreaterThan(0);

    const diagAfterReload = await page.evaluate(() => ({
      playbackState: (window as any).__audioDiagnostic?.playbackState ?? 'unknown',
      audioLocked: (window as any).__audioDiagnostic?.audioLocked ?? -1,
    }));
    console.log('=== AFTER RELOAD ===', diagAfterReload);
    console.log('=== AUDIO LOGS ===', consoleLogs.filter(l => l.includes('[audio]') || l.includes('suspended')).join('\n'));

    // Click the lock overlay to unlock
    const lockOverlay = page.locator('[data-testid="audio-lock-overlay"]');
    if (await lockOverlay.isVisible().catch(() => false)) {
      await lockOverlay.click();
      await page.waitForTimeout(8000);
    }

    const diag = await page.evaluate(() => ({
      playbackState: (window as any).__audioDiagnostic?.playbackState ?? 'unknown',
      hasIterator: (window as any).__audioDiagnostic?.hasIterator ?? false,
      analyserRms: (window as any).__audioDiagnostic?.analyserRms ?? -1,
    }));

    if (diag.playbackState !== 'playing') {
      console.log('=== DIAGNOSTIC ===', diag);
      console.log('=== AUDIO LOGS ===', consoleLogs.filter(l => l.includes('[audio]') || l.includes('suspended')).join('\n'));
    }

    expect(diag.playbackState).toBe('playing');
    expect(diag.hasIterator).toBe(true);
    expect(diag.analyserRms).toBeGreaterThan(0.001);

    // Time should advance
    const time1 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    await page.waitForTimeout(3000);
    const time2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(time2 - time1).toBeGreaterThan(1);
  });

  test('load → reload → seek → unlock: seek works, then play from new position', async ({ page }) => {
    await page.context().addInitScript(() => {
      localStorage.setItem('obrez_play_on_load', 'true');
    });

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(2000);

    // --- reload ---
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Get duration
    const durAttr = await page.locator('[data-testid="duration"]').getAttribute('data-seconds');
    const dur = parseFloat(durAttr || '0');
    expect(dur).toBeGreaterThan(0);

    // Hover canvas
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    // Seek to 25%
    const progressBar = page.locator('[role="progressbar"]');
    const rect = await progressBar.boundingBox();
    if (!rect) throw new Error('progress bar not found');
    await page.mouse.click(rect.x + rect.width * 0.25, rect.y + rect.height / 2);
    await page.waitForTimeout(2000);

    const timeAfterSeek = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(Math.abs(timeAfterSeek - dur * 0.25)).toBeLessThan(5);

    // Click the lock overlay to unlock
    const lockOverlay = page.locator('[data-testid="audio-lock-overlay"]');
    if (await lockOverlay.isVisible().catch(() => false)) {
      await lockOverlay.click();
      await page.waitForTimeout(5000);
    }

    const timeAfterPlay = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(timeAfterPlay).toBeGreaterThan(timeAfterSeek + 1);

    // Audio should be playing
    const diag = await page.evaluate(() => ({
      playbackState: (window as any).__audioDiagnostic?.playbackState ?? 'unknown',
      analyserRms: (window as any).__audioDiagnostic?.analyserRms ?? -1,
    }));
    expect(diag.playbackState).toBe('playing');
    expect(diag.analyserRms).toBeGreaterThan(0.001);
  });

  test('load → reload → unlock → pause → play: toggle works', async ({ page }) => {
    await page.context().addInitScript(() => {
      localStorage.setItem('obrez_play_on_load', 'true');
    });

    await page.goto('/');
    await loadFile(page);
    await page.waitForTimeout(2000);

    // --- reload ---
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    // Click the lock overlay to unlock
    const lockOverlay = page.locator('[data-testid="audio-lock-overlay"]');
    if (await lockOverlay.isVisible().catch(() => false)) {
      await lockOverlay.click();
      await page.waitForTimeout(3000);
    }

    // Verify playing
    const time1 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    await page.waitForTimeout(3000);
    const time2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(time2 - time1).toBeGreaterThan(1);

    // Pause
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    const pausedTime1 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    await page.waitForTimeout(3000);
    const pausedTime2 = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(pausedTime2 - pausedTime1).toBeLessThan(1);

    // Play again
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(5000);

    const playingTime = parseTime(await page.locator('span.text-xs.opacity-60').first().textContent());
    expect(playingTime - pausedTime1).toBeGreaterThan(1);

    const diag = await page.evaluate(() => ({
      playbackState: (window as any).__audioDiagnostic?.playbackState ?? 'unknown',
      analyserRms: (window as any).__audioDiagnostic?.analyserRms ?? -1,
    }));
    expect(diag.playbackState).toBe('playing');
    expect(diag.analyserRms).toBeGreaterThan(0.001);
  });
});
