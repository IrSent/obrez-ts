import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Censor Export — Full Integration Test
 * Removed unnecessary 5s audio bootstrap wait (test doesn't check audio).
 */
test.describe('Censor Export', () => {
  test('loads video, imports effects, exports censored file with progress', async ({ page }) => {
    test.setTimeout(180_000);

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');

    // Load video
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 30_000 });
    await expect(page.locator('text=Playback failed')).not.toBeVisible();

    // Add bleep sound
    const bleepHeading = page.getByRole('heading', { name: 'Bleep Sounds' });
    await bleepHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const addSoundBtn = page.getByRole('button', { name: 'Add Sound' });
    await addSoundBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addSoundBtn.click();
    await expect(page.locator('h3:has-text("Add Bleep Sound")')).toBeVisible({ timeout: 5_000 });
    await page.setInputFiles('input[type="file"][accept="audio/*"]', 'e2e/gong_1.mp3');
    await expect(page.locator('text=No bleep sounds added')).not.toBeVisible({ timeout: 10_000 });

    const bleepSoundId = await page.evaluate(() => {
      return new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('obrez-bleep', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('sounds', 'readonly');
          const store = tx.objectStore('sounds');
          const allReq = store.getAll();
          allReq.onsuccess = () => resolve((allReq.result as any[])[0]?.id ?? '');
          allReq.onerror = () => reject(allReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    expect(bleepSoundId, 'Bleep sound should have been added').toBeTruthy();

    // Build and import JSON with effects
    const jsonContent = JSON.stringify({
      version: 1,
      transcription: [
        { start: 0.5, end: 1.2, text: 'Hello' },
        { start: 1.3, end: 2.0, text: 'world' },
        { start: 2.1, end: 3.0, text: 'this' },
        { start: 3.1, end: 4.0, text: 'is' },
        { start: 4.1, end: 5.5, text: 'a test' },
      ],
      effects: [
        {
          id: 'eff-1', segmentStart: 0.5, soundId: bleepSoundId,
          volume: 1, volumeMode: 'manual', playbackRate: 1,
          dampenOriginal: true, dampenAmount: 1, dampenType: 'sharp', effectType: 'sound',
        },
        {
          id: 'eff-2', segmentStart: 2.1, soundId: bleepSoundId,
          volume: 0.5, volumeMode: 'manual', playbackRate: 1,
          dampenOriginal: true, dampenAmount: 0.5, dampenType: 'parabolic', effectType: 'sound',
        },
      ],
    });

    const jsonPathLocal = 'e2e/censor-test-dynamic.json';
    fs.writeFileSync(jsonPathLocal, jsonContent);

    const importFileChooserPromise = page.waitForEvent('filechooser');
    await page.getByTitle('Import transcription + effects from JSON').click();
    const importChooser = await importFileChooserPromise;
    await importChooser.setFiles(jsonPathLocal);

    const importDone = page.locator('text=Done ✓');
    await expect(importDone).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('text=Import failed')).not.toBeVisible();

    // Export button visible
    const exportButton = page.getByRole('button', { name: /Export Censored Video/i });
    await expect(exportButton).toBeVisible({ timeout: 10_000 });

    // Start export with WebM format
    await exportButton.click();
    const modal = page.locator('text=Export Video');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    const webmButton = page.getByText(/\.WEBM/i);
    await webmButton.click();
    const modalExportButton = page.getByRole('button', { name: /^Export$/i });
    await modalExportButton.click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // Validate progress updates
    const progressContainer = page.locator('[class*="bg-green-400"]').first();
    await expect(progressContainer).toBeVisible({ timeout: 10_000 });

    const collectedStages: string[] = [];
    const stagePollInterval = setInterval(async () => {
      try {
        const stage = await page.evaluate(() => {
          const container = document.querySelector('[class*="bg-green-400"]')
            ?.closest('[class*="space-y"]');
          if (!container) return null;
          const activeSpan = container.querySelector(
            '[class*="text-white"][class*="font-semibold"]'
          );
          if (!activeSpan) return null;
          const pctSpan = activeSpan.parentElement?.querySelector('.tabular-nums');
          return activeSpan.textContent + (pctSpan?.textContent ?? '');
        });
        if (stage) collectedStages.push(stage);
      } catch { /* progress bar gone — export done */ }
    }, 500);

    const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
    try {
      await downloadPromise;
    } finally {
      clearInterval(stagePollInterval);
    }

    const progressGone = await progressContainer.isVisible().catch(() => false);
    expect(progressGone, 'Progress bar should disappear after export completes').toBeFalsy();

    const download = await downloadPromise.catch(() => null);
    expect(download, 'Export should trigger a download').toBeTruthy();

    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/censored\.(mp4|webm)$/);

    const filePath = await download.path();
    const stats = fs.statSync(filePath);
    expect(stats.size, 'Exported file should be substantial').toBeGreaterThan(100_000);

    const headerBuf = fs.readFileSync(filePath, { encoding: 'hex' }).slice(0, 8);
    if (fileName.endsWith('.webm')) {
      expect(headerBuf.slice(0, 8), 'WebM must start with EBML header').toBe('1a45dfa3');
    } else if (fileName.endsWith('.mp4')) {
      expect(headerBuf.slice(0, 8), 'MP4 must start with ftyp').toBe('66747970');
    }

    expect(collectedStages.length, 'Export should show multiple progress stages').toBeGreaterThan(2);
    const renderStages = collectedStages.filter((s) => s.includes('Rendering censored'));
    expect(renderStages.length, 'Rendering should report multiple progress updates').toBeGreaterThan(1);

    const renderPcts = renderStages.map((s) => {
      const m = s.match(/(\d+)%/);
      return m ? parseInt(m[1], 10) : null;
    }).filter((p): p is number => p !== null);

    if (renderPcts.length >= 2) {
      const hasMeaningfulProgress = renderPcts.some((p) => p > 5);
      expect(hasMeaningfulProgress,
        `Rendering progress should advance beyond 5%. Stages: ${renderStages.join(' → ')}`).toBe(true);
    }

    const fatalError = page.locator('.text-red-400').filter({ hasText: /fatal|Export failed/i });
    await expect(fatalError).not.toBeVisible();

    const fatalConsole = errors.filter((e) =>
      e.toLowerCase().includes('fatal') || e.toLowerCase().includes('unhandled')
    );
    expect(fatalConsole.length, 'No fatal errors during export').toBe(0);

    fs.unlinkSync(jsonPathLocal);

    // Report
    console.log('\n═══════════════════════════════════════════════════');
    console.log('CENSOR EXPORT TEST — RESULTS');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Bleep sound: ${bleepSoundId}`);
    console.log(`File: ${fileName} (${(stats.size / 1024).toFixed(0)} KB)`);
    console.log(`Header: ${headerBuf.slice(0, 8)}`);
    console.log(`Progress stages: ${collectedStages.length}`);
    console.log(`  Render stages: ${renderStages.length} (pcts: ${renderPcts.join(', ')})`);
    console.log(`Console errors: ${errors.length} (fatal: ${fatalConsole.length})`);
    console.log('═══════════════════════════════════════════════════\n');
  });
});
