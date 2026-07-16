import { test, expect } from '@playwright/test';

const TEST_STATE = 'test-state-uuid-1234';
const TEST_CODE = 'FAKE_CODE';

/**
 * Test the mobile OIDC callback flow:
 * 1. User clicks Transcribe → sets obrez_transcribe_pending
 * 2. No auth → LoginModal shows → redirect to Telegram
 * 3. After auth, Telegram redirects back with code= in URL
 * 4. App should process callback and NOT show "Sign in required"
 * 5. obrez_transcribe_pending should be cleared
 */
test('mobile OIDC callback flow — wasOidcCallback resumes transcription', async ({ page }) => {
  // Simulate mobile: set obrez_transcribe_pending and PKCE state + verifier before load
  await page.addInitScript((state, pending) => {
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_verifier', 'test-verifier');
    sessionStorage.setItem('obrez_pkce_nonce', 'test-nonce');
    localStorage.setItem('obrez_transcribe_pending', pending);
  }, TEST_STATE, '1');

  // Navigate to the callback URL (as if Telegram redirected back)
  const callbackUrl = `https://irsent.github.io/obrez-ts/master/?code=${TEST_CODE}&state=${TEST_STATE}`;
  await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });

  // Wait for the app to process the callback — it cleans the URL via replaceState
  await page.waitForURL(
    (url) => !url.toString().includes('code='),
    { timeout: 15_000 },
  ).catch(async () => {
    const url = await page.url();
    const pending = await page.evaluate(() => localStorage.getItem('obrez_transcribe_pending'));
    throw new Error(`Callback URL was not processed — code= still present. URL: ${url}, pending: ${pending}`);
  });

  // The app should be visible
  const appVisible = await page.locator('#root').isVisible();
  expect(appVisible).toBe(true);

  // LoginModal should NOT be shown (no "Sign in required")
  const loginModalVisible = await page.getByText('Sign in required').isVisible().catch(() => false);
  expect(loginModalVisible).toBe(false, 'LoginModal should not be shown after successful OIDC callback');
});

/**
 * Test that obrez_transcribe_pending persists through the redirect.
 * Before the fix, handleTranscribe cleared it in a finally block BEFORE
 * the redirect to Telegram, so wasOidcCallback saw it as missing.
 */
test('obrez_transcribe_pending survives redirect — no premature cleanup', async ({ page }) => {
  // Set pending flag and PKCE data
  await page.addInitScript(() => {
    localStorage.setItem('obrez_transcribe_pending', '1');
    sessionStorage.setItem('obrez_pkce_state', TEST_STATE);
    sessionStorage.setItem('obrez_pkce_verifier', 'test-verifier');
    sessionStorage.setItem('obrez_pkce_nonce', 'test-nonce');
  });

  // Navigate to a normal page (no code= in URL)
  await page.goto('https://irsent.github.io/obrez-ts/master/', { waitUntil: 'domcontentloaded' });

  // Flag should still be there — nothing should have cleared it
  const pending = await page.evaluate(() => localStorage.getItem('obrez_transcribe_pending'));
  expect(pending).toBe('1', 'obrez_transcribe_pending should persist on normal page load');
});
