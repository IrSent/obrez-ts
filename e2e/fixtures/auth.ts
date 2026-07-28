import { Page } from '@playwright/test';
import type { AuthUser } from '../../src/types';

const TEST_STATE = 'test-payment-state';
const TEST_CODE = 'FAKE_CODE';

/**
 * Authenticate a user via mocked OIDC callback.
 * Sets up PKCE state, routes the telegram-oidc endpoint, and navigates to the callback URL.
 */
export async function authenticateAs(
  page: Page,
  user: Partial<AuthUser> = {},
): Promise<AuthUser> {
  const authUser: AuthUser = {
    tg_user_id: user.tg_user_id ?? 'test-user-123',
    first_name: user.first_name ?? 'Test',
    username: user.username ?? 'testuser',
    photo_url: user.photo_url ?? null,
    remaining_seconds: user.remaining_seconds ?? 0,
    last_free_topup: user.last_free_topup ?? null,
  };

  // Mock the OIDC exchange endpoint
  await page.route('**/api/auth/telegram-oidc*', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: authUser }),
      headers: {
        'Set-Cookie': `obrez_session=fake-jwt-${authUser.tg_user_id}; HttpOnly; Secure; SameSite=None; Path=/`,
      },
    });
  });

  // Preload PKCE state
  await page.addInitScript((state) => {
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_verifier', 'test-verifier');
    sessionStorage.setItem('obrez_pkce_nonce', 'test-nonce');
  }, TEST_STATE);

  // Navigate to callback URL
  const callbackUrl = `/?code=${TEST_CODE}&state=${TEST_STATE}`;
  await page.goto(callbackUrl, { waitUntil: 'domcontentloaded' });

  // Wait for the app to process the callback
  await page.waitForURL(
    (url) => !url.toString().includes('code='),
    { timeout: 15_000 },
  ).catch(() => {});

  // Wait for the app to be visible
  await page.waitForSelector('#root', { timeout: 15_000 });

  return authUser;
}

/**
 * Open Settings modal and navigate to the Account & Balance tab.
 */
export async function openAccountTab(page: Page): Promise<void> {
  await page.click('#obrez-gear');
  await page.waitForSelector('text=Account & Balance', { timeout: 5_000 });
}
