/**
 * Links to ParkStay pages: a campground's search page, a booking deep link for a stay, and
 * the bookings page where a person manages what they booked.
 */

import type { StayQuery } from '@shared/types/provider.types';
import type { ProviderLinks } from '../sdk/provider';
import { PARKSTAY_BASE_URL } from './constants';
import { toParkStayDate } from './client';

const SEARCH_PAGE = `${PARKSTAY_BASE_URL}/search-availability/campground/`;

function searchPage(externalId: string): string {
  return `${SEARCH_PAGE}?site_id=${encodeURIComponent(externalId)}`;
}

/** ParkStay's own deep-link form: `?site_id=20&arrival=2026/11/10&departure=2026/11/12&num_adult=2`. */
function bookingLink(externalId: string, stay?: StayQuery): string {
  if (!stay) return searchPage(externalId);
  return (
    `${searchPage(externalId)}&arrival=${toParkStayDate(stay.arrival)}` +
    `&departure=${toParkStayDate(stay.departure)}&num_adult=${stay.adults}`
  );
}

export const parkstayLinks: ProviderLinks = {
  location: searchPage,
  booking: bookingLink,
  manageBooking: () => `${PARKSTAY_BASE_URL}/mybookings/`,
};
