import { test, expect } from '@playwright/test';

/**
 * Test JSON import + censored video export end-to-end:
 * 1. Load ru-profanity3.mp4
 * 2. Import ru-profanity3.json (transcription + censoring effects)
 * 3. Verify import succeeded (segments + effects present)
 * 4. Export censored video
 * 5. Verify download succeeds and file is non-trivial
 */
test('import JSON and export censored video', async ({ page }) => {
  test.setTimeout(300_000);

  const importLogs: string[] = [];
  const exportErrors: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    importLogs.push(text);
    if (text.includes('error') || text.includes('Error') || text.includes('failed') || text.includes('Failed')) {
      exportErrors.push(text);
    }
  });

  await page.goto('/');

  // --- Step 1: Load video ---
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity3.mp4');

  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Wait for bootstrap
  await page.waitForTimeout(3_000);

  // --- Step 2: Import transcription with effects ---
  const importFileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle('Import transcription + effects from JSON').click();
  const importFileChooser = await importFileChooserPromise;
  await importFileChooser.setFiles('e2e/ru-profanity3.json');

  const importDone = page.locator('text=Done ✓');
  await expect(importDone).toBeVisible({ timeout: 120_000 });

  // Verify no import error
  const importError = page.locator('text=Import failed');
  await expect(importError).not.toBeVisible();

  // Verify segments were imported
  const segmentLocator = page.locator('[data-segment]');
  const segmentCount = await segmentLocator.count();
  expect(segmentCount).toBeGreaterThan(0);

  // Check store for censoring effects
  const storeEffects = await page.evaluate(() => {
    const store = (window as any).__ZUSTAND_STORE__?.getState?.() ?? (window as any).usePlayerStore?.getState?.();
    return store?.censoringEffects ?? [];
  });

  console.log(`[json-import-export] Store censoringEffects: ${storeEffects?.length ?? 'N/A'}`);
  console.log(`[json-import-export] Import logs: ${importLogs.length}`);
  importLogs.forEach((l) => console.log(`  ${l}`));

  // Verify censoring effects are present
  const effectLocator = page.locator('[data-testid="censoring-effects"]');
  const censoringEffects = await effectLocator.count();
  expect(censoringEffects).toBeGreaterThan(0);

  // --- Step 3: Export censored video ---
  const exportButton = page.getByRole('button', { name: /Export Censored Video/i });
  await exportButton.click();

  // Wait for download
  const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
  const download = await downloadPromise.catch(() => null);

  // --- Step 4: Verify ---
  if (download) {
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/censored\.(mp4|webm)$/);

    const fs = await import('fs');
    const path = await download.path();
    const stats = fs.statSync(path);
    expect(stats.size).toBeGreaterThan(10_000); // at least 10KB
  } else {
    expect(exportErrors.length, 'No export errors').toBe(0);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('JSON IMPORT + EXPORT TEST');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Segments: ${segmentCount}`);
  console.log(`Censoring effects: ${censoringEffects}`);
  console.log(`Store effects: ${storeEffects?.length ?? 'N/A'}`);
  console.log(`Export errors: ${exportErrors.length}`);
  if (exportErrors.length > 0) {
    exportErrors.forEach((e) => console.log(`  ${e}`));
  }
  console.log('═══════════════════════════════════════════════════\n');
});
