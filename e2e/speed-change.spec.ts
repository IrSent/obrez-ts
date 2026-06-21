import { test, expect } from '@playwright/test';

test.describe('Playback Speed Change — Audio Artifacts', () => {
  test('changing to 2x and back produces no errors and playback continues', async ({ page }) => {
    await page.goto('/');

    // 1. Load test video
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    // 2. Wait for the file to load
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // 3. Video auto-plays — wait a bit then record time
    await page.waitForTimeout(2000);
    const timeBeforeSpeed = await page.locator('span.text-xs.opacity-60').first().textContent();
    expect(timeBeforeSpeed).not.toBeNull();

    // 4. Hover the canvas to reveal controls, then click the speed button ("1x")
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '1x' }).click();

    // 5. The speed menu appears — select "2x"
    await page.getByRole('button', { name: '2x' }).click();

    // 6. Wait for speed to take effect and playback to progress faster
    await page.waitForTimeout(4000);

    const timeAt2x = await page.locator('span.text-xs.opacity-60').first().textContent();
    expect(timeAt2x).not.toBeNull();
    expect(timeAt2x).not.toBe(timeBeforeSpeed);

    // 7. Open speed menu again and change back to 1x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '2x' }).click();
    await page.getByRole('button', { name: '1x' }).click();

    // 8. Wait for speed to take effect
    await page.waitForTimeout(3000);

    const timeAfter1x = await page.locator('span.text-xs.opacity-60').first().textContent();
    expect(timeAfter1x).not.toBeNull();
    expect(timeAfter1x).not.toBe(timeAt2x);

    // 9. Verify no error is shown
    const errorText = page.locator('text=Playback failed');
    await expect(errorText).not.toBeVisible();
  });
});
