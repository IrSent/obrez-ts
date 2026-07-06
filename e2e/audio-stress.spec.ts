import { test, expect } from '@playwright/test';

/**
 * Short stress test at 2x — 10s is enough to catch steady-state artifacts.
 * The audio pipeline processes in ~128ms chunks; 10s = ~80 chunks.
 */
test.describe('Audio Stress Test', () => {
  const artifactPrefixes = [
    '[output-clip]', '[output-click]', '[output-rip]', '[output-blub]',
    '[output-hf-jump]', '[output-rip-mid]', '[sand]', '[clipping]',
    '[st-underrun]', '[gap]',
  ];

  test('10s at 2x — no steady-state artifacts', async ({ page }) => {
    const allLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (artifactPrefixes.some(p => text.includes(p))) {
        allLogs.push(text);
      }
    });

    await page.goto('/');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
  const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/ru-profanity3.mp4');
    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

    // Switch to 2x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '2x' }).click();
    await page.waitForTimeout(2_000); // wait for transition

    const timeBefore = await page.locator('span.text-xs.opacity-60').first().textContent();

    // Play 10s at 2x
    await page.waitForTimeout(10_000);

    const timeAfter = await page.locator('span.text-xs.opacity-60').first().textContent();

    const parseTime = (t: string | null): number => {
      if (!t) return 0;
      const parts = t.split(':').map(s => parseFloat(s));
      return parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0];
    };

    const elapsed = parseTime(timeAfter) - parseTime(timeBefore);
    const effectiveRate = elapsed / 10;

    console.log('\n═══════════════════════════════════════════════════');
    console.log('STRESS TEST — 10s at 2x');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Time: ${timeBefore} → ${timeAfter} | elapsed=${elapsed.toFixed(1)}s | effectiveRate=${effectiveRate.toFixed(2)}x`);
    console.log(`Total diagnostic events: ${allLogs.length}`);

    const clips = allLogs.filter(l => l.includes('[output-clip]'));
    const clicks = allLogs.filter(l => l.includes('[output-click]'));
    const gaps = allLogs.filter(l => l.includes('[gap]'));
    const sands = allLogs.filter(l => l.includes('[sand]'));
    const underruns = allLogs.filter(l => l.includes('[st-underrun]'));

    if (clips.length) console.log(`  ⚠ Output clipping: ${clips.length}`);
    if (clicks.length) console.log(`  ⚠ Clicks: ${clicks.length}`);
    if (gaps.length) console.log(`  ⚠ Gaps: ${gaps.length}`);
    if (sands.length) console.log(`  ⚠ Sand: ${sands.length}`);
    if (underruns.length) console.log(`  ⚠ Underruns: ${underruns.length}`);

    if (allLogs.length === 0) {
      console.log('  ✓ No artifacts in 10s at 2x');
    } else {
      for (const l of allLogs) console.log(`    ${l.slice(0, 140)}`);
    }

    expect(effectiveRate).toBeGreaterThan(1.7);
    expect(effectiveRate).toBeLessThan(2.4);
    expect(clips.length, 'no clipping').toBe(0);
    expect(clicks.length, 'clicks < 3').toBeLessThan(3);
    expect(sands.length, 'sand < 5').toBeLessThan(5);
    expect(underruns.length, 'underruns < 3').toBeLessThan(3);

    console.log('═══════════════════════════════════════════════════\n');
  });
});
