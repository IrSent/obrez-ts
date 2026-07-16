import { test, expect } from '@playwright/test';

const TEST_STATE = 'test-state-uuid-1234';
const TEST_CODE = 'FAKE_CODE';

/**
 * Test that clicking "Sign in with Telegram" redirects to OIDC (no popup).
 * We verify the page navigates to oauth.telegram.org instead of opening a popup.
 */
test('login redirects to Telegram OIDC, no popup', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Click Transcribe to trigger login modal
  await page.click('button:has-text("Transcribe")');
  const signInBtn = page.getByRole('button', { name: 'Sign in with Telegram' });
  await signInBtn.waitFor({ state: 'visible', timeout: 20_000 });

  // Track if a popup was opened
  let popupOpened = false;
  page.on('popup', () => { popupOpened = true; });

  // Click sign-in — should redirect (not open popup)
  const redirectPromise = page.waitForNavigation({ timeout: 10_000 }).catch(() => {});
  await signInBtn.click();
  await redirectPromise;

  // Popup should NOT have been opened
  expect(popupOpened).toBe(false, 'Should redirect, not open a popup');

  // Page should have navigated to Telegram OIDC
  expect(page.url()).toContain('oauth.telegram.org');
});

/**
 * Test OIDC callback flow — after redirect back, the app should process the code
 * and NOT show "Sign in required".
 * We mock the backend exchangeCode endpoint so it works locally.
 */
test('OIDC callback processes auth code', async ({ page }) => {
  // Mock the backend exchangeCode endpoint
  await page.route('**/api/auth/telegram-oidc*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          tg_user_id: '12345',
          first_name: 'Test',
          username: 'testuser',
          remaining_seconds: 18000,
          last_free_topup: null,
        },
      }),
      headers: {
        'Set-Cookie': 'obrez_session=fake; HttpOnly; Secure; SameSite=None; Path=/',
      },
    });
  });

  // Preload PKCE state and verifier so the callback can be processed
  await page.addInitScript((state) => {
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_verifier', 'test-verifier');
    sessionStorage.setItem('obrez_pkce_nonce', 'test-nonce');
  }, TEST_STATE);

  // Navigate to the callback URL (as if Telegram redirected back)
  const callbackUrl = `/?code=${TEST_CODE}&state=${TEST_STATE}`;
  await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });

  // Wait for the app to process the callback — it cleans the URL via replaceState
  await page.waitForURL(
    (url) => !url.toString().includes('code='),
    { timeout: 15_000 },
  ).catch(async () => {
    const url = await page.url();
    throw new Error(`Callback URL was not processed — code= still present. URL: ${url}`);
  });

  // The app should be visible
  const appVisible = await page.locator('#root').isVisible();
  expect(appVisible).toBe(true);

  // LoginModal should NOT be shown (no "Sign in required")
  const loginModalVisible = await page.getByText('Sign in required').isVisible().catch(() => false);
  expect(loginModalVisible).toBe(false, 'LoginModal should not be shown after successful OIDC callback');
});
