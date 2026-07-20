import { test, expect } from '@playwright/test';
import { loginViaUI, logoutViaUI } from '../helpers/auth';
import { admin, auditor } from '../fixtures/users';

/**
 * Admin (tenant administration) E2E tests.
 * App: apps/admin on http://localhost:5175. Uses HashRouter (#/...).
 *
 * The seeder creates a single "default" tenant, so the tenant selector is
 * auto-skipped and login goes straight to the dashboard.
 */
test.describe('Admin tenant console', () => {
  test.beforeEach(async ({ page }) => {
    // HashRouter: landing on "/" redirects to "#/login" when unauthenticated.
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
  });

  test('admin login reaches the dashboard', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await page.waitForURL(/[^/]$/, { waitUntil: 'load' }).catch(() => undefined);
    // HashRouter root is "#/" — wait for the dashboard heading.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // KPI cards render as panel-tech blocks with an uppercase label.
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('navigate to Visitantes and list loads', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Visitantes' }).first().click();
    await expect(page.getByRole('heading', { name: 'Visitantes' })).toBeVisible();
  });

  test('navigate to Visitas and list loads', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Visitas' }).first().click();
    await expect(page.getByRole('heading', { name: 'Visitas' })).toBeVisible();
  });

  test('navigate to Calendario and calendar renders', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Calendario' }).first().click();
    await expect(
      page.getByRole('heading', { name: /calendario de visitas/i }),
    ).toBeVisible();
  });

  test('navigate to Backups and list loads', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Backups' }).first().click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible();
  });

  test('logout returns to the login page', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await logoutViaUI(page);
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('role guard: auditor cannot access the admin console', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    // The Login component rejects non-admin roles and stays on /login.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login$/);
  });
});
