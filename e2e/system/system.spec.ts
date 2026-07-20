import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/auth';
import { guard } from '../fixtures/users';

/**
 * System (guard / reception operations) E2E tests.
 * App: apps/system on http://localhost:5177. Uses HashRouter (#/...).
 */
test.describe('System guard console', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page.getByRole('button', { name: /ingresar/i })).toBeVisible();
  });

  test('guard login reaches the operations view', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });

    await loginViaUI(page, guard.username, guard.password);
    // Operations view shows the three status tabs.
    await expect(page.getByRole('button', { name: /activas/i })).toBeVisible();
  });

  test('active visits tab is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await loginViaUI(page, guard.username, guard.password);

    await expect(page.getByRole('button', { name: /activas/i })).toBeVisible();
  });

  test('waiting visits tab is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await loginViaUI(page, guard.username, guard.password);

    await expect(page.getByRole('button', { name: /en espera/i })).toBeVisible();
  });

  test('check-in wizard is accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await loginViaUI(page, guard.username, guard.password);

    // The check-in wizard lives in the visit-form region.
    await expect(page.locator('[data-tour="visit-form"]')).toBeVisible();
  });

  test('logout returns to the login page', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await loginViaUI(page, guard.username, guard.password);
    await expect(page.getByRole('button', { name: /activas/i })).toBeVisible();

    await page.locator('[data-tour="logout-btn"]').click();
    await page.waitForURL(/\/login$/, { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/login$/);
  });
});
