# Advanced Features Developer Guide

## Overview

This guide explains how to use the advanced features (Watch system and Skip The Queue) in the WA ParkStay Bookings application.

## Watch System

### Creating a Watch

```typescript
// From renderer process
const watch = await window.api.watch.create(userId, {
  name: 'Lane Poole Reserve - Christmas',
  parkId: '1',
  parkName: 'Lane Poole Reserve',
  campgroundId: '10',
  campgroundName: 'Lane Poole Campground',
  arrivalDate: new Date('2025-12-24'),
  departureDate: new Date('2025-12-27'),
  numGuests: 4,
  preferredSites: ['Site 15', 'Site 16'], // Optional
  siteType: 'Powered', // Optional
  checkIntervalMinutes: 5, // Optional, default 5
  autoBook: false, // Optional, default false
  notifyOnly: true, // Optional, default true
  maxPrice: 150, // Optional
  notes: 'Preferred shaded sites',
});
```

### Watch Properties

- **name**: Descriptive name for the watch
- **parkId/parkName**: Target park
- **campgroundId/campgroundName**: Target campground
- **arrivalDate/departureDate**: Desired dates
- **numGuests**: Number of guests
- **preferredSites**: Array of site IDs or names (optional)
- **siteType**: Preferred site type (optional)
- **checkIntervalMinutes**: How often to check (1-60 minutes)
- **autoBook**: Automatically book if found (use with caution!)
- **notifyOnly**: Only send notification, don't book
- **maxPrice**: Maximum price per night (optional)

### Managing Watches

```typescript
// List all watches
const watches = await window.api.watch.list(userId);

// Get specific watch
const watch = await window.api.watch.get(watchId);

// Update watch
const updated = await window.api.watch.update(watchId, {
  checkIntervalMinutes: 10,
  maxPrice: 200,
});

// Activate/deactivate
await window.api.watch.activate(watchId);
await window.api.watch.deactivate(watchId);

// Execute immediately (manual check)
await window.api.watch.execute(watchId);

// Delete watch
await window.api.watch.delete(watchId);
```

### Watch Lifecycle

1. **Created**: Watch is created but not scheduled
2. **Activated**: Watch is scheduled and runs at specified intervals
3. **Executing**: Watch is currently checking availability
4. **Found**: Availability matching criteria was found
5. **Deactivated**: Watch is paused (manual or auto)
6. **Deleted**: Watch is removed

### Automatic Behaviors

- Watch automatically deactivates if arrival date passes
- Watch can auto-deactivate after first notification (if `notifyOnly` is true)
- Watch can auto-book when availability is found (if `autoBook` is true)

## Skip The Queue System

### Creating an STQ Entry

```typescript
// From renderer process
const stqEntry = await window.api.stq.create(userId, {
  bookingId: 123,
  bookingReference: 'PS123456',
  checkIntervalMinutes: 2, // Optional, default 2
  maxAttempts: 1000, // Optional, default 1000
  notes: 'Monitor for cancellations',
});
```

### STQ Properties

- **bookingId**: ID of the booking to monitor
- **bookingReference**: ParkStay booking reference
- **checkIntervalMinutes**: How often to check (1-30 minutes)
- **maxAttempts**: Stop after this many attempts
- **notes**: Optional notes

### Managing STQ Entries

```typescript
// List all entries
const entries = await window.api.stq.list(userId);

// Get specific entry
const entry = await window.api.stq.get(stqId);

// Update entry
const updated = await window.api.stq.update(stqId, {
  checkIntervalMinutes: 5,
  maxAttempts: 2000,
});

// Activate/deactivate
await window.api.stq.activate(stqId);
await window.api.stq.deactivate(stqId);

// Execute immediately (manual check)
await window.api.stq.execute(stqId);

// Delete entry
await window.api.stq.delete(stqId);
```

### STQ Lifecycle

1. **Created**: Entry is created but not scheduled
2. **Activated**: Entry is scheduled and checks at intervals
3. **Checking**: Entry is checking booking status
4. **Rebooked**: Successfully rebooked the cancelled booking
5. **Max Attempts**: Reached maximum attempts
6. **Deactivated**: Entry is paused (manual or auto)

### 180-Day Booking Window Strategy

The STQ service includes a helper for calculating booking schedules:

```typescript
// From main process (service layer)
const schedule = stqService.calculateBookingSchedule(
  new Date('2025-06-01'), // Target start date
  new Date('2025-06-15'), // Target end date
  false // Is peak season?
);

// Returns:
// {
//   initialBookingDate: Date, // 180 days before target
//   rebookCheckDates: Date[], // When to check for rebooking
//   maxStayNights: number, // 14 or 28 depending on season
// }
```

### Understanding the 180-Day Window

ParkStay allows bookings up to 180 days in advance. For stays longer than max stay limits:

1. Book initial segment 180 days in advance
2. Monitor 21-28 days before the 180-day threshold for next segment
3. Rebook to extend the stay as the window opens

Example: 30-night stay starting June 1
- Book nights 1-14 on December 3 (180 days before)
- Monitor for nights 15-28 starting May 11
- Book nights 15-28 when available
- Monitor for nights 29-30 starting May 25

## Notifications

### Receiving Notifications

```typescript
// List notifications
const notifications = await window.api.notification.list(userId, 50); // limit optional

// Mark as read
await window.api.notification.markRead(notificationId);

// Delete notification
await window.api.notification.delete(notificationId);

// Delete all for user
await window.api.notification.deleteAll(userId);
```

### Listening to Events

```typescript
// Listen for new notifications
const unsubscribe = window.api.events.onNotificationCreated((notification) => {
  console.log('New notification:', notification);
  // Update UI
});

// Listen for watch results
const unsubscribeWatch = window.api.events.onWatchResult((result) => {
  console.log('Watch executed:', result);
  // Update watch status in UI
});

// Listen for STQ results
const unsubscribeSTQ = window.api.events.onSTQResult((result) => {
  console.log('STQ executed:', result);
  // Update STQ status in UI
});

// Clean up listeners when component unmounts
useEffect(() => {
  return () => {
    unsubscribe();
    unsubscribeWatch();
    unsubscribeSTQ();
  };
}, []);
```

### Notification Types

- `watch_found`: Watch found availability
- `stq_success`: STQ successfully rebooked
- `booking_confirmed`: Booking was confirmed
- `error`: Error occurred
- `warning`: Warning message
- `info`: Informational message

## Job Scheduler

### How It Works

The job scheduler runs in the main process and uses cron jobs to execute watches and STQ checks at their specified intervals.

```typescript
// From main process
const jobScheduler = new JobScheduler(watchService, stqService);

// Start scheduler
jobScheduler.start();

// Get status
const status = jobScheduler.getJobStatus();
// Returns: { isRunning: boolean, totalJobs: number, watches: number, stqs: number }

// Stop scheduler
jobScheduler.stop();
```

### Automatic Scheduling

- When a watch is created and activated, it's automatically scheduled
- When an STQ entry is created and activated, it's automatically scheduled
- Updates to interval reschedule the job
- Deactivation unschedules the job
- Jobs persist across application restarts

### Manual Execution

```typescript
// Execute a watch immediately (outside of schedule)
await jobScheduler.executeWatchNow(watchId);

// Execute an STQ check immediately
await jobScheduler.executeSTQNow(stqId);
```

## ParkStay API Integration

### Session Management

The ParkStay service manages sessions automatically:

```typescript
// Login (done through auth service)
const session = await parkStayService.login(email, password);

// Session is stored and used for all subsequent requests
// Session includes cookies and tokens

// Validate session
const isValid = await parkStayService.validateSession();

// Logout
await parkStayService.logout();
```

### Checking Availability

```typescript
// Check availability for a campground
const result = await parkStayService.checkAvailability('campgroundId', {
  campgroundId: '10',
  arrivalDate: '2025-06-01',
  departureDate: '2025-06-05',
  numGuests: 4,
  siteType: 'Powered', // Optional
});

// Result includes:
// {
//   available: boolean,
//   sites: CampsiteAvailability[],
//   totalAvailable: number,
//   lowestPrice: number
// }
```

### Creating Bookings

```typescript
// Create a booking
const result = await parkStayService.createBooking({
  campgroundId: '10',
  siteId: '15',
  arrivalDate: '2025-06-01',
  departureDate: '2025-06-05',
  numGuests: 4,
  customerInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '0400123456',
  },
});

// Result includes:
// {
//   success: boolean,
//   bookingReference?: string,
//   bookingId?: string,
//   error?: string
// }
```

## Error Handling

### Service-Level Errors

All services throw errors that should be caught:

```typescript
try {
  const watch = await window.api.watch.create(userId, watchInput);
} catch (error) {
  console.error('Failed to create watch:', error.message);
  // Show error to user
}
```

### API Response Format

All IPC calls return an `APIResponse`:

```typescript
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Usage:
const response = await window.api.watch.list(userId);
if (response.success) {
  const watches = response.data;
  // Use watches
} else {
  console.error('Error:', response.error);
}
```

## Best Practices

### Watches

1. **Check Intervals**: Use 5+ minutes to avoid rate limiting
2. **Preferred Sites**: Specify sites if you have preferences
3. **Max Price**: Set a price limit to avoid expensive sites
4. **Auto-Booking**: Only enable if you're confident in the criteria
5. **Multiple Watches**: Create separate watches for different date ranges

### Skip The Queue

1. **Check Intervals**: 2-5 minutes is usually sufficient
2. **Max Attempts**: Set a reasonable limit (1000 = ~33 hours at 2-min intervals)
3. **Monitor Regularly**: Check the status periodically
4. **Booking References**: Ensure the booking reference is correct
5. **Active Monitoring**: Keep entries active only when needed

### Performance

1. **Limit Active Watches**: Don't exceed 10 concurrent watches
2. **Appropriate Intervals**: Longer intervals reduce load
3. **Clean Up**: Delete unused watches and STQ entries
4. **Monitor Logs**: Check job logs for errors
5. **Database Maintenance**: Cleanup runs daily at 2 AM

### Security

1. **Credentials**: Never log or display plain-text passwords
2. **Session Tokens**: Handled automatically by service
3. **IPC Validation**: All inputs are validated
4. **Context Isolation**: Renderer has no direct database access

## Debugging

### Enable Logging

```typescript
// In main process (development)
console.log('Watch executed:', result);

// Check job scheduler status
const status = jobScheduler.getJobStatus();
console.log('Scheduler status:', status);

// Check database
const watch = watchRepo.findById(watchId);
console.log('Watch from DB:', watch);
```

### Common Issues

**Watch not executing:**
- Check if watch is active: `watch.isActive`
- Check if arrival date is in future
- Check scheduler status: `jobScheduler.getJobStatus()`
- Check for errors in console

**STQ not rebooking:**
- Check if entry is active: `entry.isActive`
- Check attempts count: `entry.attemptsCount`
- Verify booking reference is correct
- Check ParkStay session is valid

**Notifications not appearing:**
- Check notification service configuration
- Verify desktop notifications are enabled
- Check system notification permissions
- Review notification table in database

## Testing

### Unit Tests

```typescript
// Test watch service
describe('WatchService', () => {
  it('should create a watch', async () => {
    const watch = await watchService.create(userId, watchInput);
    expect(watch.id).toBeDefined();
    expect(watch.name).toBe(watchInput.name);
  });

  it('should execute watch and find availability', async () => {
    const result = await watchService.execute(watchId);
    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
  });
});
```

### Integration Tests

```typescript
// Test end-to-end watch flow
describe('Watch Flow', () => {
  it('should create, schedule, and execute watch', async () => {
    // Create watch
    const watch = await watchService.create(userId, watchInput);

    // Schedule watch
    jobScheduler.scheduleWatch(watch);

    // Execute immediately
    const result = await jobScheduler.executeWatchNow(watch.id);

    expect(result.success).toBe(true);
  });
});
```

## Additional Resources

- [Architecture Documentation](../docs/architecture/system-architecture.md)
- [Data Models](../docs/architecture/data-models.md)
- [API Types](../src/shared/types/api.types.ts)
- [Constants](../src/shared/constants/app-constants.ts)

## Support

For issues or questions:
1. Check the console for errors
2. Review job logs in database
3. Check notification history
4. Verify ParkStay API is accessible
5. Ensure credentials are valid

## Changelog

### Version 1.0.0 (2025-10-31)
- Initial implementation
- Watch system complete
- Skip The Queue complete
- Job scheduler complete
- Notification system complete
- ParkStay API integration complete
