import { userSchema } from './user.schema';

describe('User Schema Validation', () => {
  describe('userSchema', () => {
    it('validates valid credentials', () => {
      const validCredentials = {
        email: 'test@example.com',
        password: 'SecurePassword123',
      };

      const result = userSchema.safeParse(validCredentials);
      expect(result.success).toBe(true);
    });

    it('requires email field', () => {
      const invalidCredentials = {
        password: 'SecurePassword123',
      };

      const result = userSchema.safeParse(invalidCredentials);
      expect(result.success).toBe(false);
    });

    it('requires password field', () => {
      const invalidCredentials = {
        email: 'test@example.com',
      };

      const result = userSchema.safeParse(invalidCredentials);
      expect(result.success).toBe(false);
    });

    it('validates email format', () => {
      const invalidCredentials = {
        email: 'not-an-email',
        password: 'SecurePassword123',
      };

      const result = userSchema.safeParse(invalidCredentials);
      expect(result.success).toBe(false);
    });

    it('requires minimum password length', () => {
      const invalidCredentials = {
        email: 'test@example.com',
        password: '123',
      };

      const result = userSchema.safeParse(invalidCredentials);
      expect(result.success).toBe(false);
    });
  });
});
