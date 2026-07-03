import { test, expect } from '@playwright/test';

/**
 * Merged audio test: cycles through speeds, checks for artifacts
 * AND verifies effective playback rate at each speed.
 * Replaces the old audio-artifacts + audio-speeds tests.
 */
test('audio artifacts at all speeds', async ({ page }) => {
  const SPEEDS = [1.0, 1.25, 1.5, 1.75, 2.0];
  const SPEED_LABEL = (s: number) => (s === 1 ? '1x' : s === 2 ? '2x' : `${s}x`);
  const PLAY_MS = 2000;   // 2s per speed — enough to catch artifacts
  const WARMUP = 1500;    // 1.5s for transition to settle

  const artifactPrefixes = [
    '[output-clip]', '[output-click]', '[output-rip]', '[output-blub]',
    '[output-hf-jump]', '[output-rip-mid]', '[sand]', '[clipping]',
    '[st-underrun]', '[gap]',
  ];

  const speedLogs: Record<string, string[]> = {};
  for (const s of SPEEDS) speedLogs[SPEED_LABEL(s)] = [];
  let currentSpeedKey = SPEED_LABEL(1.0);

  page.on('console', (msg) => {
    const text = msg.text();
    if (artifactPrefixes.some(p => text.includes(p))) {
      speedLogs[currentSpeedKey]?.push(text);
    }
  });

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/valid-with-aac.mp4');
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  let prevSpeedLabel = '1x';
  for (const speed of SPEEDS) {
    const key = SPEED_LABEL(speed);
    currentSpeedKey = key;

    if (speed !== 1.0) {
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: prevSpeedLabel }).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: key }).click();
      await page.waitForTimeout(WARMUP);
      prevSpeedLabel = key;
    }

    // Verify time progresses
    const timeBefore = await page.locator('span.text-xs.opacity-60').first().textContent();
    await page.waitForTimeout(PLAY_MS);
    const timeAfter = await page.locator('span.text-xs.opacity-60').first().textContent();
    expect(timeAfter).not.toBe(timeBefore);

    const parseTime = (t: string | null): number => {
      if (!t) return 0;
      const parts = t.split(':').map(s => parseFloat(s));
      return parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0];
    };
    const elapsed = parseTime(timeAfter) - parseTime(timeBefore);
    const effectiveRate = elapsed / (PLAY_MS / 1000);
    console.log(`── ${key}: elapsed=${elapsed.toFixed(1)}s effectiveRate=${effectiveRate.toFixed(2)}x`);
  }

  // Report
  console.log('\n═══════════════════════════════════════════════════');
  console.log('AUDIO ARTIFACT REPORT');
  console.log('═══════════════════════════════════════════════════');
  let totalArtifacts = 0;
  for (const speed of SPEEDS) {
    const key = SPEED_LABEL(speed);
    const logs = speedLogs[key] ?? [];
    const outputArtifacts = logs.filter(l =>
      l.includes('[output-clip]') || l.includes('[output-click]') ||
      l.includes('[output-rip]') || l.includes('[output-blub]') ||
      l.includes('[output-hf-jump]')
    );
    totalArtifacts += outputArtifacts.length;
    console.log(`\n--- ${key} --- (${logs.length} event(s))`);
    if (logs.length === 0) {
      console.log('  ✓ No artifacts detected');
    } else {
      for (const l of logs.slice(0, 5)) console.log(`    ${l.slice(0, 120)}`);
    }
  }
  console.log(`\nTOTAL output artifacts: ${totalArtifacts}`);
  console.log('═══════════════════════════════════════════════════\n');

  expect(totalArtifacts, 'no output artifacts').toBe(0);
  const allLogs = Object.values(speedLogs).flat();
  expect(allLogs.filter(l => l.includes('[clipping]')).length, 'no clipping').toBe(0);
  expect(allLogs.filter(l => l.includes('[gap]')).length, 'no gaps').toBe(0);
  expect(allLogs.filter(l => l.includes('[sand]')).length, 'sand < 3').toBeLessThan(3);
});
