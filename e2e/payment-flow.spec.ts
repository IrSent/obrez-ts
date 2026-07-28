import { test, expect } from '@playwright/test';
import { authenticateAs, openAccountTab } from './fixtures/auth';

const LOCAL_BACKEND = 'http://127.0.0.1:8686';

/**
 * Mock backend-url.json to point to localhost instead of localtunnel.
 * Disable HTTP cache so the route always fires.
 */
async function mockBackendUrl(page) {
  await page.context().route('**/backend-url.json', (route) => {
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ url: LOCAL_BACKEND }),
    });
  });
}

/**
 * Mock checkAuth (/api/auth/me) so the fake JWT cookie is not validated by the real backend.
 */
function mockCheckAuth(page, user) {
  page.route(`${LOCAL_BACKEND}/api/auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user }),
    });
  });
}

/**
 * Test 1: Full topup flow via Settings → Basic pack → PaymentModal → polling.
 *
 * Flow:
 * 1. Auth as user with 0 balance
 * 2. Open Settings → Account tab
 * 3. Click Basic pack → mock returns invoice
 * 4. PaymentModal appears with correct amount
 * 5. Mock /payments/status → return 'credited' with updated balance
 * 6. UI shows payment received, balance updates
 */
test('full basic topup flow via Settings', async ({ page }) => {
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 0,
    last_free_topup: null,
  };

  // Mock all backend endpoints BEFORE navigation
  mockCheckAuth(page, authUser);

  page.route(`${LOCAL_BACKEND}/api/hours/topup*`, async (route) => {
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

  let pollCount = 0;
  page.route(`${LOCAL_BACKEND}/api/payments/status*`, async (route) => {
    pollCount++;
    if (pollCount <= 2) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
      });
    } else {
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

  // Authenticate
  await authenticateAs(page, authUser);

  // Open Settings → Account tab
  await openAccountTab(page);

  // Click Basic pack
  await page.locator('button:has-text("Basic")').click();

  // Wait for PaymentModal
  const payBtn = page.getByRole('button', { name: 'Pay in Telegram' });
  await expect(payBtn).toBeVisible({ timeout: 10_000 });

  // Check the amount
  await expect(page.getByText('0.99 USD')).toBeVisible();

  // Wait for payment success indicator (polling will eventually return 'credited')
  // PaymentModal closes after payment — check that balance updated to 10h
  await expect(page.getByText('10h 0m 0s')).toBeVisible({ timeout: 15_000 });
});

/**
 * Test 2: Free topup via Settings → Free pack → no PaymentModal, balance updates.
 */
test('free topup via Settings', async ({ page }) => {
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 0,
    last_free_topup: null,
  };

  mockCheckAuth(page, authUser);

  page.route(`${LOCAL_BACKEND}/api/hours/topup*`, async (route) => {
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

  await authenticateAs(page, authUser);
  await openAccountTab(page);

  // Click Free pack
  await page.locator('button:has-text("Free")').click();

  // PaymentModal should NOT appear
  await expect(page.getByRole('button', { name: 'Pay in Telegram' })).not.toBeVisible();

  // Success message should appear
  await expect(page.getByText('+5 hours added!')).toBeVisible({ timeout: 5_000 });

  // Balance should be updated
  await expect(page.getByText('5h 0m 0s')).toBeVisible({ timeout: 5_000 });
});

/**
 * Test 3: Free topup cooldown — disabled when already used.
 */
test('free topup cooldown disabled', async ({ page }) => {
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 18000,
    last_free_topup: new Date().toISOString(),
  };

  mockCheckAuth(page, authUser);

  await authenticateAs(page, authUser);
  await openAccountTab(page);

  // Free card should be disabled
  await expect(page.locator('button:has-text("Free")')).toBeDisabled();

  // Cooldown message should be visible
  await expect(page.getByText('Free topup available in')).toBeVisible();
});

/**
 * Test 4: Currency selector switches currencies.
 */
test('currency selector switches currencies', async ({ page }) => {
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 18000,
    last_free_topup: null,
  };

  mockCheckAuth(page, authUser);

  await authenticateAs(page, authUser);
  await openAccountTab(page);

  // Currency selector should have 3 buttons
  const currencyBtns = page.locator(
    'button:has-text("USD"), button:has-text("RUB"), button:has-text("EUR")',
  );
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
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 0,
    last_free_topup: null,
  };

  mockCheckAuth(page, authUser);

  page.route(`${LOCAL_BACKEND}/api/hours/topup*`, async (route) => {
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

  await authenticateAs(page, authUser);
  await openAccountTab(page);

  // Click Basic → PaymentModal appears
  await page.locator('button:has-text("Basic")').click();
  await expect(page.getByRole('button', { name: 'Pay in Telegram' })).toBeVisible({ timeout: 10_000 });

  // Close the modal (X button in PaymentModal)
  await page.getByLabel('Close').click();

  // PaymentModal should be gone
  await expect(page.getByRole('button', { name: 'Pay in Telegram' })).not.toBeVisible();

  // Settings modal should be visible again
  await expect(page.getByText('Account & Balance')).toBeVisible();
});

/**
 * Test 6: Topup flow from ActionButtons (Transcribe → insufficient balance → TopupModal).
 */
test('topup flow from Transcribe button', async ({ page }) => {
  await mockBackendUrl(page);

  const authUser = {
    tg_user_id: 'test-user-123',
    first_name: 'Test',
    username: 'testuser',
    photo_url: null,
    remaining_seconds: 0,
    last_free_topup: null,
  };

  mockCheckAuth(page, authUser);

  await authenticateAs(page, authUser);

  // Load a test file
  await page.setInputFiles('input[type="file"]', 'e2e/ru-profanity.mp4');

  // Wait for file to load
  await page.waitForSelector('text=Transcribe', { timeout: 15_000 });

  // Click Transcribe → should trigger TopupModal (0 balance)
  await page.click('text=Transcribe');

  // TopupModal should appear
  await page.waitForSelector('text=Transcription Balance', { timeout: 10_000 });

  // Free card should be clickable
  await expect(page.locator('button:has-text("Free")')).toBeEnabled();
});
