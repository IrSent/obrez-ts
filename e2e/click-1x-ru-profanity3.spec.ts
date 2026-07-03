import { test, expect } from '@playwright/test';

/**
 * Regression test: bufGain started at 0.5 on every buffer, creating a
 * 1→0.5 amplitude dip at each boundary at 1x (PhaseVocoderNode bypassed).
 * Reduced from 10s to 3s — 3s at 1x = ~100 buffers, enough to catch clicks.
 */
test('no output-clicks on valid-with-aac.mp4 at 1x', async ({ page }) => {
  const clicks: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[output-click]')) clicks.push(text);
  });

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/valid-with-aac.mp4');
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Play 3s at 1x
  await page.waitForTimeout(3_000);

  console.log(`[click-1x] events: ${clicks.length}`);
  if (clicks.length > 0) {
    for (const c of clicks) console.log(`  ${c}`);
  }

  expect(clicks.length).toBe(0);
});
