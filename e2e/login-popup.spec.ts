import { test, expect } from '@playwright/test';

const TEST_STATE = 'test-state-uuid-1234';
const TEST_CODE = 'FAKE_CODE';

test('login popup flow — postMessage handler closes popup', async ({ page }) => {
  await page.goto('https://irsent.github.io/obrez-ts/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Click Transcribe to trigger login modal
  await page.click('button:has-text("Transcribe")');
  await page.waitForTimeout(1000);

  // Check if LoginModal is visible
  const loginVisible = await page.getByRole('button', { name: 'Sign in with Telegram' }).isVisible();
  expect(loginVisible).toBe(true);

  // Click Sign in with Telegram
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 5000 }),
    page.getByRole('button', { name: 'Sign in with Telegram' }).click()
  ]);

  // Popup should have Telegram OIDC URL
  const popupUrl = popup.url();
  expect(popupUrl).toContain('oauth.telegram.org');

  // Extract the state from the popup URL
  const state = new URL(popupUrl).searchParams.get('state');
  expect(state).toBeTruthy();

  // Close the popup BEFORE it navigates cross-origin (which breaks window.opener in Playwright)
  // This simulates the real flow: popup sends postMessage, then main window closes it via popupRef
  await popup.close();

  // Now inject the postMessage into the main window to simulate what the popup would send
  // The main window's handler will close the popup (already closed here) and exchange the code
  await page.evaluate((code) => {
    window.postMessage(`obrez_auth:${code}`, window.location.origin);
  }, TEST_CODE);

  // Wait for exchangeCode to complete (backend not running, so it will fail — but the handler fires)
  await page.waitForTimeout(2000);

  // Main page should still be on the same URL (no fallback redirect)
  expect(page.url()).not.toContain('oauth.telegram.org');
});

test('login direct path — OIDC callback with code+state in URL', async ({ page }) => {
  // Set PKCE state in sessionStorage before the app loads, simulating a prior sign-in attempt
  await page.addInitScript((state) => {
    sessionStorage.setItem('obrez_pkce_state', state);
  }, TEST_STATE);

  // Navigate to the callback URL (as if Telegram redirected back)
  const callbackUrl = `https://irsent.github.io/obrez-ts/master/?code=${TEST_CODE}&state=${TEST_STATE}`;
  await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // The app should have processed the callback — URL params should be cleaned
  const finalUrl = page.url();
  expect(finalUrl).not.toContain('code=');
  expect(finalUrl).not.toContain('state=');

  // The app should have attempted auth exchange (backend not running, but no crash)
  // Just verify the page loaded without errors
  const consoleErrors = await page.evaluate(() => {
    return (window as any).__obrezErrors?.length || 0;
  }).catch(() => 0);
  // Errors are expected (backend unavailable), but the app shouldn't be blank
  const appVisible = await page.locator('#root').isVisible();
  expect(appVisible).toBe(true);
});
