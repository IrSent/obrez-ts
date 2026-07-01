import { test, expect } from '@playwright/test';

test.describe('Video Playback', () => {
  test('loads a video file, plays it, and time progresses', async ({ page }) => {
    await page.goto('/');

    // 1. Click "Load File" to open the file picker
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;

    // 2. Set the test video file
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    // 3. Wait for the duration to be computed (right-side time display changes from "00:00")
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // 4. Record the initial current time (left-side time display)
    const currentTimeBefore = page.locator('span.text-xs.opacity-60').first();
    const initialTime = await currentTimeBefore.textContent();
    expect(initialTime).not.toBeNull();

    // 5. Video auto-plays after loading — just wait for playback to progress
    await page.waitForTimeout(5000);

    // 6. Check that current time has changed (playback is progressing)
    const currentTimeAfter = await page.locator('span.text-xs.opacity-60').first().textContent();
    expect(currentTimeAfter).not.toBe(initialTime);

    // 7. Verify no error is shown
    const errorText = page.locator('text=Playback failed');
    await expect(errorText).not.toBeVisible();
  });

  test('pauses playback and time stops changing', async ({ page }) => {
    await page.goto('/');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    // Wait for file to load
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15000 });

    // Video auto-plays — wait a bit then pause
    await page.waitForTimeout(3000);

    // Hover the canvas to reveal controls
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);

    // Ensure video is playing before pausing (autoplay may be blocked)
    const playButton = page.getByRole('button', { name: /play/i });
    if (await playButton.isVisible().catch(() => false)) {
      await playButton.click();
      await page.waitForTimeout(2000);
    }

    // Now pause
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /pause/i }).click();

    // Record time immediately after pause
    const currentTimeAfterPause1 = await page.locator('span.text-xs.opacity-60').first().textContent();
    await page.waitForTimeout(3000);
    const currentTimeAfterPause2 = await page.locator('span.text-xs.opacity-60').first().textContent();

    // Compare seconds without milliseconds to allow for small tolerance
    const seconds1 = currentTimeAfterPause1?.match(/(\d{2}:\d{2})/)?.[1];
    const seconds2 = currentTimeAfterPause2?.match(/(\d{2}:\d{2})/)?.[1];
    expect(seconds2).toBe(seconds1);
  });
});
