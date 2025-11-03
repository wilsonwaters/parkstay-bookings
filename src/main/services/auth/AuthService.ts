/**
 * Authentication Service
 * Handles user authentication, credential encryption, and session management
 */

import crypto from 'crypto';
import { machineIdSync } from 'node-machine-id';
import { UserRepository } from '../../database/repositories/UserRepository';
import { User, UserCredentials, UserInput } from '@shared/types';
import { logger } from '../../utils/logger';

// Secret salt for key derivation (in production, this would be stored securely)
const APP_SECRET = 'parkstay-bookings-v1-secret';

interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class AuthService {
  private userRepository: UserRepository;
  private encryptionKey: Buffer | null = null;
  private machineId: string;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
    this.machineId = machineIdSync();
  }

  /**
   * Store user credentials
   */
  async storeCredentials(credentials: UserInput): Promise<User> {
    try {
      // Check if user already exists
      const existing = this.userRepository.findByEmail(credentials.email);
      if (existing) {
        throw new Error('User with this email already exists');
      }

      // Encrypt password
      const encryptedData = await this.encryptPassword(credentials.password);

      // Store encryption key for this user
      const userEncryptionKey = this.generateEncryptionKey();

      // Create user
      const user = this.userRepository.create(
        credentials.email,
        encryptedData.encrypted,
        userEncryptionKey,
        encryptedData.iv,
        encryptedData.authTag,
        {
          firstName: credentials.firstName,
          lastName: credentials.lastName,
          phone: credentials.phone,
        }
      );

      logger.info(`Credentials stored for user: ${credentials.email}`);
      return user;
    } catch (error) {
      logger.error('Error storing credentials:', error);
      throw error;
    }
  }

  /**
   * Get stored credentials
   */
  async getCredentials(): Promise<UserCredentials | null> {
    try {
      // Get first user (single-user app)
      const user = this.userRepository.getFirstUser();
      if (!user) {
        return null;
      }

      // Decrypt password
      const password = await this.decryptPassword({
        encrypted: user.encryptedPassword,
        iv: user.encryptionIv,
        authTag: user.encryptionAuthTag,
      });

      return {
        email: user.email,
        password,
      };
    } catch (error) {
      logger.error('Error getting credentials:', error);
      throw error;
    }
  }

  /**
   * Update user credentials
   */
  async updateCredentials(email: string, newPassword: string): Promise<User> {
    try {
      const user = this.userRepository.findByEmail(email);
      if (!user) {
        throw new Error('User not found');
      }

      // Encrypt new password
      const encryptedData = await this.encryptPassword(newPassword);

      // Update user
      const updated = this.userRepository.updateCredentials(
        user.id,
        encryptedData.encrypted,
        user.encryptionKey,
        encryptedData.iv,
        encryptedData.authTag
      );

      if (!updated) {
        throw new Error('Failed to update credentials');
      }

      logger.info(`Credentials updated for user: ${email}`);
      return updated;
    } catch (error) {
      logger.error('Error updating credentials:', error);
      throw error;
    }
  }

  /**
   * Delete user credentials
   */
  async deleteCredentials(): Promise<void> {
    try {
      const user = this.userRepository.getFirstUser();
      if (user) {
        this.userRepository.deleteById(user.id);
        logger.info(`Credentials deleted for user: ${user.email}`);
      }
    } catch (error) {
      logger.error('Error deleting credentials:', error);
      throw error;
    }
  }

  /**
   * Check if user exists
   */
  hasStoredCredentials(): boolean {
    return this.userRepository.hasUsers();
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.userRepository.getFirstUser();
  }

  /**
   * Encrypt password using AES-256-GCM
   */
  private async encryptPassword(password: string): Promise<EncryptedData> {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      let encrypted = cipher.update(password, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      logger.error('Error encrypting password:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  /**
   * Decrypt password using AES-256-GCM
   */
  private async decryptPassword(data: EncryptedData): Promise<string> {
    try {
      const key = await this.getEncryptionKey();

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(data.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting password:', error);
      throw new Error('Failed to decrypt password');
    }
  }

  /**
   * Get or generate encryption key
   */
  private async getEncryptionKey(): Promise<Buffer> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // Derive key from machine ID and app secret
    this.encryptionKey = crypto.pbkdf2Sync(
      this.machineId + APP_SECRET,
      'parkstay-salt',
      100000,
      32,
      'sha512'
    );

    return this.encryptionKey;
  }

  /**
   * Generate a unique encryption key for user storage
   */
  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate credentials format
   */
  validateCredentials(credentials: UserInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!credentials.email || !emailRegex.test(credentials.email)) {
      errors.push('Invalid email format');
    }

    // Validate password
    if (!credentials.password || credentials.password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    // Validate phone if provided
    if (credentials.phone) {
      const phoneRegex = /^\+?[0-9\s\-()]+$/;
      if (!phoneRegex.test(credentials.phone)) {
        errors.push('Invalid phone format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
