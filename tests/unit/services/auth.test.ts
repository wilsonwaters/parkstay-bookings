/**
 * AuthService Unit Tests
 * Tests authentication, credential encryption (SecretVault envelopes), the password's
 * secret state, and user management
 */

import { AuthService } from '@main/services/auth/AuthService';
import { UserRepository } from '@main/database/repositories/user.repository';
import { SecretUnreadableError } from '@main/security/secret-vault';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { mockUserInput } from '@tests/fixtures/users';
import { expectAsyncThrow } from '@tests/utils/test-helpers';
import {
  FakeSafeStorage,
  FOREIGN_OS_KEY,
  removeUserData,
  testVault,
  type TestVault,
} from '@tests/utils/fake-safe-storage';

describe('AuthService', () => {
  let dbHelper: TestDatabaseHelper;
  let authService: AuthService;
  let userRepository: UserRepository;
  let t: TestVault;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('auth-service');
    await dbHelper.setup();
    userRepository = new UserRepository(dbHelper.getDb());
    t = testVault();
    authService = new AuthService(userRepository, t.vault);
  });

  afterEach(async () => {
    await dbHelper.teardown();
    removeUserData(t.userDataDir);
  });

  /** The raw `users` columns of the profile row. */
  const storedRow = () =>
    dbHelper
      .getDb()
      .prepare(
        'SELECT encrypted_password, encryption_key, encryption_iv, encryption_auth_tag FROM users'
      )
      .get() as Record<string, string>;

  describe('storeCredentials', () => {
    it('should store user credentials with encryption', async () => {
      const user = await authService.storeCredentials(mockUserInput);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(mockUserInput.email);
      expect(user.firstName).toBe(mockUserInput.firstName);
      expect(user.lastName).toBe(mockUserInput.lastName);
      expect(user.phone).toBe(mockUserInput.phone);

      // The password is a vault envelope; the v1.x columns are blank
      expect(user.encryptedPassword).toMatch(/^vault:v1:os:/);
      expect(user.encryptedPassword).not.toContain(mockUserInput.password);
      expect(storedRow()).toEqual({
        encrypted_password: user.encryptedPassword,
        encryption_key: '',
        encryption_iv: '',
        encryption_auth_tag: '',
      });
    });

    it('should throw error if user already exists', async () => {
      await authService.storeCredentials(mockUserInput);

      await expectAsyncThrow(
        () => authService.storeCredentials(mockUserInput),
        'User with this email already exists'
      );
    });

    it('keeps one local profile: other credentials replace the stored ones on the same row', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);
      const user2 = await authService.storeCredentials({
        ...mockUserInput,
        email: 'different@example.com',
      });

      expect(user2.id).toBe(user1.id);
      expect(user2.email).toBe('different@example.com');
      expect(userRepository.findAll()).toHaveLength(1);
      await expect(authService.getCredentials()).resolves.toEqual({
        email: 'different@example.com',
        password: mockUserInput.password,
      });
    });

    it('writes credentials onto the existing local profile row instead of adding a user', async () => {
      const profile = userRepository.createLocalProfileIfMissing();

      const user = await authService.storeCredentials(mockUserInput);

      expect(user.id).toBe(profile.id);
      expect(userRepository.findAll()).toHaveLength(1);
      expect(authService.hasStoredCredentials()).toBe(true);
    });
  });

  describe('getCredentialStatus', () => {
    it('returns the email and hasPassword, never the password', async () => {
      await authService.storeCredentials(mockUserInput);

      const status = authService.getCredentialStatus();

      expect(status).toEqual({
        email: mockUserInput.email,
        hasPassword: true,
        secretState: 'ok',
      });
      expect(JSON.stringify(status)).not.toContain(mockUserInput.password);
    });

    it('reports an undecryptable password as unreadable (hasPassword false) and never overwrites it', async () => {
      // Saved under another machine's or account's OS key
      const other = testVault({ safeStorage: new FakeSafeStorage(FOREIGN_OS_KEY) });
      try {
        await new AuthService(userRepository, other.vault).storeCredentials(mockUserInput);
      } finally {
        removeUserData(other.userDataDir);
      }
      const before = storedRow();

      expect(authService.getCredentialStatus()).toEqual({
        email: mockUserInput.email,
        hasPassword: false,
        secretState: 'unreadable',
      });
      await expect(authService.getCredentials()).rejects.toBeInstanceOf(SecretUnreadableError);
      expect(authService.hasStoredCredentials()).toBe(true);
      expect(storedRow()).toEqual(before);

      // Entering it again (same email) is the explicit save that replaces it
      await authService.storeCredentials(mockUserInput);
      expect(authService.getCredentialStatus()).toMatchObject({ secretState: 'ok' });
      await expect(authService.getCredentials()).resolves.toMatchObject({
        password: mockUserInput.password,
      });
    });

    it('a leftover legacy (v1.x) ciphertext reads as unreadable', async () => {
      await authService.storeCredentials(mockUserInput);
      dbHelper
        .getDb()
        .prepare("UPDATE users SET encrypted_password = 'a1b2c3d4', encryption_iv = 'aa'")
        .run();

      expect(authService.getCredentialStatus()).toMatchObject({
        hasPassword: false,
        secretState: 'unreadable',
      });
    });

    it('reports a legacy empty password as missing', async () => {
      await authService.storeCredentials(mockUserInput);
      dbHelper.getDb().prepare("UPDATE users SET encrypted_password = ''").run();

      expect(authService.getCredentialStatus()).toEqual({
        email: mockUserInput.email,
        hasPassword: false,
        secretState: 'missing',
      });
      await expect(authService.getCredentials()).resolves.toBeNull();
    });

    it('is null with no credentials stored, including after Logout', async () => {
      expect(authService.getCredentialStatus()).toBeNull();
      await authService.storeCredentials(mockUserInput);
      await authService.deleteCredentials();
      expect(authService.getCredentialStatus()).toBeNull();
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

    it('clears only the credential fields and keeps the profile row and its profile fields', async () => {
      const stored = await authService.storeCredentials(mockUserInput);

      await authService.deleteCredentials();

      const row = userRepository.findById(stored.id);
      expect(row).not.toBeNull();
      // Since v8 the credential columns are nullable: cleared reads like never signed in
      expect(storedRow()).toEqual({
        encrypted_password: null,
        encryption_key: null,
        encryption_iv: null,
        encryption_auth_tag: null,
      });
      expect(row).toMatchObject({
        email: '',
        encryptedPassword: '',
        firstName: mockUserInput.firstName,
        lastName: mockUserInput.lastName,
        phone: mockUserInput.phone,
      });
    });
  });

  describe('hasStoredCredentials', () => {
    it('should return false when no credentials stored', () => {
      expect(authService.hasStoredCredentials()).toBe(false);
    });

    it('should return false for a local profile without credentials', async () => {
      userRepository.createLocalProfileIfMissing();

      expect(authService.hasStoredCredentials()).toBe(false);
      await expect(authService.getCredentials()).resolves.toBeNull();
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

    it('should return the local profile, without credentials, before any sign-in', () => {
      // Migration v8 seeds the profile row with NULL credentials, read as ''.
      const user = authService.getCurrentUser();
      expect(user).toMatchObject({ id: 1, email: '', encryptedPassword: '' });
      expect(authService.hasStoredCredentials()).toBe(false);
    });

    it('should return null if no user exists', () => {
      dbHelper.getDb().exec('DELETE FROM users');
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
    it('should encrypt the same password differently each time', async () => {
      const user1 = await authService.storeCredentials(mockUserInput);
      await authService.deleteCredentials();

      const user2 = await authService.storeCredentials(mockUserInput);

      expect(user1.encryptedPassword).not.toBe(user2.encryptedPassword);
    });

    it('re-encrypts a local-key password to OS encryption once that is available, and stores it', async () => {
      t.safeStorage.available = false;
      await authService.storeCredentials(mockUserInput);
      expect(storedRow().encrypted_password).toMatch(/^vault:v1:local:/);

      t.safeStorage.available = true;
      await expect(authService.getCredentials()).resolves.toMatchObject({
        password: mockUserInput.password,
      });
      expect(storedRow().encrypted_password).toMatch(/^vault:v1:os:/);
      expect(t.vault.decrypt(storedRow().encrypted_password)).toBe(mockUserInput.password);
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
