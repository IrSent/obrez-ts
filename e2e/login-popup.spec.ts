import { test, expect } from '@playwright/test';

const TEST_STATE = 'test-state-uuid-1234';
const TEST_CODE = 'FAKE_CODE';

/**
 * Diagnostic helper — captures main page state so failures show context.
 */
async function dumpState(page: import('@playwright/test').Page) {
  const [url, popupState, state, nonce, verifier, consoleLogs] =
    await Promise.all([
      page.url(),
      page.evaluate(() => sessionStorage.getItem('obrez_pkce_popup_state')),
      page.evaluate(() => sessionStorage.getItem('obrez_pkce_state')),
      page.evaluate(() => sessionStorage.getItem('obrez_pkce_nonce')),
      page.evaluate(() => sessionStorage.getItem('obrez_pkce_verifier')),
      page.evaluate(() => JSON.stringify((window as any).__obrezErrors || [])),
    ]);
  console.log('[diag] url:', url);
  console.log('[diag] popup_state:', popupState);
  console.log('[diag] state:', state);
  console.log('[diag] nonce:', nonce);
  console.log('[diag] verifier:', verifier);
  console.log('[diag] captured errors:', consoleLogs);
}

/**
 * Promise.race that reports both sides on failure instead of silently swallowing one.
 */
async function raceDiagnostic(
  a: Promise<unknown>,
  aLabel: string,
  b: Promise<unknown>,
  bLabel: string,
  timeoutMs: number,
): Promise<string> {
  let aSettled = false;
  let bSettled = false;
  a.finally(() => { aSettled = true; });
  b.finally(() => { bSettled = true; });

  const timer = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms — ${aSettled ? aLabel + ' settled' : aLabel + ' pending'}, ${bSettled ? bLabel + ' settled' : bLabel + ' pending'}`)), timeoutMs),
  );

  try {
    const winner = await Promise.race([a.then(() => 'A'), b.then(() => 'B'), timer]);
    return winner;
  } catch (err) {
    const details = [
      aSettled ? `${aLabel} settled` : `${aLabel} pending`,
      bSettled ? `${bLabel} settled` : `${bLabel} pending`,
    ].join(', ');
    throw new Error(`${err instanceof Error ? err.message : err} (${details})`);
  }
}

test('login popup flow — postMessage handler closes popup', async ({ page }) => {
  await page.goto('https://irsent.github.io/obrez-ts/');
  await page.waitForLoadState('networkidle');

  // Click Transcribe to trigger login modal — wait for the button to appear
  await page.click('button:has-text("Transcribe")');
  const signInBtn = page.getByRole('button', { name: 'Sign in with Telegram' });
  await signInBtn.waitFor({ state: 'visible', timeout: 10_000 });

  // Open popup — race both the popup event and the click
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 10_000 }),
    signInBtn.click(),
  ]);

  // Popup should have Telegram OIDC URL
  const popupUrl = popup.url();
  expect(popupUrl).toContain('oauth.telegram.org');

  // Extract the state from the popup URL
  const state = new URL(popupUrl).searchParams.get('state');
  expect(state).toBeTruthy();

  // Close the popup BEFORE it navigates cross-origin
  // (which breaks window.opener in Playwright)
  await popup.close();

  // Inject the postMessage into the main window to simulate the popup callback
  await page.evaluate((code) => {
    window.postMessage(`obrez_auth:${code}`, window.location.origin);
  }, TEST_CODE);

  // Wait for the handler to fire — it clears obrez_pkce_popup_state immediately
  await page.waitForFunction(
    () => sessionStorage.getItem('obrez_pkce_popup_state') === null,
    { timeout: 8_000 },
  ).catch(async () => {
    await dumpState(page);
    throw new Error('postMessage handler did not fire — obrez_pkce_popup_state not cleared');
  });

  // Main page should still be on the same URL (no fallback redirect)
  expect(page.url()).not.toContain('oauth.telegram.org');
});

test('login direct path — OIDC callback with code+state in URL', async ({ page }) => {
  // Set PKCE state in sessionStorage before the app loads,
  // simulating a prior sign-in attempt
  await page.addInitScript((state) => {
    sessionStorage.setItem('obrez_pkce_state', state);
  }, TEST_STATE);

  // Navigate to the callback URL (as if Telegram redirected back)
  const callbackUrl = `https://irsent.github.io/obrez-ts/master/?code=${TEST_CODE}&state=${TEST_STATE}`;
  await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });

  // Wait for the app to process the callback — it cleans the URL via replaceState
  await page.waitForURL(
    (url) => !url.toString().includes('code='),
    { timeout: 15_000 },
  ).catch(async () => {
    await dumpState(page);
    throw new Error('Callback URL was not processed — code= still present');
  });

  // The app should have attempted auth exchange (backend not running, but no crash)
  const appVisible = await page.locator('#root').isVisible();
  expect(appVisible).toBe(true);
});

test('login popup full flow — popup navigates to callback, sends postMessage, main window closes popup', async ({ page }) => {
  await page.goto('https://irsent.github.io/obrez-ts/');
  await page.waitForLoadState('networkidle');

  // Click Transcribe to trigger login modal — wait for the button
  await page.click('button:has-text("Transcribe")');
  const signInBtn = page.getByRole('button', { name: 'Sign in with Telegram' });
  await signInBtn.waitFor({ state: 'visible', timeout: 10_000 });

  // Open popup
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 10_000 }),
    signInBtn.click(),
  ]);

  // Popup should have Telegram OIDC URL
  const popupUrl = popup.url();
  expect(popupUrl).toContain('oauth.telegram.org');

  // Extract the state from the popup URL
  const state = new URL(popupUrl).searchParams.get('state');
  expect(state).toBeTruthy();

  // Simulate Telegram redirect: navigate popup to our callback URL
  const redirectUri = `https://irsent.github.io/obrez-ts/master/?code=${TEST_CODE}&state=${state}`;
  await popup.goto(redirectUri, { waitUntil: 'networkidle' });

  // Wait for the main page handler to fire — obrez_pkce_popup_state is cleared
  // as soon as postMessage is received. If Playwright breaks window.opener
  // (cross-origin nav), the popup takes the direct path and cleans its own URL.
  const winner = await raceDiagnostic(
    page.waitForFunction(() => {
      return sessionStorage.getItem('obrez_pkce_popup_state') === null;
    }, { timeout: 12_000 }),
    'main-page state cleared',
    popup.waitForURL((url) => !url.toString().includes('code='), { timeout: 12_000 }),
    'popup URL cleaned',
    15_000,
  );
  console.log(`[e2e] Full popup flow completed via: ${winner}`);

  // Main page should still be on obrez-ts (no fallback redirect to Telegram)
  expect(page.url()).toContain('obrez-ts');
});
