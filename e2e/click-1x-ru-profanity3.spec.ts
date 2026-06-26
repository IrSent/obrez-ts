import { test, expect } from '@playwright/test';

/**
 * Check for [output-click] on ru-profanity3.mp4 at 1x speed.
 *
 * Regression test: bufGain started at 0.5 on every buffer, creating a
 * 1→0.5 amplitude dip at each boundary. At 1x (PhaseVocoderNode bypassed) this
 * is clearly audible and triggers the click detector repeatedly.
 */
test('no output-clicks on ru-profanity3.mp4 at 1x', async ({ page }) => {
  const clicks: string[] = [];
  const allArtifacts: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[output-click]')) clicks.push(text);
    if (text.match(/\[(output-|clipping|gap|sand|st-underrun)\]/)) allArtifacts.push(text);
  });

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity3.mp4');

  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Wait for bootstrap, then play 10s at 1x to collect diagnostics
  await page.waitForTimeout(3_000);
  await page.waitForTimeout(10_000);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('CLICK TEST — ru-profanity3.mp4 at 1x');
  console.log('═══════════════════════════════════════════════════');
  console.log(`[output-click] events: ${clicks.length}`);

  if (allArtifacts.length) {
    console.log(`\nAll artifacts (${allArtifacts.length}):`);
    for (const a of allArtifacts) console.log(`  ${a.slice(0, 120)}`);
  }

  if (clicks.length === 0) {
    console.log('✓ No clicks detected at 1x');
  } else {
    console.log('\nClicks:');
    for (const c of clicks) console.log(`  ${c}`);
  }

  expect(clicks.length).toBe(0);
});
