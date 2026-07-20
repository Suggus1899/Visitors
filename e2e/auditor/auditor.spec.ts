import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/auth';
import { auditor } from '../fixtures/users';

/**
 * Auditor (audit & compliance) E2E tests.
 * App: apps/auditor on http://localhost:5176. Uses HashRouter (#/...).
 *
 * With a single seeded tenant the tenant selector is auto-skipped.
 */
test.describe('Auditor console', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
  });

  test('auditor login reaches the dashboard', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('dashboard shows audit KPIs and subtitle', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(/audit kpis and recent activity/i)).toBeVisible();
  });

  test('navigate to Audit Logs and list loads', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Audit Logs' }).first().click();
    await expect(page.getByRole('heading', { name: 'Audit Logs' })).toBeVisible();
  });

  test('navigate to ARCO Requests and list loads', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'ARCO Requests' }).first().click();
    await expect(page.getByRole('heading', { name: 'ARCO Requests' })).toBeVisible();
  });

  test('read-only indicators are present', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Sidebar badge.
    await expect(page.getByText(/read-only auditor access/i)).toBeVisible();
    // Page header badge.
    await expect(page.getByText(/read-only access/i).first()).toBeVisible();
  });

  test('logout returns to the login page', async ({ page }) => {
    await loginViaUI(page, auditor.username, auditor.password);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Open the user menu (button showing the username) and sign out.
    await page.getByRole('button', { name: new RegExp(auditor.username, 'i') }).first().click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });
});
