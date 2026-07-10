import { test, expect } from '@playwright/test';

test('login popup flow', async ({ page }) => {
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

  // Simulate Telegram redirect: navigate popup to our redirect_uri with ?code=...
  const redirectUri = `https://irsent.github.io/obrez-ts/?code=FAKE_CODE&state=${state}`;
  await popup.goto(redirectUri, { waitUntil: 'networkidle' });
  await popup.waitForTimeout(3000);

  // Debug: check popup content
  const popupContent = await popup.evaluate(() => {
    return {
      url: window.location.href,
      hasOpener: !!window.opener,
      code: new URL(window.location.href).searchParams.get('code'),
      state: new URL(window.location.href).searchParams.get('state'),
      savedState: sessionStorage.getItem('obrez_pkce_state'),
      popupState: sessionStorage.getItem('obrez_pkce_popup_state'),
    };
  });
  console.log('Popup debug:', popupContent);

  // Popup should close itself after sending postMessage
  expect(popup.isClosed()).toBe(true);

  // Main page should still be on the same URL (no fallback redirect)
  expect(page.url()).not.toContain('oauth.telegram.org');
});
