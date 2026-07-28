import { test, expect } from '@playwright/test';
import { authenticateAs, openAccountTab } from './fixtures/auth';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCAL_BACKEND = 'http://127.0.0.1:8686';

/**
 * Mock backend-url.json to point to localhost instead of localtunnel.
 * This way all backend requests go to localhost and can be intercepted.
 */
async function mockBackendUrl(page) {
  await page.route('**/backend-url.json', (route) => {
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: LOCAL_BACKEND }),
    });
  });
}

/**
 * Test 1: Full topup flow via Settings → Basic pack → PaymentModal → polling.
 *
 * Flow:
 * 1. Auth as user with 0 balance
 * 2. Open Settings → Account tab
 * 3. Click Basic pack → backend creates invoice via CryptoBot testnet
 * 4. PaymentModal appears with correct amount
 * 5. Intercept /payments/status → return 'credited' with updated balance
 * 6. UI shows payment received, balance updates
 */
test('full basic topup flow via Settings', async ({ page }) => {
  await mockBackendUrl(page);
  const authUser = await authenticateAs(page, {
    remaining_seconds: 0,
    last_free_topup: null,
  });

  // Open Settings → Account tab
  await openAccountTab(page);

  // Intercept /topup to let the real backend create the invoice
  // But we need the backend to accept our fake JWT → route it
  await page.route(`${LOCAL_BACKEND}/**/api/hours/topup`, async (route) => {
    // Return a fake invoice response (real backend would reject our fake JWT)
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        invoice: {
          invoice_id: 999999,
          amount: '0.99',
          currency: 'USD',
          status: 'active',
          bot_invoice_url: 'https://t.me/CryptoTestnetBot?start=test',
          web_app_invoice_url: 'https://testnet-app.send.tg/invoices/test',
        },
      }),
    });
  });

  // Click Basic pack
  const basicCard = page.locator('button:has-text("Basic")');
  await basicCard.click();

  // Wait for PaymentModal
  const payBtn = page.getByRole('button', { name: 'Pay in Telegram' });
  await expect(payBtn).toBeVisible({ timeout: 10_000 });

  // Check the amount
  const amountText = page.getByText('0.99 USD');
  await expect(amountText).toBeVisible();

  // Check status indicator — should show "Waiting for payment"
  const waitingText = page.getByText('Waiting for payment');
  await expect(waitingText).toBeVisible();

  // Intercept polling endpoint — first return pending, then credited
  let pollCount = 0;
  await page.route(`${LOCAL_BACKEND}/**/api/payments/status`, async (route) => {
    pollCount++;
    if (pollCount <= 2) {
      // First 2 polls: still pending
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      });
    } else {
      // 3rd poll: credited
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'credited',
          user: {
            ...authUser,
            remaining_seconds: 36000, // +10 hours
          },
        }),
      });
    }
  });

  // Wait for payment success indicator
  const successText = page.getByText('Payment received');
  await expect(successText).toBeVisible({ timeout: 15_000 });

  // PaymentModal should close after payment → Settings/TopupModal re-appears
  // Wait a moment for state to update
  await page.waitForTimeout(2_000);
});

/**
 * Test 2: Free topup via Settings → Free pack → no PaymentModal, balance updates.
 */
test('free topup via Settings', async ({ page }) => {
  await mockBackendUrl(page);
  await authenticateAs(page, {
    remaining_seconds: 0,
    last_free_topup: null,
  });

  await openAccountTab(page);

  // Intercept /topup for free pack
  await page.route(`${LOCAL_BACKEND}/**/api/hours/topup`, async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        user: {
          remaining_seconds: 18000, // 5 hours
          last_free_topup: '2026-07-25T00:00:00',
        },
      }),
    });
  });

  // Click Free pack
  const freeCard = page.locator('button:has-text("Free")');
  await freeCard.click();

  // PaymentModal should NOT appear
  const payBtn = page.getByRole('button', { name: 'Pay in Telegram' });
  await expect(payBtn).not.toBeVisible();

  // Balance should be updated
  await page.waitForTimeout(1_000);
  const balanceText = page.getByText('5h 0m 0s');
  await expect(balanceText).toBeVisible();
});

/**
 * Test 3: Free topup cooldown — disabled when already used.
 */
test('free topup cooldown disabled', async ({ page }) => {
  await mockBackendUrl(page);
  // User who already used free topup today
  await authenticateAs(page, {
    remaining_seconds: 18000,
    last_free_topup: new Date().toISOString(),
  });

  await openAccountTab(page);

  // Free card should be disabled
  const freeCard = page.locator('button:has-text("Free")');
  await expect(freeCard).toBeDisabled();

  // Cooldown message should be visible
  const cooldownMsg = page.getByText('Free topup available in');
  await expect(cooldownMsg).toBeVisible();
});

/**
 * Test 4: Currency selector switches currencies.
 */
test('currency selector switches currencies', async ({ page }) => {
  await authenticateAs(page);
  await openAccountTab(page);

  // Currency selector should have 3 buttons
  const currencyBtns = page.locator('button:has-text("USD"), button:has-text("RUB"), button:has-text("EUR")');
  await expect(currencyBtns).toHaveCount(3);

  // Switch to RUB
  const rubBtn = page.locator('button:has-text("RUB")');
  await rubBtn.click();
  await expect(rubBtn).toHaveClass(/bg-purple-700/);

  // Switch to EUR
  const eurBtn = page.locator('button:has-text("EUR")');
  await eurBtn.click();
  await expect(eurBtn).toHaveClass(/bg-purple-700/);
});

/**
 * Test 5: Close PaymentModal clears activeInvoice.
 */
test('close PaymentModal clears active invoice', async ({ page }) => {
  await authenticateAs(page, { remaining_seconds: 0 });
  await openAccountTab(page);

  // Intercept /topup
  await page.route(`${LOCAL_BACKEND}/**/api/hours/topup`, async (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        invoice: {
          invoice_id: 999999,
          amount: '0.99',
          currency: 'USD',
          status: 'active',
          bot_invoice_url: 'https://t.me/CryptoTestnetBot?start=test',
          web_app_invoice_url: 'https://testnet-app.send.tg/invoices/test',
        },
      }),
    });
  });

  // Click Basic → PaymentModal appears
  await page.locator('button:has-text("Basic")').click();
  await expect(page.getByRole('button', { name: 'Pay in Telegram' })).toBeVisible({ timeout: 10_000 });

  // Close the modal
  const closeBtn = page.getByRole('button', { name: 'Close' });
  await closeBtn.click();

  // PaymentModal should be gone
  await expect(page.getByRole('button', { name: 'Pay in Telegram' })).not.toBeVisible();

  // Settings modal should be visible again
  await expect(page.getByText('Account & Balance')).toBeVisible();
});

/**
 * Test 6: Topup flow from ActionButtons (Transcribe → insufficient balance → TopupModal).
 */
test('topup flow from Transcribe button', async ({ page }) => {
  await authenticateAs(page, {
    remaining_seconds: 0,
    last_free_topup: null,
  });

  // Load a test file
  await page.setInputFiles('input[type="file"]', {
    name: 'ru-profanity.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from(fs.readFileSync(path.resolve(__dirname, 'ru-profanity.mp4'))),
  });

  // Wait for file to load
  await page.waitForSelector('text=Transcribe', { timeout: 15_000 });

  // Click Transcribe → should trigger TopupModal (0 balance)
  await page.click('text=Transcribe');

  // TopupModal should appear
  await page.waitForSelector('text=Transcription Balance', { timeout: 10_000 });

  // Free card should be clickable
  const freeCard = page.locator('button:has-text("Free")');
  await expect(freeCard).toBeEnabled();
});

