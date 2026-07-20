import { expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Authentication helpers shared across app E2E suites.
 *
 * The apps use two different auth stacks:
 *  - admin / auditor / system: shared AuthService → POST /api/v1/auth/login
 *    (username + password). Access token in memory, refresh token in
 *    localStorage under "refreshToken"; user identity in localStorage under
 *    "username" / "role".
 *  - platform: its own context → also POST /v1/auth/login but with a mock
 *    fallback when the backend is not ready. Stores tokens under the
 *    "platform:*" keys.
 *
 * `loginViaUI` drives the real login form and works for every app.
 * `loginViaAPI` hits the REST endpoint directly (admin/auditor/system) and
 * returns the access token — useful for fast setup or direct API assertions.
 */

/**
 * Log in by driving the login UI. Works for all apps because every login
 * page renders a visible text input, a password input, and a submit button.
 *
 * @param identifier username (admin/auditor/system) or email (platform).
 */
export async function loginViaUI(
  page: Page,
  identifier: string,
  password: string,
): Promise<void> {
  // The username/email field is the first visible non-password text input.
  const identifierField = page
    .locator('input')
    .filter({ hasText: '' })
    .first();
  await identifierField.fill(identifier);

  const passwordField = page.locator('input[type="password"]').first();
  await passwordField.fill(password);

  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();
}

/**
 * Log in via the REST API (admin/auditor/system stack).
 *
 * Posts to `${baseURL}/api/v1/auth/login` (proxied to the backend by Vite).
 * Returns the access token on success.
 *
 * NOTE: The platform app uses a different path (/v1/auth/login) and a mock
 * fallback; use `loginViaUI` for platform tests instead.
 */
export async function loginViaAPI(
  request: APIRequestContext,
  identifier: string,
  password: string,
  baseURL = '',
): Promise<string> {
  const response = await request.post(`${baseURL}/api/v1/auth/login`, {
    data: { username: identifier, password },
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    throw new Error(
      `loginViaAPI failed: ${response.status()} ${response.statusText()}`,
    );
  }

  const body = (await response.json()) as {
    success?: boolean;
    data?: { accessToken?: string; token?: string };
  };

  const token = body.data?.accessToken ?? body.data?.token;
  if (!token) {
    throw new Error('loginViaAPI succeeded but no access token was returned');
  }
  return token;
}

/**
 * Select a tenant on the /select-tenant page (multi-tenant users only).
 *
 * Clicks the tenant card whose visible text contains the given slug. When the
 * user belongs to a single tenant the apps auto-select it and this helper is
 * a no-op (the selector page is never shown).
 */
export async function selectTenant(page: Page, slug: string): Promise<void> {
  // The tenant selector renders one button per tenant with "name · slug · role".
  const tenantButton = page.getByRole('button', { name: new RegExp(slug, 'i') });
  await expect(tenantButton).toBeVisible();
  await tenantButton.click();
}

/**
 * Log out from any authenticated app via the UI.
 *
 * Tries the common logout affordances across apps:
 *  - a button with title="Logout" / "Cerrar sesión" (platform, system)
 *  - the user menu → "Logout" / "Sign out" item (admin, auditor)
 */
export async function logoutViaUI(page: Page): Promise<void> {
  // Direct logout button (platform header, system header).
  const directLogout = page
    .getByRole('button', { name: /logout|cerrar sesión/i })
    .first();

  if (await directLogout.isVisible().catch(() => false)) {
    await directLogout.click();
    return;
  }

  // User menu trigger (admin TopBar, auditor Layout).
  const userMenu = page
    .getByRole('button', { name: /user menu/i })
    .first();
  if (await userMenu.isVisible().catch(() => false)) {
    await userMenu.click();
    const logoutItem = page
      .getByRole('button', { name: /logout|sign out/i })
      .first();
    await logoutItem.click();
    return;
  }

  // Fallback: any element whose accessible name is exactly "Logout".
  await page.getByText(/logout|sign out/i).first().click();
}
