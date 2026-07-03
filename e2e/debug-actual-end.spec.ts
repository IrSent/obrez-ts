import { test, expect } from '@playwright/test';

/**
 * Тест: проверяет что actualEndCorrection корректен.
 * Если буферы стартуют слишком близко друг к другу, они накладываются.
 */
test('actual end correction is correct', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Load File' }).click();
  const fc = await fileChooserPromise;
  await fc.setFiles('e2e/valid-with-aac.mp4');
  const dur = page.locator('span.text-xs.opacity-60').last();
  await expect(dur).not.toHaveText(/^00:00/, { timeout: 15000 });

  // Ждём 5 секунд
  await page.waitForTimeout(5000);

  // Проверяем что нет [gap] логов
  const gapLogs = logs.filter(l => l.includes('[gap]'));
  expect(gapLogs.length, 'no gaps').toBe(0);

  // Проверяем что нет [st-underrun] логов
  const underrunLogs = logs.filter(l => l.includes('[st-underrun]'));
  expect(underrunLogs.length, 'no underruns').toBe(0);

  // Проверяем что нет [output-clip] логов
  const clipLogs = logs.filter(l => l.includes('[output-clip]'));
  expect(clipLogs.length, 'no clipping').toBe(0);

  // Проверяем что нет [output-click] логов
  const clickLogs = logs.filter(l => l.includes('[output-click]'));
  expect(clickLogs.length, 'no clicks').toBe(0);

  // Логи для диагностики
  console.log('\n═══ AUDIO LOGS ═══');
  for (const l of logs) {
    if (l.includes('[audio]') || l.includes('[gap]') || l.includes('[st-underrun]') || l.includes('[output-')) {
      console.log(l.slice(0, 150));
    }
  }
});
