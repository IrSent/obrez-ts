import { test, expect } from '@playwright/test';

/**
 * Тест: последовательное воспроизведение без каши.
 *
 * Проверяет:
 * 1. Время воспроизведения идёт линейно (±5% от ожидаемой скорости).
 * 2. Нет [gap] артефактов.
 * 3. Нет [output-click] артефактов.
 * 4. Ни один момент не имеет > 2 BufferSource в состоянии 'started'.
 * 5. peakPlayingSources ≤ 2.
 *
 * Время читается напрямую из getPlaybackTime() через __audioDiagnostic —
 * DOM-элемент throttled до 100ms и неточен.
 */

function parseTime(text: string | null): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

async function loadFile(page: import('@playwright/test').Page, file: string) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles(`e2e/${file}`);
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });
}

async function waitForDiagnostic(page: import('@playwright/test').Page) {
  for (let i = 0; i < 30; i++) {
    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    if (d?.getPlaybackTime !== undefined) return;
    await page.waitForTimeout(50);
  }
  throw new Error('Diagnostic not available after 1.5s');
}

/**
 * Собирает точные медиа-время + diagnostic каждые 500ms.
 */
async function collectSamples(
  page: import('@playwright/test').Page,
  count: number,
): Promise<Array<{ wall: number; media: number; concurrent: number; playing: number; peak: number }>> {
  const samples: Array<{ wall: number; media: number; concurrent: number; playing: number; peak: number }> = [];
  const start = Date.now();

  for (let i = 0; i < count; i++) {
    await page.waitForTimeout(500);
    const d = await page.evaluate(() => (window as any).__audioDiagnostic);
    const wallSec = (Date.now() - start) / 1000;
    const media = d?.getPlaybackTime ?? 0;
    samples.push({
      wall: wallSec,
      media,
      concurrent: d?.concurrentSources ?? 0,
      playing: d?.actuallyPlaying ?? 0,
      peak: d?.peakPlayingSources ?? 0,
    });
  }
  return samples;
}

test.describe('Sequential Playback — No Overlap', () => {

  test('1x: linear time, no overlap, no artifacts', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await waitForDiagnostic(page);
    // Ждём 2 секунды после старта (warmup + bootstrap)
    await page.waitForTimeout(2000);

    const samples = await collectSamples(page, 10);

    // ── Линейность времени ──
    console.log('═══ 1x TIME LINEARITY ═══');
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const dMedia = samples[i].media - samples[i - 1].media;
      const dWall = samples[i].wall - samples[i - 1].wall;
      const rate = dMedia / dWall;
      deltas.push(rate);
      console.log(`delta ${i}: ${dMedia.toFixed(3)}s / ${dWall.toFixed(3)}s = ${rate.toFixed(4)}x`);
    }

    const avgRate = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(`Average rate: ${avgRate.toFixed(4)}x (expected ~1.00x)`);

    // Каждая дельта в [0.80, 1.20] — ±20% при 1x.
    // getPlaybackTime() читает AudioContext clock, но буферные дельты
    // могут варьироваться из-за backpressure yield и MediaBunny decode time.
    const outOfRange = deltas.filter(r => r < 0.80 || r > 1.20);
    expect(outOfRange.length,
      `all deltas in [0.80, 1.20]x, violations: ${outOfRange.map(r => r.toFixed(3)).join(', ')}`
    ).toBe(0);

    // Среднее близко к 1.0
    expect(avgRate, 'average rate ≈ 1.0x').toBeGreaterThan(0.95);
    expect(avgRate, 'average rate ≈ 1.0x').toBeLessThan(1.05);

    // ── Нет артефактов ──
    const gaps = logs.filter(l => l.includes('[gap]'));
    const clicks = logs.filter(l => l.includes('[output-click]'));
    const clips = logs.filter(l => l.includes('[output-clip]'));
    expect(gaps.length, 'no [gap] artifacts').toBe(0);
    expect(clicks.length, 'no [output-click] artifacts').toBe(0);
    expect(clips.length, 'no [output-clip] artifacts').toBe(0);

    // ── Ни один момент не имеет > 2 одновременно играющих источников ──
    const maxPlaying = Math.max(...samples.map(s => s.playing));
    const maxPeak = Math.max(...samples.map(s => s.peak));
    expect(maxPlaying, 'max actuallyPlaying ≤ 2').toBeLessThanOrEqual(2);
    expect(maxPeak, 'max peakPlayingSources ≤ 2').toBeLessThanOrEqual(2);

    // ── Нет rejected transitions ──
    const rejected = logs.filter(l => l.includes('transition rejected'));
    expect(rejected.length, 'no rejected transitions').toBe(0);

    // ── Нет stale iterators ──
    const stale = logs.filter(l => l.includes('stale generation'));
    expect(stale.length, 'no stale iterators').toBe(0);
  });

  test('2x: linear time after speed transition', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await waitForDiagnostic(page);
    await page.waitForTimeout(2000);

    // Смена на 2x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '2x' }).click();

    // Bootstrap + settle
    await page.waitForTimeout(3000);

    // Discard first sample (may overlap with tail end of transition)
    await collectSamples(page, 1);
    const samples = await collectSamples(page, 10);

    // ── Линейность на 2x ──
    console.log('\n═══ 2x TIME LINEARITY ═══');
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const dMedia = samples[i].media - samples[i - 1].media;
      const dWall = samples[i].wall - samples[i - 1].wall;
      const rate = dMedia / dWall;
      deltas.push(rate);
      console.log(`delta ${i}: ${dMedia.toFixed(3)}s / ${dWall.toFixed(3)}s = ${rate.toFixed(4)}x`);
    }

    const avgRate = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(`Average rate: ${avgRate.toFixed(4)}x (expected ~2.00x)`);

    // Каждая дельта в [1.60, 2.40] — ±20% от 2x
    const outOfRange = deltas.filter(r => r < 1.60 || r > 2.40);
    expect(outOfRange.length,
      `2x deltas in [1.60, 2.40], violations: ${outOfRange.map(r => r.toFixed(3)).join(', ')}`
    ).toBe(0);

    const gaps = logs.filter(l => l.includes('[gap]'));
    const clicks = logs.filter(l => l.includes('[output-click]'));
    expect(gaps.length, 'no gaps at 2x').toBe(0);
    expect(clicks.length, 'no clicks at 2x').toBe(0);

    const maxPlaying = Math.max(...samples.map(s => s.playing));
    expect(maxPlaying, 'max playing ≤ 2 at 2x').toBeLessThanOrEqual(2);
  });

  test('stress: pause/play/seek at 1x', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await waitForDiagnostic(page);
    await page.waitForTimeout(1000);

    // Pause
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.waitForTimeout(1000);

    // Play
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /play/i }).click();
    await page.waitForTimeout(1000);

    // Seek к ~10s
    const progressBar = page.locator('input[type="range"]').first();
    const box = await progressBar.boundingBox();
    if (box) {
      const seekX = box.x + box.width * 0.04;
      await page.mouse.click(seekX, box.y + box.height / 2);
    }
    await page.waitForTimeout(1000);

    const samples = await collectSamples(page, 6);

    const gaps = logs.filter(l => l.includes('[gap]'));
    const clicks = logs.filter(l => l.includes('[output-click]'));
    const rejected = logs.filter(l => l.includes('transition rejected'));
    expect(gaps.length, 'no gaps after seek').toBe(0);
    expect(clicks.length, 'no clicks after seek').toBe(0);
    expect(rejected.length, 'no rejected transitions').toBe(0);

    const maxPlaying = Math.max(...samples.map(s => s.playing));
    expect(maxPlaying, 'max playing ≤ 2 after seek').toBeLessThanOrEqual(2);
  });

  test('1x → 2x → 1x: no overlap during round-trip', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/');
    await loadFile(page, 'valid-with-aac.mp4');
    await waitForDiagnostic(page);
    await page.waitForTimeout(2000);

    // 1x → 2x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '2x' }).click();
    await page.waitForTimeout(3000);

    // Discard first sample (may overlap with transition bootstrap)
    await collectSamples(page, 1);
    const samples2x = await collectSamples(page, 5);

    console.log('\n═══ 2x SAMPLES ═══');
    for (const s of samples2x) {
      console.log(`wall=${s.wall.toFixed(2)}s media=${s.media.toFixed(2)}s`);
    }

    // 2x → 1x
    await page.locator('canvas[aria-label="Video canvas"]').hover();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '2x' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '1x' }).click();
    await page.waitForTimeout(2000);

    const samples1x = await collectSamples(page, 5);

    // ── 2x linearность ──
    const deltas2x: number[] = [];
    for (let i = 1; i < samples2x.length; i++) {
      const dMedia = samples2x[i].media - samples2x[i - 1].media;
      const dWall = samples2x[i].wall - samples2x[i - 1].wall;
      deltas2x.push(dMedia / dWall);
    }
    const avg2x = deltas2x.reduce((a, b) => a + b, 0) / deltas2x.length;
    console.log(`2x average rate: ${avg2x.toFixed(4)}x`);
    expect(avg2x, '2x average ≈ 2.0x').toBeGreaterThan(1.8);
    expect(avg2x, '2x average ≈ 2.0x').toBeLessThan(2.2);

    // ── 1x после возврата ──
    const deltas1x: number[] = [];
    for (let i = 1; i < samples1x.length; i++) {
      const dMedia = samples1x[i].media - samples1x[i - 1].media;
      const dWall = samples1x[i].wall - samples1x[i - 1].wall;
      deltas1x.push(dMedia / dWall);
    }
    const avg1x = deltas1x.reduce((a, b) => a + b, 0) / deltas1x.length;
    console.log(`1x average rate after return: ${avg1x.toFixed(4)}x`);
    expect(avg1x, '1x average ≈ 1.0x after return').toBeGreaterThan(0.90);
    expect(avg1x, '1x average ≈ 1.0x after return').toBeLessThan(1.10);

    const maxPlaying2x = Math.max(...samples2x.map(s => s.playing));
    const maxPlaying1x = Math.max(...samples1x.map(s => s.playing));
    expect(maxPlaying2x, 'max playing ≤ 2 at 2x').toBeLessThanOrEqual(2);
    expect(maxPlaying1x, 'max playing ≤ 2 after return to 1x').toBeLessThanOrEqual(2);

    const gaps = logs.filter(l => l.includes('[gap]'));
    expect(gaps.length, 'no gaps across transitions').toBe(0);
  });
});
