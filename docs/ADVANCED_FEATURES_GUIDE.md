# Advanced Features Developer Guide

## Overview

This guide explains how to use the advanced features (Watch system and Site Sniper) in the WA ParkStay Bookings application.

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

## Site Sniper System

Site Sniper (formerly the mislabelled "Skip The Queue" / "Beat the Crowd") automatically
secures a high-demand campsite **at the earliest possible legal moment it becomes available**.
It prepares ahead of time and reacts the instant a target site opens, placing a 30-minute
temporary hold so you can complete payment before anyone else takes it.

See [SITE_SNIPER.md](./SITE_SNIPER.md) for the full feature guide, the two release regimes
(daily midnight-AWST rollover vs. Ningaloo scheduled releases), the cancellation-watch mode,
and the compliance rules. Payment is intentionally left to you (it requires DBCA SSO + BPOINT);
Site Sniper stops at the hold and notifies you immediately with a link to finish.

### Creating a Snipe

```typescript
// From renderer process
const snipe = await window.api.siteSniper.create(userId, {
  name: 'Osprey Bay — September long weekend',
  campgroundId: '123',
  campgroundName: 'Osprey Bay',
  targetSiteIds: ['456', '457'], // Optional; empty => any site in the campground
  siteType: 'tent', // gear_type: tent | campervan | caravan | all
  arrivalDate: new Date('2026-09-25'),
  departureDate: new Date('2026-09-28'),
  numAdult: 2,
  numVehicle: 1,
  releaseMode: 'scheduled', // daily_rollover | scheduled | cancellation
  releaseAt: new Date('2026-09-01T02:00:00Z'), // 10:00 AWST — required for 'scheduled'
  queueEnabled: true, // establish the DBCA queue session (Ningaloo)
  leadTimeSeconds: 120, // warm up / join queue before release
  pollIntervalMs: 1500, // tight-poll cadence during the snipe window
  windowDurationMs: 900000, // keep trying for 15 minutes after release
  maxAttempts: 0, // 0 = unlimited within the window
  notes: 'Shaded sites preferred',
});
```

### Managing Snipes

```typescript
const snipes = await window.api.siteSniper.list(userId);
const snipe = await window.api.siteSniper.get(snipeId);
await window.api.siteSniper.update(snipeId, { pollIntervalMs: 1000 });
await window.api.siteSniper.activate(snipeId); // arm
await window.api.siteSniper.deactivate(snipeId); // disarm
await window.api.siteSniper.execute(snipeId); // run one attempt now
await window.api.siteSniper.delete(snipeId);
```

### Snipe Lifecycle

`armed → waiting_release → queueing → sniping → held → booked`
(`failed` / `expired` / `disabled` are terminal/paused states)

1. **armed**: created and scheduled; a precise timer targets the release instant
2. **waiting_release**: counting down to `releaseAt − leadTimeSeconds`
3. **queueing**: (if `queueEnabled`) establishing/holding the DBCA queue session
4. **sniping**: at the release instant, tight-polling availability every `pollIntervalMs`
5. **held**: a matching site opened and a 30-minute hold was placed — you complete payment
6. **booked**: recorded once you confirm the booking

Because the release instant needs sub-second precision, snipes are scheduled with real timers
(`setTimeout`/`setInterval`, long-timer-safe), not minute-granularity cron.

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

// Listen for Site Sniper status updates
const unsubscribeSnipe = window.api.on.snipeStatusUpdate((snipe) => {
  console.log('Snipe status:', snipe.status);
  // Update snipe status in UI
});

// Clean up listeners when component unmounts
useEffect(() => {
  return () => {
    unsubscribe();
    unsubscribeWatch();
    unsubscribeSnipe();
  };
}, []);
```

### Notification Types

- `watch_found`: Watch found availability
- `snipe_held`: Site Sniper placed a temporary hold (complete payment now)
- `snipe_booked`: A sniped booking was confirmed
- `booking_confirmed`: Booking was confirmed
- `error`: Error occurred
- `warning`: Warning message
- `info`: Informational message

## Job Scheduler

### How It Works

The job scheduler runs in the main process. Watches use cron jobs at their configured
intervals; Site Sniper snipes use precise real timers (`setTimeout`/`setInterval`) armed for
the exact release instant, because release timing needs sub-second precision that cron cannot
provide.

```typescript
// From main process
const jobScheduler = new JobScheduler(watchService, siteSniperService);

// Start scheduler
jobScheduler.start();

// Get status
const status = jobScheduler.getJobStatus();
// Returns: { isRunning: boolean, totalJobs: number, watches: number, snipes: number }

// Stop scheduler
jobScheduler.stop();
```

### Automatic Scheduling

- When a watch is created and activated, it's automatically scheduled (cron)
- When a snipe is created and activated, a precise timer is armed for its release instant
- Updates reschedule the job
- Deactivation unschedules the job
- Jobs persist across application restarts

### Manual Execution

```typescript
// Execute a watch immediately (outside of schedule)
await jobScheduler.executeWatchNow(watchId);

// Run a snipe attempt immediately
await jobScheduler.executeSnipeNow(snipeId);
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

### Site Sniper

1. **Release Mode**: Use `daily_rollover` for standard parks, `scheduled` for Ningaloo releases, `cancellation` to watch for freed sites
2. **Release Instant**: For `scheduled` mode, set `releaseAt` to the published open time (AWST)
3. **Queue**: Enable it only for Ningaloo scheduled releases; it gives no advantage otherwise
4. **Poll Interval**: 1000–2000 ms during a release window; keep cancellation polling ≥ 3 s
5. **Complete Payment**: A held site expires in 30 minutes — finish payment promptly
6. **One Booking Per Night**: Never run overlapping snipes that could double-book a night

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

**Snipe not placing a hold:**
- Check the snipe is active/armed: `snipe.isActive` / `snipe.status`
- Check the release instant (`releaseAt`) is correct and in AWST
- Confirm every night in the range shows `open` at release time
- For Ningaloo, confirm the queue session became active (`queueEnabled`)
- Check attempts and last error: `snipe.attemptsCount`, `snipe.lastError`

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
- Site Sniper (replaces the former Skip The Queue / Beat the Crowd) complete
- Job scheduler complete
- Notification system complete
- ParkStay API integration complete
