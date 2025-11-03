/**
 * Booking Service
 * Handles booking management operations
 */

import { BookingRepository } from '../../database/repositories/BookingRepository';
import { Booking, BookingInput, BookingStatus } from '@shared/types';
import { logger } from '../../utils/logger';

export class BookingService {
  private bookingRepository: BookingRepository;

  constructor(bookingRepository: BookingRepository) {
    this.bookingRepository = bookingRepository;
  }

  /**
   * Create a new booking
   */
  async createBooking(userId: number, input: BookingInput): Promise<Booking> {
    try {
      // Validate input
      this.validateBookingInput(input);

      // Check if booking already exists
      const existing = this.bookingRepository.findByReference(input.bookingReference);
      if (existing) {
        throw new Error(`Booking with reference ${input.bookingReference} already exists`);
      }

      // Create booking
      const booking = this.bookingRepository.create(userId, input);

      logger.info(`Booking created: ${booking.bookingReference}`);
      return booking;
    } catch (error) {
      logger.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Get booking by ID
   */
  async getBooking(id: number): Promise<Booking | null> {
    try {
      return this.bookingRepository.findById(id);
    } catch (error) {
      logger.error(`Error getting booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get booking by reference
   */
  async getBookingByReference(reference: string): Promise<Booking | null> {
    try {
      return this.bookingRepository.findByReference(reference);
    } catch (error) {
      logger.error(`Error getting booking by reference ${reference}:`, error);
      throw error;
    }
  }

  /**
   * List all bookings for a user
   */
  async listBookings(userId: number): Promise<Booking[]> {
    try {
      return this.bookingRepository.findByUserId(userId);
    } catch (error) {
      logger.error(`Error listing bookings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get upcoming bookings
   */
  async getUpcomingBookings(userId: number): Promise<Booking[]> {
    try {
      return this.bookingRepository.findUpcoming(userId);
    } catch (error) {
      logger.error(`Error getting upcoming bookings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get past bookings
   */
  async getPastBookings(userId: number): Promise<Booking[]> {
    try {
      return this.bookingRepository.findPast(userId);
    } catch (error) {
      logger.error(`Error getting past bookings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update booking details
   */
  async updateBooking(id: number, updates: Partial<BookingInput>): Promise<Booking> {
    try {
      const existing = await this.getBooking(id);
      if (!existing) {
        throw new Error(`Booking ${id} not found`);
      }

      // Validate updates if dates are being changed
      if (updates.arrivalDate || updates.departureDate) {
        const arrival = updates.arrivalDate
          ? new Date(updates.arrivalDate)
          : existing.arrivalDate;
        const departure = updates.departureDate
          ? new Date(updates.departureDate)
          : existing.departureDate;

        if (departure <= arrival) {
          throw new Error('Departure date must be after arrival date');
        }
      }

      const updated = this.bookingRepository.update(id, updates);
      if (!updated) {
        throw new Error(`Failed to update booking ${id}`);
      }

      logger.info(`Booking updated: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Cancel booking
   */
  async cancelBooking(id: number): Promise<Booking> {
    try {
      const booking = await this.getBooking(id);
      if (!booking) {
        throw new Error(`Booking ${id} not found`);
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new Error('Booking is already cancelled');
      }

      const updated = this.bookingRepository.updateStatus(id, BookingStatus.CANCELLED);
      if (!updated) {
        throw new Error(`Failed to cancel booking ${id}`);
      }

      logger.info(`Booking cancelled: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error cancelling booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete booking
   */
  async deleteBooking(id: number): Promise<void> {
    try {
      const booking = await this.getBooking(id);
      if (!booking) {
        throw new Error(`Booking ${id} not found`);
      }

      this.bookingRepository.deleteById(id);
      logger.info(`Booking deleted: ${id}`);
    } catch (error) {
      logger.error(`Error deleting booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Import booking from ParkStay
   * This is a placeholder - actual implementation would involve ParkStay API
   */
  async importBooking(_userId: number, bookingReference: string): Promise<Booking> {
    try {
      // Check if already imported
      const existing = this.bookingRepository.findByReference(bookingReference);
      if (existing) {
        throw new Error(`Booking ${bookingReference} already exists`);
      }

      // TODO: In real implementation, this would:
      // 1. Call ParkStay API to get booking details for the specified user
      // 2. Parse the response
      // 3. Create booking in database

      // For now, throw error indicating this needs ParkStay integration
      throw new Error('Booking import requires ParkStay API integration');
    } catch (error) {
      logger.error(`Error importing booking ${bookingReference}:`, error);
      throw error;
    }
  }

  /**
   * Sync booking with ParkStay
   * This is a placeholder - actual implementation would involve ParkStay API
   */
  async syncBooking(id: number): Promise<Booking> {
    try {
      const booking = await this.getBooking(id);
      if (!booking) {
        throw new Error(`Booking ${id} not found`);
      }

      // In real implementation, this would:
      // 1. Call ParkStay API to get latest booking status
      // 2. Update booking in database
      // 3. Mark as synced

      // For now, just mark as synced
      const updated = this.bookingRepository.markSynced(id);
      if (!updated) {
        throw new Error(`Failed to sync booking ${id}`);
      }

      logger.info(`Booking synced: ${id}`);
      return updated;
    } catch (error) {
      logger.error(`Error syncing booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Validate booking input
   */
  private validateBookingInput(input: BookingInput): void {
    if (!input.bookingReference || input.bookingReference.trim() === '') {
      throw new Error('Booking reference is required');
    }

    if (!input.parkName || input.parkName.trim() === '') {
      throw new Error('Park name is required');
    }

    if (!input.campgroundName || input.campgroundName.trim() === '') {
      throw new Error('Campground name is required');
    }

    if (!input.arrivalDate) {
      throw new Error('Arrival date is required');
    }

    if (!input.departureDate) {
      throw new Error('Departure date is required');
    }

    const arrival = new Date(input.arrivalDate);
    const departure = new Date(input.departureDate);

    if (isNaN(arrival.getTime())) {
      throw new Error('Invalid arrival date');
    }

    if (isNaN(departure.getTime())) {
      throw new Error('Invalid departure date');
    }

    if (departure <= arrival) {
      throw new Error('Departure date must be after arrival date');
    }

    if (!input.numGuests || input.numGuests < 1) {
      throw new Error('Number of guests must be at least 1');
    }

    if (input.numGuests > 50) {
      throw new Error('Number of guests cannot exceed 50');
    }

    if (input.totalCost !== undefined && input.totalCost < 0) {
      throw new Error('Total cost cannot be negative');
    }
  }

  /**
   * Get booking statistics
   */
  async getBookingStats(userId: number): Promise<{
    total: number;
    upcoming: number;
    past: number;
    cancelled: number;
  }> {
    try {
      const all = await this.listBookings(userId);
      const upcoming = await this.getUpcomingBookings(userId);
      const past = await this.getPastBookings(userId);
      const cancelled = all.filter((b) => b.status === BookingStatus.CANCELLED);

      return {
        total: all.length,
        upcoming: upcoming.length,
        past: past.length,
        cancelled: cancelled.length,
      };
    } catch (error) {
      logger.error(`Error getting booking stats for user ${userId}:`, error);
      throw error;
    }
  }
}
