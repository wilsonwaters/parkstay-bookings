import type { ApiErrorCode } from '@shared/types/api.types';

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION: 'Invalid request',
  FORBIDDEN: 'Forbidden',
  NO_PROFILE: 'No local profile exists',
  NOT_FOUND: 'Not found',
  INTERNAL: 'Unexpected error',
  CAPABILITY: 'The provider does not support this',
  UNKNOWN_PROVIDER: 'Unknown provider',
  PROVIDER_ERROR: 'The provider could not be reached',
  ACCESS_GATE: 'Waiting in the provider queue',
  AUTH_REQUIRED: 'Sign in to the provider first',
  NOT_IMPLEMENTED: 'Not available yet',
};

/**
 * An error with an API code. `ipc/handle.ts` maps it to `{ success: false, code, error }`;
 * any other thrown value becomes `INTERNAL`.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
  }
}
