/**
 * ParkStay IPC Handlers
 * Handles ParkStay API-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { ParkStayService } from '../../services/parkstay/parkstay.service';
import { APIResponse, CampgroundSearchResult } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerParkStayHandlers(parkStayService: ParkStayService): void {
  /**
   * Search campgrounds by query
   */
  ipcMain.handle(
    IPC_CHANNELS.PARKSTAY_SEARCH_CAMPGROUNDS,
    async (
      _event: IpcMainInvokeEvent,
      query: string
    ): Promise<APIResponse<CampgroundSearchResult[]>> => {
      try {
        const results = await parkStayService.searchCampgrounds(query);
        return {
          success: true,
          data: results,
        };
      } catch (error: any) {
        logger.error('Error searching campgrounds:', error);
        return {
          success: false,
          error: error.message || 'Failed to search campgrounds',
        };
      }
    }
  );

  /**
   * Get all campgrounds (for dropdown/search)
   */
  ipcMain.handle(
    IPC_CHANNELS.PARKSTAY_GET_ALL_CAMPGROUNDS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<CampgroundSearchResult[]>> => {
      try {
        // Search with empty query returns all campgrounds
        const results = await parkStayService.searchCampgrounds('');
        return {
          success: true,
          data: results,
        };
      } catch (error: any) {
        logger.error('Error getting all campgrounds:', error);
        return {
          success: false,
          error: error.message || 'Failed to get campgrounds',
        };
      }
    }
  );

  /**
   * Check availability for a campground
   */
  ipcMain.handle(
    IPC_CHANNELS.PARKSTAY_CHECK_AVAILABILITY,
    async (
      _event: IpcMainInvokeEvent,
      campgroundId: string,
      params: {
        arrivalDate: string;
        departureDate: string;
        numGuests: number;
        siteType?: string;
      }
    ): Promise<APIResponse<any>> => {
      try {
        const result = await parkStayService.checkAvailability(campgroundId, {
          campgroundId,
          arrivalDate: params.arrivalDate,
          departureDate: params.departureDate,
          numGuests: params.numGuests,
          siteType: params.siteType,
        });
        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error checking availability:', error);
        return {
          success: false,
          error: error.message || 'Failed to check availability',
        };
      }
    }
  );

  logger.info('ParkStay IPC handlers registered');
}
