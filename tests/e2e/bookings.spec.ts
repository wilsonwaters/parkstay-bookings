/**
 * E2E Bookings Tests
 * Tests booking management workflows
 */

import { test, expect, Page } from '@playwright/test';

test.describe('Bookings Management', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto('/');

    // Login first
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'SecurePassword123!');
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);

    // Navigate to bookings
    await page.click('a[href="/bookings"]');
    await expect(page).toHaveURL(/\/bookings/);
  });

  test('should display empty bookings list initially', async () => {
    await expect(page.locator('.bookings-list')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('No bookings yet');
  });

  test('should create a manual booking', async () => {
    // Click add booking button
    await page.click('button:has-text("Add Booking")');

    // Fill in booking form
    await page.fill('input[name="bookingReference"]', 'BK123456');
    await page.fill('input[name="parkName"]', 'Karijini National Park');
    await page.fill('input[name="campgroundName"]', 'Dales Campground');
    await page.fill('input[name="siteNumber"]', '12');
    await page.selectOption('select[name="siteType"]', 'Unpowered');

    // Set dates (30 days from now)
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + 30);
    const departureDate = new Date(arrivalDate);
    departureDate.setDate(departureDate.getDate() + 3);

    await page.fill('input[name="arrivalDate"]', arrivalDate.toISOString().split('T')[0]);
    await page.fill(
      'input[name="departureDate"]',
      departureDate.toISOString().split('T')[0]
    );

    await page.fill('input[name="numGuests"]', '2');
    await page.fill('input[name="totalCost"]', '105.00');

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Booking")');

    // Should show success message
    await expect(page.locator('.toast-success')).toContainText('Booking created');

    // Should appear in list
    await expect(page.locator('.booking-card')).toContainText('BK123456');
    await expect(page.locator('.booking-card')).toContainText('Karijini National Park');
  });

  test('should validate booking form', async () => {
    await page.click('button:has-text("Add Booking")');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Should show validation errors
    await expect(page.locator('.field-error')).toHaveCount(5); // Multiple required fields
  });

  test('should view booking details', async () => {
    // Create a booking first (reuse previous test logic or use fixture)
    await page.click('button:has-text("Add Booking")');
    await page.fill('input[name="bookingReference"]', 'BK123456');
    await page.fill('input[name="parkName"]', 'Test Park');
    await page.fill('input[name="campgroundName"]', 'Test Campground');
    // ... fill other fields ...
    await page.click('button[type="submit"]');

    // Click on booking card
    await page.click('.booking-card:has-text("BK123456")');

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/bookings\/\d+/);
    await expect(page.locator('.booking-detail')).toContainText('BK123456');
    await expect(page.locator('.booking-detail')).toContainText('Test Park');
  });

  test('should edit booking', async () => {
    // Create booking
    await page.click('button:has-text("Add Booking")');
    await page.fill('input[name="bookingReference"]', 'BK123456');
    await page.fill('input[name="parkName"]', 'Test Park');
    await page.fill('input[name="campgroundName"]', 'Test Campground');
    // ... fill required fields ...
    await page.click('button[type="submit"]');

    // Navigate to detail page
    await page.click('.booking-card');

    // Click edit button
    await page.click('button:has-text("Edit")');

    // Update site number
    await page.fill('input[name="siteNumber"]', '99');

    // Save changes
    await page.click('button[type="submit"]:has-text("Save")');

    // Should show success message
    await expect(page.locator('.toast-success')).toContainText('updated');

    // Should reflect changes
    await expect(page.locator('.booking-detail')).toContainText('Site 99');
  });

  test('should cancel booking with confirmation', async () => {
    // Create booking
    await page.click('button:has-text("Add Booking")');
    await page.fill('input[name="bookingReference"]', 'BK123456');
    // ... fill required fields ...
    await page.click('button[type="submit"]');

    // Navigate to detail page
    await page.click('.booking-card');

    // Click cancel button
    await page.click('button:has-text("Cancel Booking")');

    // Should show confirmation dialog
    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await expect(page.locator('.confirm-dialog')).toContainText(
      'Are you sure you want to cancel'
    );

    // Confirm cancellation
    await page.click('.confirm-dialog button:has-text("Confirm")');

    // Should show success message
    await expect(page.locator('.toast-success')).toContainText('cancelled');

    // Status should be updated
    await expect(page.locator('.booking-status')).toContainText('Cancelled');
  });

  test('should delete booking with confirmation', async () => {
    // Create booking
    await page.click('button:has-text("Add Booking")');
    await page.fill('input[name="bookingReference"]', 'BK123456');
    // ... fill required fields ...
    await page.click('button[type="submit"]');

    // Navigate to detail page
    await page.click('.booking-card');

    // Click delete button
    await page.click('button:has-text("Delete")');

    // Confirm deletion
    await expect(page.locator('.confirm-dialog')).toBeVisible();
    await page.click('.confirm-dialog button:has-text("Delete")');

    // Should redirect to list
    await expect(page).toHaveURL(/\/bookings$/);

    // Booking should not appear in list
    await expect(page.locator('.booking-card:has-text("BK123456")')).not.toBeVisible();
  });

  test('should filter bookings by status', async () => {
    // Create multiple bookings with different statuses
    // ... create confirmed booking ...
    // ... create cancelled booking ...

    // Filter by upcoming
    await page.click('button:has-text("Upcoming")');
    await expect(page.locator('.booking-card')).toHaveCount(1);

    // Filter by past
    await page.click('button:has-text("Past")');
    // Expect different count

    // Filter by cancelled
    await page.click('button:has-text("Cancelled")');
    await expect(page.locator('.booking-card')).toHaveCount(1);
  });
});
