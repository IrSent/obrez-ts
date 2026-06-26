import { test, expect } from '@playwright/test';

/**
 * Output Audio Artifact Analysis
 *
 * Cycles through speeds, capturing console diagnostics from the output
 * analyser that detects real artifacts:
 * - [output-clip] — clipping at the speaker (not just PhaseVocoderNode input)
 * - [output-click] — buffer discontinuities (clicks > 0.5 delta)
 * - [output-rip] — HF bursts (ripping artifact)
 * - [output-blub] — LF spikes (blubbing artifact)
 * - [sand] — sustained HF noise (graininess)
 * - [clipping] — pre-compressor peaks
 * - [st-underrun] — PhaseVocoderNode FIFO underruns
 * - [gap] — buffer gaps
 */
test.describe('Output Audio Artifacts', () => {
  const SPEEDS = [1.0, 1.25, 1.5, 1.75, 2.0];
  const SPEED_LABEL = (s: number) => (s === 1 ? '1x' : s === 2 ? '2x' : `${s}x`);
  const PLAY_DURATION_MS = 4000;
  const WARMUP_MS = 2000; // wait for transition to settle

  // Artifact log prefixes to capture
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

  test('detect artifacts at each speed', async ({ page }) => {
    // ── Collect console ──────────────────────────────────────────────
    const speedLogs: Record<string, string[]> = {};
    for (const s of SPEEDS) speedLogs[SPEED_LABEL(s)] = [];
    let currentSpeedKey = SPEED_LABEL(1.0);

    page.on('console', (msg) => {
      const text = msg.text();
      if (artifactPrefixes.some(p => text.includes(p))) {
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

    await page.waitForTimeout(1_000);

    // ── Play at each speed ───────────────────────────────────────────
    let prevSpeedLabel = '1x';

    for (const speed of SPEEDS) {
      const key = SPEED_LABEL(speed);
      currentSpeedKey = key;

      if (speed !== 1.0) {
        // Change speed
        await page.locator('canvas[aria-label="Video canvas"]').hover();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: prevSpeedLabel }).click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: key }).click();
        await page.waitForTimeout(WARMUP_MS); // wait for transition
        prevSpeedLabel = key;
      }

      // Record artifacts during playback
      await page.waitForTimeout(PLAY_DURATION_MS);
    }

    // ── Structured report ────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════');
    console.log('OUTPUT ARTIFACT ANALYSIS REPORT');
    console.log('═══════════════════════════════════════════════════');

    let totalOutputArtifacts = 0;

    for (const speed of SPEEDS) {
      const key = SPEED_LABEL(speed);
      const logs = speedLogs[key] ?? [];

      console.log(`\n--- ${key} --- (${logs.length} event(s))`);

      if (logs.length === 0) {
        console.log('  ✓ No artifacts detected');
        continue;
      }

      const outputClips = logs.filter(l => l.includes('[output-clip]'));
      const outputClicks = logs.filter(l => l.includes('[output-click]'));
      const outputRips = logs.filter(l => l.includes('[output-rip]'));
      const outputBlubs = logs.filter(l => l.includes('[output-blub]'));
      const outputHfJumps = logs.filter(l => l.includes('[output-hf-jump]'));
      const sands = logs.filter(l => l.includes('[sand]'));
      const clips = logs.filter(l => l.includes('[clipping]'));
      const underruns = logs.filter(l => l.includes('[st-underrun]'));
      const gaps = logs.filter(l => l.includes('[gap]'));

      const outputArtifactCount = outputClips.length + outputClicks.length + outputRips.length + outputBlubs.length + outputHfJumps.length;
      totalOutputArtifacts += outputArtifactCount;

      if (outputClips.length) console.log(`  ⚠ Output clipping: ${outputClips.length}`);
      if (outputClicks.length) console.log(`  ⚠ Clicks: ${outputClicks.length}`);
      if (outputRips.length) console.log(`  ⚠ Ripping: ${outputRips.length}`);
      if (outputBlubs.length) console.log(`  ⚠ Blubbing: ${outputBlubs.length}`);
      if (outputHfJumps.length) console.log(`  ⚠ HF jumps (phase vocoder boundaries): ${outputHfJumps.length}`);
      if (sands.length) console.log(`  ⚠ Sand: ${sands.length}`);
      if (clips.length) console.log(`  ⚠ Pre-amp clips: ${clips.length}`);
      if (underruns.length) console.log(`  ⚠ Underruns: ${underruns.length}`);
      if (gaps.length) console.log(`  ⚠ Gaps: ${gaps.length}`);

      // Show first few logs for context
      for (const l of logs.slice(0, 5)) {
        console.log(`    ${l.slice(0, 120)}`);
      }
      if (logs.length > 5) console.log(`    ... +${logs.length - 5} more`);
    }

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`TOTAL output artifacts: ${totalOutputArtifacts}`);
    console.log('═══════════════════════════════════════════════════');

    // ── Summary of all logs ──────────────────────────────────────────
    const allLogs = Object.values(speedLogs).flat();
    console.log('\n── All diagnostic logs: ──');
    for (const l of allLogs) console.log(`  ${l.slice(0, 120)}`);
  });
});
