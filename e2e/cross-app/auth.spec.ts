import { test, expect } from '@playwright/test';

/**
 * Cross-app authentication smoke tests.
 *
 * Verifies that every authenticated app exposes a login page and that
 * unauthenticated visits to protected routes redirect back to login.
 * The landing app is public, so it is checked for accessibility instead.
 */

const LANDING = process.env.LANDING_BASE_URL ?? 'http://localhost:5173';
const PLATFORM = process.env.PLATFORM_BASE_URL ?? 'http://localhost:5174';
const ADMIN = process.env.ADMIN_BASE_URL ?? 'http://localhost:5175';
const AUDITOR = process.env.AUDITOR_BASE_URL ?? 'http://localhost:5176';
const SYSTEM = process.env.SYSTEM_BASE_URL ?? 'http://localhost:5177';

test.describe('Cross-app auth', () => {
  test('landing is publicly accessible (no login required)', async ({ page }) => {
    await page.goto(LANDING);
    await expect(page.locator('#hero')).toBeVisible();
  });

  test('platform exposes a login page', async ({ page }) => {
    await page.goto(`${PLATFORM}/login`);
    await expect(page.getByRole('heading', { name: /logmaster platform/i })).toBeVisible();
  });

  test('admin exposes a login page', async ({ page }) => {
    await page.goto(`${ADMIN}/`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /logmaster admin/i })).toBeVisible();
  });

  test('auditor exposes a login page', async ({ page }) => {
    await page.goto(`${AUDITOR}/`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: /logmaster auditor/i })).toBeVisible();
  });

  test('system exposes a login page', async ({ page }) => {
    await page.goto(`${SYSTEM}/`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: /ingresar/i })).toBeVisible();
  });

  test('platform redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${PLATFORM}/dashboard`);
    await page.waitForURL('**/login', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('admin redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${ADMIN}/#/visitors`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('auditor redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${AUDITOR}/#/logs`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('system redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${SYSTEM}/`);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });
});
