/**
 * AvailabilityGrid Component
 * Displays campsite availability in a grid format (sites x dates)
 * Reusable for both watch results and booking searches
 */

import React from 'react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { AvailabilityCheckResult } from '../../shared/types/api.types';
import { AvailabilityResult } from '../../shared/types/watch.types';

interface AvailabilityGridProps {
  // Can accept either detailed API results or simplified watch results
  availabilityData?: AvailabilityCheckResult;
  watchResults?: AvailabilityResult[];
  arrivalDate: Date | string;
  departureDate: Date | string;
  isLoading?: boolean;
  onSiteSelect?: (siteId: string) => void;
  selectedSiteId?: string;
}

const AvailabilityGrid: React.FC<AvailabilityGridProps> = ({
  availabilityData,
  watchResults,
  arrivalDate,
  departureDate,
  isLoading = false,
  onSiteSelect,
  selectedSiteId,
}) => {
  // Parse dates
  const startDate = typeof arrivalDate === 'string' ? parseISO(arrivalDate) : arrivalDate;
  const endDate = typeof departureDate === 'string' ? parseISO(departureDate) : departureDate;

  // Generate array of dates for the range
  const dates = eachDayOfInterval({ start: startDate, end: endDate });

  // Normalize data to common format
  const sites: {
    siteId: string;
    siteName: string;
    siteType: string;
    available: boolean;
    price?: number;
    dateAvailability?: Map<string, { available: boolean; price: number; bookable: boolean }>;
  }[] = [];

  if (availabilityData?.sites) {
    // Detailed API data with per-date availability
    availabilityData.sites.forEach((site) => {
      const dateMap = new Map<string, { available: boolean; price: number; bookable: boolean }>();
      site.dates?.forEach((d) => {
        dateMap.set(d.date, { available: d.available, price: d.price, bookable: d.bookable });
      });
      sites.push({
        siteId: site.siteId,
        siteName: site.siteName,
        siteType: site.siteType,
        available: site.dates?.every((d) => d.available) ?? false,
        price: site.dates?.reduce((sum, d) => sum + d.price, 0),
        dateAvailability: dateMap,
      });
    });
  } else if (watchResults) {
    // Simplified watch results
    watchResults.forEach((result) => {
      sites.push({
        siteId: result.siteId,
        siteName: result.siteName,
        siteType: result.siteType,
        available: result.available,
        price: result.price,
      });
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-600">Checking availability...</span>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No availability data</h3>
        <p className="mt-1 text-sm text-gray-500">
          Click &quot;Check Now&quot; to fetch current availability
        </p>
      </div>
    );
  }

  const availableSites = sites.filter((s) => s.available);
  const unavailableSites = sites.filter((s) => !s.available);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
        <div>
          <span className="text-lg font-semibold text-gray-900">
            {availableSites.length} site{availableSites.length !== 1 ? 's' : ''} available
          </span>
          <span className="text-gray-500 ml-2">
            of {sites.length} total
          </span>
        </div>
        {availabilityData?.lowestPrice && (
          <div className="text-right">
            <span className="text-sm text-gray-500">From</span>
            <span className="ml-2 text-lg font-semibold text-green-600">
              ${availabilityData.lowestPrice.toFixed(2)}/night
            </span>
          </div>
        )}
      </div>

      {/* Available Sites */}
      {availableSites.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            Available Sites
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                    Site
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  {dates.length <= 14 && dates.map((date) => (
                    <th
                      key={date.toISOString()}
                      className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {format(date, 'EEE')}<br />
                      {format(date, 'd MMM')}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Price
                  </th>
                  {onSiteSelect && (
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {availableSites.map((site) => (
                  <tr
                    key={site.siteId}
                    className={`hover:bg-gray-50 ${selectedSiteId === site.siteId ? 'bg-primary-50' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white">
                      {site.siteName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {site.siteType}
                    </td>
                    {dates.length <= 14 && dates.map((date) => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      const dayAvail = site.dateAvailability?.get(dateKey);
                      return (
                        <td
                          key={dateKey}
                          className="px-2 py-3 text-center"
                        >
                          {dayAvail ? (
                            <span
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                                dayAvail.available
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                              title={dayAvail.available ? `$${dayAvail.price}` : 'Unavailable'}
                            >
                              {dayAvail.available ? '$' + dayAvail.price : 'X'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-800">
                              ✓
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-green-600">
                      {site.price ? `$${site.price.toFixed(2)}` : '-'}
                    </td>
                    {onSiteSelect && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => onSiteSelect(site.siteId)}
                          className="btn-primary text-xs px-3 py-1"
                        >
                          Select
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unavailable Sites (Collapsed by default) */}
      {unavailableSites.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center">
            <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            {unavailableSites.length} Unavailable Site{unavailableSites.length !== 1 ? 's' : ''}
            <svg
              className="ml-2 h-4 w-4 transform group-open:rotate-180 transition-transform"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Site
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unavailableSites.map((site) => (
                  <tr key={site.siteId} className="text-gray-400">
                    <td className="px-4 py-2 text-sm">{site.siteName}</td>
                    <td className="px-4 py-2 text-sm">{site.siteType}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        Unavailable
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};

export default AvailabilityGrid;
