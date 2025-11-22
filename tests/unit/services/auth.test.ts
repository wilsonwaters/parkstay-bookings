/**
 * AuthService Unit Tests
 * Tests authentication, credential encryption, and user management
 */

import { AuthService } from '@main/services/auth/AuthService';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { mockUserInput, mockUser, invalidUserInputs } from '@tests/fixtures/users';
import { expectAsyncThrow } from '@tests/utils/test-helpers';

describe('AuthService', () => {
  let dbHelper: TestDatabaseHelper;
  let authService: AuthService;
  let userRepository: UserRepository;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('auth-service');
    await dbHelper.setup();
    userRepository = new UserRepository(dbHelper.getDb());
    authService = new AuthService(userRepository);
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('storeCredentials', () => {
    it('should store user credentials with encryption', async () => {
      const user = await authService.storeCredentials(mockUserInput);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(mockUserInput.email);
      expect(user.firstName).toBe(mockUserInput.firstName);
      expect(user.lastName).toBe(mockUserInput.lastName);
      expect(user.phone).toBe(mockUserInput.phone);

      // Verify password is encrypted (not plain text)
      expect(user.encryptedPassword).not.toBe(mockUserInput.password);
      expect(user.encryptedPassword).toBeTruthy();
      expect(user.encryptionKey).toBeTruthy();
      expect(user.encryptionIv).toBeTruthy();
      expect(user.encryptionAuthTag).toBeTruthy();
    });

    it('should throw error if user already exists', async () => {
      await authService.storeCredentials(mockUserInput);

      await expectAsyncThrow(
        () => authService.storeCredentials(mockUserInput),
        'User with this email already exists'
      );
    });

    it('should store multiple different users', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);
      const user2Input = {
        ...mockUserInput,
        email: 'different@example.com',
      };
      const user2 = await authService.storeCredentials(user2Input);

      expect(user1.id).not.toBe(user2.id);
      expect(user1.email).not.toBe(user2.email);
    });
  });

  describe('getCredentials', () => {
    it('should retrieve and decrypt stored credentials', async () => {
      await authService.storeCredentials(mockUserInput);
      const credentials = await authService.getCredentials();

      expect(credentials).toBeDefined();
      expect(credentials?.email).toBe(mockUserInput.email);
      expect(credentials?.password).toBe(mockUserInput.password);
    });

    it('should return null if no credentials stored', async () => {
      const credentials = await authService.getCredentials();
      expect(credentials).toBeNull();
    });

    it('should correctly decrypt password', async () => {
      await authService.storeCredentials(mockUserInput);
      const credentials = await authService.getCredentials();

      // Verify the decrypted password matches original
      expect(credentials?.password).toBe(mockUserInput.password);
    });
  });

  describe('updateCredentials', () => {
    it('should update user password', async () => {
      await authService.storeCredentials(mockUserInput);
      const newPassword = 'NewPassword456!';

      const updatedUser = await authService.updateCredentials(mockUserInput.email, newPassword);

      expect(updatedUser).toBeDefined();
      expect(updatedUser.email).toBe(mockUserInput.email);

      // Verify new password is stored correctly
      const credentials = await authService.getCredentials();
      expect(credentials?.password).toBe(newPassword);
    });

    it('should throw error if user not found', async () => {
      await expectAsyncThrow(
        () => authService.updateCredentials('nonexistent@example.com', 'newpass'),
        'User not found'
      );
    });

    it('should encrypt new password differently than old', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);
      const oldEncrypted = user1.encryptedPassword;

      const user2 = await authService.updateCredentials(mockUserInput.email, 'NewPassword789!');

      expect(user2.encryptedPassword).not.toBe(oldEncrypted);
    });
  });

  describe('deleteCredentials', () => {
    it('should delete stored credentials', async () => {
      await authService.storeCredentials(mockUserInput);
      expect(authService.hasStoredCredentials()).toBe(true);

      await authService.deleteCredentials();

      expect(authService.hasStoredCredentials()).toBe(false);
      const credentials = await authService.getCredentials();
      expect(credentials).toBeNull();
    });

    it('should not throw error if no credentials exist', async () => {
      await expect(authService.deleteCredentials()).resolves.not.toThrow();
    });
  });

  describe('hasStoredCredentials', () => {
    it('should return false when no credentials stored', () => {
      expect(authService.hasStoredCredentials()).toBe(false);
    });

    it('should return true when credentials stored', async () => {
      await authService.storeCredentials(mockUserInput);
      expect(authService.hasStoredCredentials()).toBe(true);
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      await authService.storeCredentials(mockUserInput);
      const user = authService.getCurrentUser();

      expect(user).toBeDefined();
      expect(user?.email).toBe(mockUserInput.email);
    });

    it('should return null if no user exists', () => {
      const user = authService.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('validateCredentials', () => {
    it('should validate correct credentials', () => {
      const result = authService.validateCredentials(mockUserInput);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid email format', () => {
      const result = authService.validateCredentials({
        ...mockUserInput,
        email: 'invalid-email',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject short password', () => {
      const result = authService.validateCredentials({
        ...mockUserInput,
        password: 'short',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject invalid phone format', () => {
      const result = authService.validateCredentials({
        ...mockUserInput,
        phone: 'abc123',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid phone format');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const result = authService.validateCredentials({
        email: 'invalid',
        password: 'short',
        phone: 'abc',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should allow optional phone field', () => {
      const result = authService.validateCredentials({
        ...mockUserInput,
        phone: undefined,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Encryption', () => {
    it('should use different IV for each encryption', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);
      await authService.deleteCredentials();

      const user2 = await authService.storeCredentials(mockUserInput);

      // Even with same password, IV should be different
      expect(user1.encryptionIv).not.toBe(user2.encryptionIv);
      // And encrypted password should be different
      expect(user1.encryptedPassword).not.toBe(user2.encryptedPassword);
    });

    it('should maintain encryption integrity', async () => {
      const testPassword = 'SuperSecurePassword123!@#';
      await authService.storeCredentials({
        ...mockUserInput,
        password: testPassword,
      });

      const credentials = await authService.getCredentials();

      expect(credentials?.password).toBe(testPassword);
    });

    it('should handle special characters in password', async () => {
      const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      await authService.storeCredentials({
        ...mockUserInput,
        password: specialPassword,
      });

      const credentials = await authService.getCredentials();

      expect(credentials?.password).toBe(specialPassword);
    });

    it('should handle long passwords', async () => {
      const longPassword = 'A'.repeat(1000) + '!1aB';
      await authService.storeCredentials({
        ...mockUserInput,
        password: longPassword,
      });

      const credentials = await authService.getCredentials();

      expect(credentials?.password).toBe(longPassword);
    });
  });
});
