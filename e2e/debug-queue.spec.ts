import { test, expect } from '@playwright/test';

/**
 * Тест: проверяет что после паузы и seek очередь BufferSource node очищается.
 */
test('pause clears queue', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 3 секунды
  await page.waitForTimeout(3000);

  // Проверяем diagnostic
  const beforePause = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('Before pause:', JSON.stringify(beforePause));

  // Пауза
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /pause/i }).click();
  await page.waitForTimeout(1000);

  const afterPause = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('After pause:', JSON.stringify(afterPause));

  // Очередь должна быть очищена
  expect(afterPause.concurrentSources, 'queue cleared after pause').toBe(0);
  expect(afterPause.iteratorLocked, 'iterator not locked after pause').toBe(false);

  // Play
  await page.locator('canvas[aria-label="Video canvas"]').hover();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /play/i }).click();
  await page.waitForTimeout(1000);

  const afterPlay = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('After play:', JSON.stringify(afterPlay));

  // Очередь должна быть заново заполнена
  expect(afterPlay.concurrentSources, 'queue has sources after play').toBeGreaterThan(0);

  // Seek
  const progressBar = page.locator('input[type="range"]').first();
  const box = await progressBar.boundingBox();
  if (box) {
    const seekX = box.x + box.width * 0.3;
    await page.mouse.click(seekX, box.y + box.height / 2);
  }
  await page.waitForTimeout(1000);

  const afterSeek = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('After seek:', JSON.stringify(afterSeek));

  // Очередь должна быть очищена и заново заполнена
  expect(afterSeek.concurrentSources, 'queue has sources after seek').toBeGreaterThan(0);

  // Логи для диагностики
  console.log('\n═══ LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]')) {
      console.log(l.slice(0, 150));
    }
  }
});

test('seek clears queue and starts fresh', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 2 секунды
  await page.waitForTimeout(2000);

  // Seek к 10 секунде
  const progressBar = page.locator('input[type="range"]').first();
  const box = await progressBar.boundingBox();
  if (box) {
    const seekX = box.x + box.width * 0.04;
    await page.mouse.click(seekX, box.y + box.height / 2);
  }
  await page.waitForTimeout(1000);

  const afterSeek = await page.evaluate(() => (window as any).__audioDiagnostic);
  console.log('After seek:', JSON.stringify(afterSeek));

  // Проверяем что нет stale итераторов
  const staleLogs = logs.filter(l => l.includes('stale generation'));
  expect(staleLogs.length, 'no stale iterators after seek').toBe(0);

  // Проверяем что нет rejected transitions
  const rejectedLogs = logs.filter(l => l.includes('transition rejected'));
  expect(rejectedLogs.length, 'no rejected transitions after seek').toBe(0);

  // Логи для диагностики
  console.log('\n═══ LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]')) {
      console.log(l.slice(0, 150));
    }
  }
});
