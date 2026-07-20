import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Landing (marketing) smoke tests.
 * App: apps/landing on http://localhost:5173.
 */

test.describe('Landing page', () => {
  test('loads without console errors and shows hero with CTAs', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');

    // Hero section is present with its heading and CTA buttons.
    await expect(page.locator('#hero')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /visitor management/i,
    );
    await expect(page.getByRole('button', { name: /request demo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /view plans/i })).toBeVisible();

    // Tolerate favicon / asset 404s which are not app-breaking.
    const blocking = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('404'),
    );
    expect(blocking).toEqual([]);
  });

  test('pricing section shows 4 tiers', async ({ page }) => {
    await page.goto('/');
    const pricing = page.locator('#pricing');
    await expect(pricing).toBeVisible();
    await expect(pricing.getByRole('heading', { level: 2 })).toContainText(
      /clear plans/i,
    );

    const tierNames = ['Free', 'Starter', 'Professional', 'Enterprise'];
    for (const name of tierNames) {
      await expect(
        pricing.getByRole('heading', { level: 3, name: new RegExp(`^${name}$`) }),
      ).toHaveCount(1);
    }
  });

  test('demo form fields are visible', async ({ page }) => {
    await page.goto('/');
    const demo = page.locator('#demo');
    await expect(demo).toBeVisible();

    await expect(page.locator('#demo-name')).toBeVisible();
    await expect(page.locator('#demo-email')).toBeVisible();
    await expect(page.locator('#demo-company')).toBeVisible();
    await expect(page.locator('#demo-phone')).toBeVisible();
  });

  test('renders correctly on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('#hero')).toBeVisible();
    await expect(page.getByRole('button', { name: /request demo/i })).toBeVisible();
    // No horizontal overflow on mobile.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
