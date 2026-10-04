/**
 * Authentication Service
 * Stores the ParkStay credentials on the local profile. The password is encrypted with the
 * SecretVault (`users.encrypted_password` holds the envelope).
 */

import { UserRepository } from '../../database/repositories/user.repository';
import {
  SecretUnreadableError,
  type SecretRead,
  type SecretVault,
} from '../../security/secret-vault';
import { User, UserCredentials, UserInput } from '@shared/types';
import type { CredentialStatus } from '@shared/contracts/auth';
import { logger } from '../../utils/logger';

/** A profile row holds credentials until Logout blanks them. */
function hasCredentials(user: User): boolean {
  return user.encryptedPassword !== '';
}

export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly vault: SecretVault
  ) {}

  /**
   * Store user credentials on the local profile. There is one profile, so storing
   * credentials for another email replaces the stored ones; the profile row and its data
   * are kept. Creates the row only when there is none (startup normally ensures it). The
   * same email is refused while its stored password still reads; an unreadable one is
   * replaced (this is the user entering it again).
   */
  async storeCredentials(credentials: UserInput): Promise<User> {
    try {
      const profile = this.userRepository.getFirstUser();
      if (
        profile &&
        hasCredentials(profile) &&
        profile.email === credentials.email &&
        this.readPassword(profile).state === 'ok'
      ) {
        throw new Error('User with this email already exists');
      }

      const encryptedPassword = this.vault.encrypt(credentials.password);
      const profileFields = {
        firstName: credentials.firstName,
        lastName: credentials.lastName,
        phone: credentials.phone,
      };

      const user = profile
        ? this.userRepository.setCredentials(
            profile.id,
            credentials.email,
            encryptedPassword,
            profileFields
          )
        : this.userRepository.create(credentials.email, encryptedPassword, profileFields);

      logger.info(`Credentials stored for user: ${credentials.email}`);
      return user;
    } catch (error) {
      logger.error('Error storing credentials:', error);
      throw error;
    }
  }

  /**
   * What the renderer may see: the email, whether a usable password is stored, and the
   * password's `secretState`, never the password itself. Null when no credentials are stored.
   */
  getCredentialStatus(): CredentialStatus | null {
    const user = this.userRepository.getFirstUser();
    if (!user || (user.email === '' && !hasCredentials(user))) return null;
    const { state } = this.readPassword(user);
    return { email: user.email, hasPassword: state === 'ok', secretState: state };
  }

  /**
   * Get stored credentials, password decrypted. Main process only: never return this over
   * IPC. Null when none are stored; throws `SecretUnreadableError` when the stored password
   * cannot be decrypted.
   */
  async getCredentials(): Promise<UserCredentials | null> {
    const user = this.userRepository.getFirstUser();
    if (!user || !hasCredentials(user)) return null;

    const password = this.readPassword(user);
    if (password.state !== 'ok') {
      if (password.state === 'missing') return null;
      logger.warn('The stored ParkStay password could not be decrypted; it must be entered again');
      throw new SecretUnreadableError('decrypt-failed', password.reason ?? 'Unreadable password');
    }
    return { email: user.email, password: password.value };
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

      const updated = this.userRepository.updateCredentials(
        user.id,
        this.vault.encrypt(newPassword)
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
   * Delete the stored credentials (Logout). Only the credential fields are cleared: the
   * local profile row, and every watch, snipe, booking and notification that belongs to
   * it, are kept (architecture-notes §12.22).
   */
  async deleteCredentials(): Promise<void> {
    try {
      const user = this.userRepository.getFirstUser();
      if (user && hasCredentials(user)) {
        this.userRepository.clearCredentials(user.id);
        logger.info(`Credentials deleted for user: ${user.email}`);
      }
    } catch (error) {
      logger.error('Error deleting credentials:', error);
      throw error;
    }
  }

  /**
   * Check if credentials are stored on the local profile (readable or not)
   */
  hasStoredCredentials(): boolean {
    const user = this.userRepository.getFirstUser();
    return user !== null && hasCredentials(user);
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.userRepository.getFirstUser();
  }

  /** Decrypts the stored password; a `local` envelope is re-encrypted to `os` when possible. */
  private readPassword(user: User): SecretRead {
    return this.vault.read(user.encryptedPassword, (envelope) => {
      this.userRepository.resealPassword(user.id, user.encryptedPassword, envelope);
    });
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
