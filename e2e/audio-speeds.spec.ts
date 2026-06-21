import { test, expect } from '@playwright/test';

/**
 * Audio Quality at Different Playback Speeds
 *
 * Cycles through 1.0x → 1.25x → 1.5x → 1.75x → 2.0x,
 * collecting console diagnostics ([st-underrun], [sand], [clipping], [gap], [audio])
 * at each speed to identify audio artifacts.
 *
 * Underrun analysis:
 * - The first underrun event at a new speed often includes accumulated underruns
 *   from the previous speed (e.g., at 1x, underruns aren't logged because
 *   curSpeed <= 1, but they still accumulate in SoundTouch's counter).
 * - The `total` field in [st-underrun] logs lets us compute the delta from
 *   the previous speed's final total, separating initial carry-over from new.
 */
test.describe('Audio Quality — Playback Speeds', () => {
  const SPEEDS = [1.0, 1.25, 1.5, 1.75, 2.0];
  const SPEED_LABEL = (s: number) => (s === 1 ? '1x' : s === 2 ? '2x' : `${s}x`);
  const PLAY_DURATION_MS = 5_000;
  const WARMUP_MS = 3_000;

  // Parse total from underrun log: "[st-underrun] +12 (total=58) ..."
  const parseUnderrunTotal = (line: string): number | null => {
    const m = line.match(/total=(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };

  test('cycle through speeds and collect audio diagnostics', async ({ page }) => {
    // ── Collect console ──────────────────────────────────────────────
    const speedLogs: Record<string, string[]> = { init: [] };
    for (const s of SPEEDS) speedLogs[SPEED_LABEL(s)] = [];
    let currentSpeedKey = 'init';

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[') && (
        text.includes('[st-underrun]') ||
        text.includes('[sand]') ||
        text.includes('[clipping]') ||
        text.includes('[gap]') ||
        text.includes('[audio]')
      )) {
        speedLogs[currentSpeedKey]?.push(text);
      }
    });

    // ── Navigate and load ────────────────────────────────────────────
    await page.goto('/');

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Load File' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('e2e/valid-with-aac.mp4');

    const durationText = page.locator('span.text-xs.opacity-60').last();
    await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

    await page.waitForTimeout(2_000);

    // ── Helpers ──────────────────────────────────────────────────────
    const readTime = async () => {
      return page.locator('span.text-xs.opacity-60').first().textContent();
    };

    const changeSpeed = async (currentSpeedLabel: string, target: number) => {
      await page.locator('canvas[aria-label="Video canvas"]').hover();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: currentSpeedLabel }).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: SPEED_LABEL(target) }).click();
      await page.waitForTimeout(WARMUP_MS);
    };

    // ── Play at each speed ───────────────────────────────────────────
    let prevSpeed = 1.0;
    for (const speed of SPEEDS) {
      const key = SPEED_LABEL(speed);
      currentSpeedKey = key;

      if (speed !== 1.0) {
        await changeSpeed(SPEED_LABEL(prevSpeed), speed);
      }
      prevSpeed = speed;

      const timeBefore = await readTime();
      await page.waitForTimeout(PLAY_DURATION_MS);
      const timeAfter = await readTime();

      expect(timeAfter).not.toBe(timeBefore);
      await expect(page.locator('text=Playback failed')).not.toBeVisible();

      // Compute effective playback rate
      // Parse time like "00:17.718" or "01:02.331" into seconds
      const parseTime = (t: string | null): number => {
        if (!t) return 0;
        const parts = t.split(':').map(s => parseFloat(s));
        return parts.length >= 2 ? parts[0] * 60 + parts[1] : parts[0];
      };
      const elapsed = parseTime(timeAfter) - parseTime(timeBefore);
      const effectiveRate = elapsed / (PLAY_DURATION_MS / 1000);

      console.log(
        `── ${key}: ${timeBefore} → ${timeAfter} | ` +
        `elapsed=${elapsed.toFixed(1)}s effectiveRate=${effectiveRate.toFixed(2)}x | ` +
        `diagnostics: ${speedLogs[key]?.length ?? 0} entries`
      );
    }

    // ── Structured report ────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════');
    console.log('AUDIO SPEED TEST — DIAGNOSTIC REPORT');
    console.log('═══════════════════════════════════════════════════');

    let prevTotalUnderrun: number | null = null;

    for (const speed of SPEEDS) {
      const key = SPEED_LABEL(speed);
      const logs = speedLogs[key] ?? [];

      console.log(`\n--- ${key} --- (${logs.length} diagnostic event(s))`);

      if (logs.length === 0) {
        console.log('  ✓ No issues detected');
        continue;
      }

      const underrunLogs = logs.filter(l => l.includes('[st-underrun]'));
      const sandLogs = logs.filter(l => l.includes('[sand]'));
      const clipLogs = logs.filter(l => l.includes('[clipping]'));
      const gapLogs = logs.filter(l => l.includes('[gap]'));
      const infoLogs = logs.filter(l => l.includes('[audio]'));

      // Analyze underruns
      if (underrunLogs.length > 0) {
        const firstTotal = parseUnderrunTotal(underrunLogs[0]);
        const lastTotal = parseUnderrunTotal(underrunLogs[underrunLogs.length - 1]);
        const newAtThisSpeed = lastTotal != null && prevTotalUnderrun != null
          ? lastTotal - prevTotalUnderrun
          : null;

        console.log(`  ⚠ Underrun events: ${underrunLogs.length}`);
        if (firstTotal != null) console.log(`    First total: ${firstTotal}`);
        if (lastTotal != null) console.log(`    Last total:  ${lastTotal}`);
        if (newAtThisSpeed != null) {
          const initial = firstTotal != null ? firstTotal - (prevTotalUnderrun ?? 0) : '?';
          const rest = lastTotal != null && firstTotal != null ? lastTotal - firstTotal : '?';
          console.log(`    New at this speed: ${newAtThisSpeed} (initial carry-over: ${initial}, rest: ${rest})`);
        }
        prevTotalUnderrun = lastTotal ?? prevTotalUnderrun;
      }

      if (sandLogs.length) console.log(`  ⚠ Sand: ${sandLogs.length}`);
      if (clipLogs.length) console.log(`  ⚠ Clipping: ${clipLogs.length}`);
      if (gapLogs.length) console.log(`  ⚠ Gaps: ${gapLogs.length}`);
      if (infoLogs.length) console.log(`  ℹ Info: ${infoLogs.length}`);

      for (const l of logs) {
        const truncated = l.length > 140 ? l.slice(0, 137) + '...' : l;
        console.log(`    ${truncated}`);
      }
    }

    // ── Totals ───────────────────────────────────────────────────────
    const allLogs = Object.values(speedLogs).flat();
    const totalUnderruns = allLogs.filter(l => l.includes('[st-underrun]')).length;
    const totalSands = allLogs.filter(l => l.includes('[sand]')).length;
    const totalClips = allLogs.filter(l => l.includes('[clipping]')).length;
    const totalGaps = allLogs.filter(l => l.includes('[gap]')).length;

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`TOTALS: underrun_events=${totalUnderruns} sand=${totalSands} clip=${totalClips} gap=${totalGaps}`);
    console.log('═══════════════════════════════════════════════════\n');

    // ── Assertions ───────────────────────────────────────────────────
    const finalTime = await readTime();
    expect(finalTime).not.toBe('00:00');
    // Clipping means real audio damage — must be 0.
    expect(totalClips).toBe(0);
    // Sand is a diagnostic indicator — 0-1 is acceptable (boundary noise).
    expect(totalSands).toBeLessThan(3);
    // Gaps mean buffer discontinuity — must be 0.
    expect(totalGaps).toBe(0);
  });
});
