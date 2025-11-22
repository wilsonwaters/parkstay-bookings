/**
 * Authentication Flow Integration Tests
 * Tests complete authentication workflows
 */

import { AuthService } from '@main/services/auth/AuthService';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { BookingRepository } from '@main/database/repositories/BookingRepository';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { mockUserInput } from '@tests/fixtures/users';
import { createMockBookingInput } from '@tests/fixtures/bookings';

describe('Authentication Flow Integration', () => {
  let dbHelper: TestDatabaseHelper;
  let authService: AuthService;
  let userRepository: UserRepository;
  let bookingRepository: BookingRepository;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('auth-flow');
    await dbHelper.setup();

    const db = dbHelper.getDb();
    userRepository = new UserRepository(db);
    bookingRepository = new BookingRepository(db);
    authService = new AuthService(userRepository);
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('Complete User Lifecycle', () => {
    it('should handle full user registration and login flow', async () => {
      // Step 1: Register new user
      const user = await authService.storeCredentials(mockUserInput);
      expect(user.id).toBeDefined();
      expect(user.email).toBe(mockUserInput.email);

      // Step 2: Verify credentials stored
      expect(authService.hasStoredCredentials()).toBe(true);

      // Step 3: Retrieve and verify credentials (simulating login)
      const credentials = await authService.getCredentials();
      expect(credentials).toBeDefined();
      expect(credentials?.email).toBe(mockUserInput.email);
      expect(credentials?.password).toBe(mockUserInput.password);

      // Step 4: Get current user
      const currentUser = authService.getCurrentUser();
      expect(currentUser).toBeDefined();
      expect(currentUser?.id).toBe(user.id);
    });

    it('should handle user data persistence across service restarts', async () => {
      // Create user
      const user = await authService.storeCredentials(mockUserInput);

      // Create new service instance (simulating app restart)
      const newAuthService = new AuthService(userRepository);

      // Should still have credentials
      expect(newAuthService.hasStoredCredentials()).toBe(true);

      const credentials = await newAuthService.getCredentials();
      expect(credentials?.email).toBe(mockUserInput.email);
      expect(credentials?.password).toBe(mockUserInput.password);
    });

    it('should handle credential updates', async () => {
      // Initial registration
      await authService.storeCredentials(mockUserInput);

      // Update password
      const newPassword = 'NewSecurePassword123!';
      await authService.updateCredentials(mockUserInput.email, newPassword);

      // Verify updated password
      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe(newPassword);
      expect(credentials?.email).toBe(mockUserInput.email);
    });

    it('should handle account deletion', async () => {
      // Create user with bookings
      const user = await authService.storeCredentials(mockUserInput);

      const booking1 = bookingRepository.create(user.id, createMockBookingInput());
      const booking2 = bookingRepository.create(user.id, createMockBookingInput());

      // Delete credentials
      await authService.deleteCredentials();

      // User should be deleted
      expect(authService.hasStoredCredentials()).toBe(false);
      const credentials = await authService.getCredentials();
      expect(credentials).toBeNull();

      // Bookings should also be deleted (cascade)
      const remainingBooking1 = bookingRepository.findById(booking1.id);
      const remainingBooking2 = bookingRepository.findById(booking2.id);
      expect(remainingBooking1).toBeNull();
      expect(remainingBooking2).toBeNull();
    });
  });

  describe('Security Tests', () => {
    it('should never store passwords in plain text', async () => {
      const user = await authService.storeCredentials(mockUserInput);

      // Check database directly
      const db = dbHelper.getDb();
      const rawUser = db
        .prepare('SELECT encrypted_password FROM users WHERE id = ?')
        .get(user.id) as { encrypted_password: string };

      // Password should not match plain text
      expect(rawUser.encrypted_password).not.toBe(mockUserInput.password);
      expect(rawUser.encrypted_password).not.toContain(mockUserInput.password);
    });

    it('should use unique encryption for each user', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);

      // Delete first user
      await authService.deleteCredentials();

      // Create another user with same password
      const user2 = await authService.storeCredentials(mockUserInput);

      // Encrypted passwords should be different
      expect(user1.encryptedPassword).not.toBe(user2.encryptedPassword);
      expect(user1.encryptionIv).not.toBe(user2.encryptionIv);
    });

    it('should handle password with special characters', async () => {
      const specialPassword = 'P@$$w0rd!#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      await authService.storeCredentials({
        ...mockUserInput,
        password: specialPassword,
      });

      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe(specialPassword);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'A'.repeat(500) + '!1aB';
      await authService.storeCredentials({
        ...mockUserInput,
        password: longPassword,
      });

      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe(longPassword);
    });

    it('should handle unicode characters in password', async () => {
      const unicodePassword = 'Password123!你好世界🔒';
      await authService.storeCredentials({
        ...mockUserInput,
        password: unicodePassword,
      });

      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe(unicodePassword);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid credential updates', async () => {
      await authService.storeCredentials(mockUserInput);

      // Perform multiple rapid updates
      for (let i = 0; i < 10; i++) {
        await authService.updateCredentials(mockUserInput.email, `Password${i}!`);
      }

      // Final password should be correct
      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe('Password9!');
    });

    it('should handle concurrent credential access', async () => {
      await authService.storeCredentials(mockUserInput);

      // Simulate concurrent reads
      const promises = Array.from({ length: 10 }, () => authService.getCredentials());

      const results = await Promise.all(promises);

      // All results should be identical
      results.forEach((result) => {
        expect(result?.email).toBe(mockUserInput.email);
        expect(result?.password).toBe(mockUserInput.password);
      });
    });

    it('should maintain data integrity after failed operations', async () => {
      await authService.storeCredentials(mockUserInput);

      // Attempt invalid update (non-existent user)
      try {
        await authService.updateCredentials('wrong@email.com', 'newpass');
      } catch (error) {
        // Expected to fail
      }

      // Original credentials should be unchanged
      const credentials = await authService.getCredentials();
      expect(credentials?.email).toBe(mockUserInput.email);
      expect(credentials?.password).toBe(mockUserInput.password);
    });
  });
});
