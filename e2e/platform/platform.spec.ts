import { test, expect } from '@playwright/test';
import { loginViaUI, logoutViaUI } from '../helpers/auth';
import { trebolmaster, admin } from '../fixtures/users';

/**
 * Platform (superadmin console) E2E tests.
 * App: apps/platform on http://localhost:5174.
 *
 * NOTE: The platform app falls back to an in-memory mock when the backend is
 * not reachable. In mock mode login accepts any credentials and always grants
 * superadmin, so the "non-superadmin rejected" test only passes against the
 * real backend (set VITE_API_URL so /v1/auth/login reaches the server).
 */
test.describe('Platform superadmin console', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('superadmin login reaches the dashboard', async ({ page }) => {
    await loginViaUI(page, trebolmaster.username, trebolmaster.password);
    await page.waitForURL('**/dashboard', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /platform overview/i })).toBeVisible();
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    await loginViaUI(page, trebolmaster.username, trebolmaster.password);
    await page.waitForURL('**/dashboard', { waitUntil: 'load' });
    // At least the "Total Tenants" KPI is rendered.
    await expect(page.getByText('Total Tenants')).toBeVisible();
  });

  test('navigate to Tenants and list loads', async ({ page }) => {
    await loginViaUI(page, trebolmaster.username, trebolmaster.password);
    await page.waitForURL('**/dashboard', { waitUntil: 'load' });

    await page.getByRole('link', { name: 'Tenants' }).first().click();
    await page.waitForURL('**/tenants', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  });

  test('navigate to Users and list loads', async ({ page }) => {
    await loginViaUI(page, trebolmaster.username, trebolmaster.password);
    await page.waitForURL('**/dashboard', { waitUntil: 'load' });

    await page.getByRole('link', { name: 'Users' }).first().click();
    await page.waitForURL('**/users', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });

  test('logout redirects to the login page', async ({ page }) => {
    await loginViaUI(page, trebolmaster.username, trebolmaster.password);
    await page.waitForURL('**/dashboard', { waitUntil: 'load' });

    await logoutViaUI(page);
    await page.waitForURL('**/login', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });

  // TODO(e2e): This assertion only holds against the real backend. In mock
  // mode the platform grants superadmin for any credentials.
  test('non-superadmin (tenant admin) is rejected', async ({ page }) => {
    await loginViaUI(page, admin.username, admin.password);
    await expect(page.getByRole('alert')).toContainText(/superadmin/i);
    await expect(page).toHaveURL(/\/login$/);
  });
});
