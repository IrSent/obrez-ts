import { test, expect } from '@playwright/test';

const TEST_STATE = 'test-state-uuid-1234';
const TEST_CODE = 'FAKE_CODE';

/**
 * Test that clicking Sign in with Telegram redirects to OIDC (no popup).
 */
test('login redirects to Telegram OIDC', async ({ page }) => {
  await page.goto('https://irsent.github.io/obrez-ts/');
  await page.waitForLoadState('networkidle');

  // Click Transcribe to trigger login modal
  await page.click('button:has-text("Transcribe")');
  const signInBtn = page.getByRole('button', { name: 'Sign in with Telegram' });
  await signInBtn.waitFor({ state: 'visible', timeout: 20_000 });

  // Click sign-in — should redirect to Telegram OIDC (no popup)
  const [redirectPopup] = await Promise.race([
    page.waitForEvent('popup', { timeout: 5_000 }).then(() => 'popup' as const),
    page.waitForNavigation({ timeout: 10_000 }).then(() => 'redirect' as const),
  ]).catch(async () => {
    const url = await page.url();
    throw new Error(`No popup or redirect. URL: ${url}`);
  });

  expect(redirectPopup).toBe('redirect', 'Should redirect to Telegram, not open a popup');
  expect(page.url()).toContain('oauth.telegram.org');
});

/**
 * Test OIDC callback flow — after redirect back, the app should process the code
 * and NOT show "Sign in required".
 */
test('OIDC callback processes auth code', async ({ page }) => {
  // Preload PKCE state and verifier so the callback can be processed
  await page.addInitScript((state) => {
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_verifier', 'test-verifier');
    sessionStorage.setItem('obrez_pkce_nonce', 'test-nonce');
    // Simulate that handleTranscribe was called before redirect
    localStorage.setItem('obrez_transcribe_pending', '1');
  }, TEST_STATE);

  // Navigate to the callback URL (as if Telegram redirected back)
  const callbackUrl = `https://irsent.github.io/obrez-ts/master/?code=${TEST_CODE}&state=${TEST_STATE}`;
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
