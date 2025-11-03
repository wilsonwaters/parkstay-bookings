/**
 * Booking Repository
 * Handles CRUD operations for bookings
 */

import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { Booking, BookingInput, BookingStatus } from '@shared/types';
import { logger } from '../../utils/logger';

interface BookingRow {
  id: number;
  user_id: number;
  booking_reference: string;
  park_name: string;
  campground_name: string;
  site_number: string | null;
  site_type: string | null;
  arrival_date: string;
  departure_date: string;
  num_nights: number;
  num_guests: number;
  total_cost: number | null;
  currency: string;
  status: string;
  booking_data: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

export class BookingRepository extends BaseRepository<Booking> {
  constructor(db: Database.Database) {
    super(db, 'bookings');
  }

  /**
   * Map database row to Booking model
   */
  protected mapRowToModel(row: BookingRow): Booking {
    return {
      id: row.id,
      userId: row.user_id,
      bookingReference: row.booking_reference,
      parkName: row.park_name,
      campgroundName: row.campground_name,
      siteNumber: row.site_number || undefined,
      siteType: row.site_type || undefined,
      arrivalDate: new Date(row.arrival_date),
      departureDate: new Date(row.departure_date),
      numNights: row.num_nights,
      numGuests: row.num_guests,
      totalCost: row.total_cost || undefined,
      currency: row.currency,
      status: row.status as BookingStatus,
      bookingData: this.parseJson(row.booking_data),
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      syncedAt: this.parseDate(row.synced_at),
    };
  }

  /**
   * Map Booking model to database row
   */
  protected mapModelToRow(booking: Partial<Booking>): Partial<BookingRow> {
    return {
      user_id: booking.userId,
      booking_reference: booking.bookingReference,
      park_name: booking.parkName,
      campground_name: booking.campgroundName,
      site_number: booking.siteNumber || null,
      site_type: booking.siteType || null,
      arrival_date: this.formatDate(booking.arrivalDate) || '',
      departure_date: this.formatDate(booking.departureDate) || '',
      num_nights: booking.numNights || 0,
      num_guests: booking.numGuests || 0,
      total_cost: booking.totalCost || null,
      currency: booking.currency || 'AUD',
      status: booking.status || BookingStatus.PENDING,
      booking_data: this.stringifyJson(booking.bookingData),
      notes: booking.notes || null,
    };
  }

  /**
   * Create new booking
   */
  create(userId: number, input: BookingInput): Booking {
    try {
      // Calculate number of nights
      const arrival = new Date(input.arrivalDate);
      const departure = new Date(input.departureDate);
      const numNights = Math.ceil(
        (departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)
      );

      const stmt = this.db.prepare(`
        INSERT INTO bookings (
          user_id, booking_reference, park_name, campground_name,
          site_number, site_type, arrival_date, departure_date,
          num_nights, num_guests, total_cost, notes, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
      `);

      const result = stmt.run(
        userId,
        input.bookingReference,
        input.parkName,
        input.campgroundName,
        input.siteNumber || null,
        input.siteType || null,
        arrival.toISOString(),
        departure.toISOString(),
        numNights,
        input.numGuests,
        input.totalCost || null,
        input.notes || null
      );

      const booking = this.findById(result.lastInsertRowid as number);
      if (!booking) throw new Error('Failed to create booking');

      logger.info(`Booking created: ${input.bookingReference}`);
      return booking;
    } catch (error) {
      logger.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Find bookings by user ID
   */
  findByUserId(userId: number): Booking[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY arrival_date DESC')
        .all(userId);
      return rows.map((row) => this.mapRowToModel(row as BookingRow));
    } catch (error) {
      logger.error(`Error finding bookings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find booking by reference
   */
  findByReference(reference: string): Booking | null {
    try {
      const row = this.db
        .prepare('SELECT * FROM bookings WHERE booking_reference = ?')
        .get(reference);
      return row ? this.mapRowToModel(row as BookingRow) : null;
    } catch (error) {
      logger.error(`Error finding booking by reference ${reference}:`, error);
      throw error;
    }
  }

  /**
   * Update booking
   */
  update(id: number, updates: Partial<BookingInput>): Booking | null {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.parkName) {
        fields.push('park_name = ?');
        values.push(updates.parkName);
      }
      if (updates.campgroundName) {
        fields.push('campground_name = ?');
        values.push(updates.campgroundName);
      }
      if (updates.siteNumber !== undefined) {
        fields.push('site_number = ?');
        values.push(updates.siteNumber || null);
      }
      if (updates.siteType !== undefined) {
        fields.push('site_type = ?');
        values.push(updates.siteType || null);
      }
      if (updates.arrivalDate) {
        fields.push('arrival_date = ?');
        values.push(new Date(updates.arrivalDate).toISOString());
      }
      if (updates.departureDate) {
        fields.push('departure_date = ?');
        values.push(new Date(updates.departureDate).toISOString());
      }
      if (updates.numGuests) {
        fields.push('num_guests = ?');
        values.push(updates.numGuests);
      }
      if (updates.totalCost !== undefined) {
        fields.push('total_cost = ?');
        values.push(updates.totalCost || null);
      }
      if (updates.notes !== undefined) {
        fields.push('notes = ?');
        values.push(updates.notes || null);
      }

      // Recalculate nights if dates changed
      if (updates.arrivalDate || updates.departureDate) {
        const current = this.findById(id);
        if (current) {
          const arrival = updates.arrivalDate
            ? new Date(updates.arrivalDate)
            : current.arrivalDate;
          const departure = updates.departureDate
            ? new Date(updates.departureDate)
            : current.departureDate;
          const numNights = Math.ceil(
            (departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)
          );
          fields.push('num_nights = ?');
          values.push(numNights);
        }
      }

      if (fields.length === 0) {
        return this.findById(id);
      }

      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE bookings SET ${fields.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Booking updated: ID ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error updating booking ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update booking status
   */
  updateStatus(id: number, status: BookingStatus): Booking | null {
    try {
      const stmt = this.db.prepare('UPDATE bookings SET status = ? WHERE id = ?');
      stmt.run(status, id);

      logger.info(`Booking status updated: ID ${id}, status ${status}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error updating booking status ${id}:`, error);
      throw error;
    }
  }

  /**
   * Mark booking as synced
   */
  markSynced(id: number): Booking | null {
    try {
      const stmt = this.db.prepare('UPDATE bookings SET synced_at = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run(id);

      logger.info(`Booking marked as synced: ID ${id}`);
      return this.findById(id);
    } catch (error) {
      logger.error(`Error marking booking as synced ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find upcoming bookings
   */
  findUpcoming(userId: number): Booking[] {
    try {
      const rows = this.db
        .prepare(`
          SELECT * FROM bookings
          WHERE user_id = ?
            AND arrival_date >= date('now')
            AND status = 'confirmed'
          ORDER BY arrival_date ASC
        `)
        .all(userId);
      return rows.map((row) => this.mapRowToModel(row as BookingRow));
    } catch (error) {
      logger.error(`Error finding upcoming bookings for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find past bookings
   */
  findPast(userId: number): Booking[] {
    try {
      const rows = this.db
        .prepare(`
          SELECT * FROM bookings
          WHERE user_id = ?
            AND departure_date < date('now')
          ORDER BY departure_date DESC
        `)
        .all(userId);
      return rows.map((row) => this.mapRowToModel(row as BookingRow));
    } catch (error) {
      logger.error(`Error finding past bookings for user ${userId}:`, error);
      throw error;
    }
  }
}
