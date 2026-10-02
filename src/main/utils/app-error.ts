import type { ApiErrorCode } from '@shared/types/api.types';

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION: 'Invalid request',
  FORBIDDEN: 'Forbidden',
  NO_PROFILE: 'No local profile exists',
  NOT_FOUND: 'Not found',
  INTERNAL: 'Unexpected error',
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
