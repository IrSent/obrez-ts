import { test, expect } from '@playwright/test';

/**
 * Quick diagnostic on ru-profanity2.mp4 — the file where user hears
 * rattling on all speeds including 1x.
 */
test('ru-profanity2 diagnostics', async ({ page }) => {
  const artifactPrefixes = [
    '[output-clip]', '[output-click]', '[output-rip]', '[output-blub]',
    '[output-hf-jump]', '[output-rip-mid]', '[sand]', '[clipping]',
    '[st-underrun]', '[gap]', '[audio]',
  ];

  const logs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (artifactPrefixes.some(p => text.includes(p))) {
      logs.push(text);
    }
  });

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity2.mp4');

  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 30_000 });

  // Play at 1x for 8 seconds — listen for rattling
  await page.waitForTimeout(8_000);

  // Change to 1.5x
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '1x' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '1.5x' }).click();
  await page.waitForTimeout(5_000);

  // Change to 2x
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '1.5x' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '2x' }).click();
  await page.waitForTimeout(5_000);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('RU-PROFANITY2 DIAGNOSTIC REPORT');
  console.log('═══════════════════════════════════════════════════');
  for (const l of logs) console.log(`  ${l}`);
  console.log(`Total diagnostic events: ${logs.length}`);

  const clicks = logs.filter(l => l.includes('[output-click]')).length;
  const rips = logs.filter(l => l.includes('[output-rip]')).length;
  const sands = logs.filter(l => l.includes('[sand]')).length;
  const gaps = logs.filter(l => l.includes('[gap]')).length;
  const underruns = logs.filter(l => l.includes('[st-underrun]')).length;
  const clips = logs.filter(l => l.includes('[output-clip]')).length;

  console.log(`\nclicks=${clicks} rips=${rips} sand=${sands} gaps=${gaps} underruns=${underruns} clips=${clips}`);
});
