/**
 * E2E Login Tests
 * Tests login flow in the renderer process
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Login Flow', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto('/');
  });

  test('should display login page on first launch', async () => {
    // Check for login page elements
    await expect(page.locator('h1')).toContainText('ParkStay Bookings');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for invalid email', async () => {
    await page.fill('input[type="email"]', 'invalid-email');
    await page.fill('input[type="password"]', 'ValidPassword123!');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('.error-message')).toContainText('Invalid email');
  });

  test('should show validation errors for short password', async () => {
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'short');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('.error-message')).toContainText('at least 8 characters');
  });

  test('should successfully register new user', async () => {
    // Fill in registration form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="phone"]', '+61412345678');

    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should persist login across page refreshes', async () => {
    // Register user
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Reload page
    await page.reload();

    // Should still be on dashboard (not redirected to login)
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should handle logout', async () => {
    // Register and login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);

    // Click logout
    await page.click('button[aria-label="Logout"]');

    // Should show confirmation dialog
    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await page.click('button:has-text("Confirm")');

    // Should redirect to login
    await expect(page).toHaveURL('/');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('should show appropriate error for network issues', async () => {
    // Simulate offline mode
    await page.context().setOffline(true);

    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.click('button[type="submit"]');

    // Should show network error
    await expect(page.locator('.error-message')).toContainText('network', {
      ignoreCase: true,
    });

    // Restore online mode
    await page.context().setOffline(false);
  });
});
