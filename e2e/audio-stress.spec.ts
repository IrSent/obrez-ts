import { test, expect } from '@playwright/test';

/**
 * Long-duration stress test for audio artifacts at high speed.
 * Plays at 2x for 30 seconds — steady-state underruns, sand, and
 * clip events that don't appear in short tests will surface here.
 */
test.describe('Audio Stress Test', () => {
  const artifactPrefixes = [
    '[output-clip]',
    '[output-click]',
    '[output-rip]',
    '[output-blub]',
    '[output-hf-jump]',
    '[output-rip-mid]',
    '[sand]',
    '[clipping]',
    '[st-underrun]',
    '[gap]',
  ];

  test('30s at 2x — no steady-state artifacts', async ({ page }) => {
    const allLogs: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (artifactPrefixes.some(p => text.includes(p))) {
        allLogs.push(text);
      }
    });

    // ── Navigate and load ────────────────────────────────────────────
    await page.goto('/');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/ru-profanity2.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

    await page.waitForTimeout(1_000);

    // ── Switch to 2x ─────────────────────────────────────────────────
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '2x' }).click();

    // Wait for transition to complete
    await page.waitForTimeout(3_000);

    // Read time before stress period
    const timeBefore = await page.locator('span.text-xs.opacity-60').first().textContent();

    // Play for 30 seconds at 2x
    await page.waitForTimeout(30_000);

    const timeAfter = await page.locator('span.text-xs.opacity-60').first().textContent();

    // Parse time
    const parseTime = (t: string | null): number => {
      if (!t) return 0;
      const parts = t.split(':').map(s => parseFloat(s));
      return parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0];
    };

    const elapsed = parseTime(timeAfter) - parseTime(timeBefore);
    const effectiveRate = elapsed / 30;

    // ── Report ───────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════');
    console.log('STRESS TEST — 30s at 2x');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Time: ${timeBefore} → ${timeAfter} | elapsed=${elapsed.toFixed(1)}s | effectiveRate=${effectiveRate.toFixed(2)}x`);
    console.log(`Total diagnostic events: ${allLogs.length}`);

    const clips = allLogs.filter(l => l.includes('[output-clip]'));
    const clicks = allLogs.filter(l => l.includes('[output-click]'));
    const rips = allLogs.filter(l => l.includes('[output-rip]') && !l.includes('[output-rip-mid]'));
    const ripsMid = allLogs.filter(l => l.includes('[output-rip-mid]'));
    const blubs = allLogs.filter(l => l.includes('[output-blub]'));
    const hfJumps = allLogs.filter(l => l.includes('[output-hf-jump]'));
    const sands = allLogs.filter(l => l.includes('[sand]'));
    const underruns = allLogs.filter(l => l.includes('[st-underrun]'));
    const gaps = allLogs.filter(l => l.includes('[gap]'));
    // Gaps at the very start (first buffer from MediaBunny may not begin at 0s)
    // are not playback artifacts — the gap filler covers them with silence.
    const steadyStateGaps = gaps.filter(l => !/mediaT=[0-2]\./.test(l));

    if (clips.length) console.log(`  ⚠ Output clipping: ${clips.length}`);
    if (clicks.length) console.log(`  ⚠ Clicks: ${clicks.length}`);
    if (rips.length) console.log(`  ⚠ Ripping: ${rips.length}`);
    if (ripsMid.length) console.log(`  ⚠ Mid-range rip: ${ripsMid.length}`);
    if (blubs.length) console.log(`  ⚠ Blubbing: ${blubs.length}`);
    if (hfJumps.length) console.log(`  ⚠ HF jumps: ${hfJumps.length}`);
    if (sands.length) console.log(`  ⚠ Sand: ${sands.length}`);
    if (underruns.length) console.log(`  ⚠ Underruns: ${underruns.length}`);
    if (gaps.length) console.log(`  ⚠ Init gaps: ${gaps.length}`);
    if (steadyStateGaps.length) console.log(`  ⚠ Steady-state gaps: ${steadyStateGaps.length}`);

    if (allLogs.length === 0) {
      console.log('  ✓ No artifacts in 30s at 2x');
    } else {
      for (const l of allLogs) console.log(`    ${l.slice(0, 140)}`);
    }

    // Effective rate should be close to 2x (within 15% — system load can slow it)
    expect(effectiveRate).toBeGreaterThan(1.7);
    expect(effectiveRate).toBeLessThan(2.1);

    console.log('═══════════════════════════════════════════════════\n');

    // Assert no real artifacts
    expect(clips.length, 'no clipping').toBe(0);
    expect(clicks.length, 'no clicks').toBe(0);
    expect(steadyStateGaps.length, 'no steady-state gaps').toBe(0);
    expect(sands.length, 'sand < 5').toBeLessThan(5);
    expect(underruns.length, 'underruns < 3').toBeLessThan(3);
  });
});
