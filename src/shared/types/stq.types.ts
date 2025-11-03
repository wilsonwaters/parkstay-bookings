import { STQResult } from './common.types';

export interface SkipTheQueueEntry {
  id: number;
  userId: number;
  bookingId: number;
  bookingReference: string;
  isActive: boolean;
  checkIntervalMinutes: number;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  attemptsCount: number;
  maxAttempts: number;
  lastResult?: STQResult;
  successDate?: Date;
  newBookingReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface STQInput {
  bookingId: number;
  bookingReference: string;
  checkIntervalMinutes?: number;
  maxAttempts?: number;
  notes?: string;
}

// Result from executing STQ check
export interface STQExecutionResult {
  stqId: number;
  success: boolean;
  rebooked: boolean;
  newBookingReference?: string;
  error?: Error;
  checkedAt: Date;
}
