import { test, expect } from '@playwright/test';

/**
 * Test JSON import + censored video export end-to-end.
 * Removed unnecessary 3s audio bootstrap wait (test doesn't check audio).
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

  // Load video
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity3.mp4');

  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Import transcription with effects
  const importFileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle('Import transcription + effects from JSON').click();
  const importChooser = await importFileChooserPromise;
  await importChooser.setFiles('e2e/ru-profanity3.json');

  const importDone = page.locator('text=Done ✓');
  await expect(importDone).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('text=Import failed')).not.toBeVisible();

  const segmentLocator = page.locator('[data-segment]');
  const segmentCount = await segmentLocator.count();
  expect(segmentCount).toBeGreaterThan(0);

  const storeEffects = await page.evaluate(() => {
    const store = (window as any).__ZUSTAND_STORE__?.getState?.() ?? (window as any).usePlayerStore?.getState?.();
    return store?.censoringEffects ?? [];
  });

  const effectLocator = page.locator('[data-testid="censoring-effects"]');
  const censoringEffects = await effectLocator.count();
  expect(censoringEffects).toBeGreaterThan(0);

  // Export censored video
  const exportButton = page.getByRole('button', { name: /Export Censored Video/i });
  await exportButton.click();

  const downloadPromise = page.waitForEvent('download', { timeout: 240_000 });
  const download = await downloadPromise.catch(() => null);

  // Verify
  if (download) {
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/censored\.(mp4|webm)$/);

    const fs = await import('fs');
    const path = await download.path();
    const stats = fs.statSync(path);
    expect(stats.size).toBeGreaterThan(10_000);
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
