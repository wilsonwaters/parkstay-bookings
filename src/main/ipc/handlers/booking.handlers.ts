/**
 * Booking IPC Handlers
 * Handles booking-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { BookingService } from '../../services/booking/BookingService';
import { Booking, BookingInput, APIResponse } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerBookingHandlers(bookingService: BookingService, getUserId: () => number): void {
  /**
   * Create new booking
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_CREATE,
    async (
      _event: IpcMainInvokeEvent,
      input: BookingInput
    ): Promise<APIResponse<Booking>> => {
      try {
        const userId = getUserId();
        const booking = await bookingService.createBooking(userId, input);

        return {
          success: true,
          data: booking,
        };
      } catch (error: any) {
        logger.error('Error creating booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to create booking',
        };
      }
    }
  );

  /**
   * Get booking by ID
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_GET,
    async (_event: IpcMainInvokeEvent, id: number): Promise<APIResponse<Booking | null>> => {
      try {
        const booking = await bookingService.getBooking(id);

        return {
          success: true,
          data: booking,
        };
      } catch (error: any) {
        logger.error('Error getting booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to get booking',
        };
      }
    }
  );

  /**
   * List all bookings
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_LIST,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<Booking[]>> => {
      try {
        const userId = getUserId();
        const bookings = await bookingService.listBookings(userId);

        return {
          success: true,
          data: bookings,
        };
      } catch (error: any) {
        logger.error('Error listing bookings:', error);
        return {
          success: false,
          error: error.message || 'Failed to list bookings',
        };
      }
    }
  );

  /**
   * Update booking
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_UPDATE,
    async (
      _event: IpcMainInvokeEvent,
      id: number,
      updates: Partial<BookingInput>
    ): Promise<APIResponse<Booking>> => {
      try {
        const booking = await bookingService.updateBooking(id, updates);

        return {
          success: true,
          data: booking,
        };
      } catch (error: any) {
        logger.error('Error updating booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to update booking',
        };
      }
    }
  );

  /**
   * Delete booking
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_DELETE,
    async (_event: IpcMainInvokeEvent, id: number): Promise<APIResponse<boolean>> => {
      try {
        await bookingService.deleteBooking(id);

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error deleting booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to delete booking',
        };
      }
    }
  );

  /**
   * Sync booking with ParkStay
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_SYNC,
    async (_event: IpcMainInvokeEvent, id: number): Promise<APIResponse<Booking>> => {
      try {
        const booking = await bookingService.syncBooking(id);

        return {
          success: true,
          data: booking,
        };
      } catch (error: any) {
        logger.error('Error syncing booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to sync booking',
        };
      }
    }
  );

  /**
   * Sync all bookings
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_SYNC_ALL,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        const userId = getUserId();
        const bookings = await bookingService.listBookings(userId);

        // Sync each booking
        for (const booking of bookings) {
          await bookingService.syncBooking(booking.id);
        }

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error syncing all bookings:', error);
        return {
          success: false,
          error: error.message || 'Failed to sync bookings',
        };
      }
    }
  );

  /**
   * Import booking from ParkStay
   */
  ipcMain.handle(
    IPC_CHANNELS.BOOKING_IMPORT,
    async (
      _event: IpcMainInvokeEvent,
      bookingReference: string
    ): Promise<APIResponse<Booking>> => {
      try {
        const userId = getUserId();
        const booking = await bookingService.importBooking(userId, bookingReference);

        return {
          success: true,
          data: booking,
        };
      } catch (error: any) {
        logger.error('Error importing booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to import booking',
        };
      }
    }
  );

  logger.info('Booking IPC handlers registered');
}
