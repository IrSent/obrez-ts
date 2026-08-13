import { test, expect } from '@playwright/test';

/**
 * Silence Effects Test
 *
 * Verifies that when censoring mode is ON and silence effects are applied,
 * the gainNode.gain is dampened during the censored segments.
 *
 * We CANNOT use __audioDiagnostic.analyserRms — the analyser sits BEFORE
 * gainNode in the audio chain. Silence sets gainNode.gain to 0, but the
 * analyser sees the full signal.
 *
 * Instead we read gainNode.gain.value directly and verify it drops to ~0
 * during silence segments and restores after.
 *
 * Silence segments in ru-profanity3-silence.json:
 *   0.144 – 0.824  ("аборигенам")
 *   1.936 – 2.456  ("красавицу")
 *   4.495 – 5.015  ("случилось")
 */
test('silence effects mute audio during censored segments', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/', { waitUntil: 'networkidle' });

  // Load audio file
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity3.mp4');

  // Wait for duration to be computed
  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Import silence effects
  const importFileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle('Import transcription + effects from JSON').click();
  const importChooser = await importFileChooserPromise;
  await importChooser.setFiles('e2e/ru-profanity3-silence.json');

  const importDone = page.locator('text=Done ✓');
  await expect(importDone).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('text=Import failed')).not.toBeVisible();

  // Verify effects are loaded (EffectBadge in DOM)
  const effectCount = await page.locator('[data-testid="censoring-effects"]').count();
  expect(effectCount, 'silence effects should be visible').toBeGreaterThan(0);

  // Verify censoring mode is ON (default)
  const censoredBtn = page.getByText(/Censored/i);
  await expect(censoredBtn).toBeVisible();

  // Start collecting: gain value + playback time + analyser rms
  await page.evaluate(() => {
    (window as any).__silenceSamples = [];
    (window as any).__silencePoll = setInterval(() => {
      const diag = (window as any).__audioDiagnostic;
      if (diag) {
        (window as any).__silenceSamples.push({
          time: typeof diag.getPlaybackTime === 'function' ? diag.getPlaybackTime() : (diag.getPlaybackTime ?? 0),
          rms: diag.analyserRms ?? 0,
          gain: diag.gainNode ?? null,
          state: diag.playbackState,
        });
      }
    }, 50);
  });

  // Click play if needed
  await page.getByLabel('Video canvas').hover();
  await page.waitForTimeout(500);

  const playBtn = page.getByRole('button', { name: /play/i });
  if (await playBtn.isVisible().catch(() => false)) {
    await playBtn.click();
    await page.waitForTimeout(500);
  }

  // Play for 6 seconds — enough to cover all 3 silence segments
  await page.waitForTimeout(6500);

  // Stop collecting
  const collected = await page.evaluate(() => {
    clearInterval((window as any).__silencePoll);
    return (window as any).__silenceSamples;
  });

  expect(collected.length, 'should have collected samples').toBeGreaterThan(0);
  console.log(`Collected ${collected.length} samples over ${(collected[collected.length - 1].time - collected[0].time).toFixed(1)}s`);

  // Define silence windows (with margin for timing imprecision)
  const silenceWindows = [
    { label: 'аборигенам', start: 0.1, end: 0.9 },
    { label: 'красавицу', start: 1.85, end: 2.55 },
    { label: 'случилось', start: 4.4, end: 5.1 },
  ];

  // Non-silence windows (between silence segments)
  const soundWindows = [
    { label: 'before first', start: 0, end: 0.1 },
    { label: 'between 1-2', start: 0.9, end: 1.85 },
    { label: 'between 2-3', start: 2.55, end: 4.4 },
  ];

  // Check that silence windows have low gain (silence dampens to ~0)
  for (const win of silenceWindows) {
    const winSamples = collected.filter(s => s.time >= win.start && s.time <= win.end);
    expect(winSamples.length, `samples in silence window "${win.label}"`).toBeGreaterThan(0);

    const avgGain = winSamples.reduce((a, b) => a + (b.gain ?? 0), 0) / winSamples.length;
    const minGain = Math.min(...winSamples.map(s => s.gain ?? 1));

    console.log(`Silence "${win.label}" [${win.start}–${win.end}s]: avgGain=${avgGain.toFixed(4)} minGain=${minGain.toFixed(4)} samples=${winSamples.length}`);

    // During silence, gain should be near zero
    // Allow some margin — the effect triggers at segment start and restores at end.
    // Most samples in the window should have low gain.
    const lowGainSamples = winSamples.filter(s => (s.gain ?? 1) < 0.1);
    const lowGainPct = lowGainSamples.length / winSamples.length;
    expect(lowGainPct, `low gain samples in silence "${win.label}" should be > 50%`).toBeGreaterThan(0.5);
  }

  // Check that sound windows have normal gain (not dampened)
  for (const win of soundWindows) {
    const winSamples = collected.filter(s => s.time >= win.start && s.time <= win.end);
    if (winSamples.length === 0) continue;

    const avgGain = winSamples.reduce((a, b) => a + (b.gain ?? 0), 0) / winSamples.length;
    const minGain = Math.min(...winSamples.map(s => s.gain ?? 0));

    console.log(`Sound "${win.label}" [${win.start}–${win.end}s]: avgGain=${avgGain.toFixed(4)} minGain=${minGain.toFixed(4)} samples=${winSamples.length}`);

    // Outside silence, gain should be normal (volume ** 2 ≈ 0.25)
    expect(avgGain, `avg gain in sound "${win.label}" should be normal`).toBeGreaterThan(0.1);
  }

  // Verify no freeze — time should have progressed to ~5-6s
  const finalTime = collected[collected.length - 1].time;
  expect(finalTime, 'playback time should have progressed past last silence').toBeGreaterThan(5);

  // Summary
  console.log('\n═══════════════════════════════════════════════════');
  console.log('SILENCE EFFECTS TEST — RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Samples: ${collected.length}`);
  console.log(`Final time: ${finalTime.toFixed(1)}s`);
  console.log(`Effects visible: ${effectCount}`);
  console.log('═══════════════════════════════════════════════════\n');
});

/**
 * Test that silence effects do NOT dampen audio when censoring mode is OFF.
 */
test('silence effects are inactive when censoring mode is OFF', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/', { waitUntil: 'networkidle' });

  // Load audio file
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles('e2e/ru-profanity3.mp4');

  const durationText = page.locator('span.text-xs.opacity-60').last();
  await expect(durationText).not.toHaveText(/^00:00/, { timeout: 15_000 });

  // Import silence effects
  const importFileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle('Import transcription + effects from JSON').click();
  const importChooser = await importFileChooserPromise;
  await importChooser.setFiles('e2e/ru-profanity3-silence.json');

  await expect(page.locator('text=Done ✓')).toBeVisible({ timeout: 30_000 });

  // Turn OFF censoring mode — click the Censored button
  await page.getByText(/Censored/i).click();
  await page.waitForTimeout(200);

  // Start collecting
  await page.evaluate(() => {
    (window as any).__silenceSamples = [];
    (window as any).__silencePoll = setInterval(() => {
      const diag = (window as any).__audioDiagnostic;
      if (diag) {
        (window as any).__silenceSamples.push({
          time: typeof diag.getPlaybackTime === 'function' ? diag.getPlaybackTime() : (diag.getPlaybackTime ?? 0),
          rms: diag.analyserRms ?? 0,
          gain: diag.gainNode ?? null,
          state: diag.playbackState,
        });
      }
    }, 50);
  });

  // Play
  await page.getByLabel('Video canvas').hover();
  await page.waitForTimeout(300);

  const playBtn = page.getByRole('button', { name: /play/i });
  if (await playBtn.isVisible().catch(() => false)) {
    await playBtn.click();
    await page.waitForTimeout(500);
  }

  // Play for 2 seconds — covers the first silence window (0.144–0.824)
  await page.waitForTimeout(2500);

  const collected = await page.evaluate(() => {
    clearInterval((window as any).__silencePoll);
    return (window as any).__silenceSamples;
  });

  expect(collected.length, 'should have collected samples').toBeGreaterThan(0);

  // With censoring mode OFF, gain should be normal (0.25 = volume^2) EVERYWHERE.
  // No need to check specific silence windows — if any sample has gain near 0,
  // it means the silence effect was applied despite censoring being OFF.
  const lowGainSamples = collected.filter(s => (s.gain ?? 1) < 0.1);
  const avgGain = collected.reduce((a, b) => a + (b.gain ?? 0), 0) / collected.length;

  console.log(`With censoring OFF: avgGain=${avgGain.toFixed(4)}, lowGainSamples=${lowGainSamples.length}/${collected.length}`);

  expect(lowGainSamples.length, 'no samples should have low gain when censoring is OFF').toBe(0);
  expect(avgGain, 'avg gain should be normal when censoring is OFF').toBeGreaterThan(0.1);

  // No freeze
  const finalTime = collected[collected.length - 1].time;
  expect(finalTime, 'playback should have progressed').toBeGreaterThan(2);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('SILENCE EFFECTS OFF TEST — RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Samples: ${collected.length}`);
  console.log(`Final time: ${finalTime.toFixed(1)}s`);
  console.log(`Avg gain in silence window: ${avgGain.toFixed(4)} (should be normal)`);
  console.log('═══════════════════════════════════════════════════\n');
});
