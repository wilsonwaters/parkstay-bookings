# WA ParkStay Bookings - User Guide

**Version:** 1.0
**Last Updated:** 2025-10-31

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Managing Bookings](#managing-bookings)
4. [Creating Watches](#creating-watches)
5. [Using Skip The Queue](#using-skip-the-queue)
6. [Notifications](#notifications)
7. [Settings](#settings)
8. [Tips and Best Practices](#tips-and-best-practices)
9. [FAQ](#faq)

---

## Getting Started

Welcome to WA ParkStay Bookings! This desktop application helps you automate campground bookings on the Western Australia Parks and Wildlife Service ParkStay system.

### What Can This App Do?

**Automated Availability Monitoring:**
- Set up watches to monitor campsite availability
- Get notified when sites become available
- Optionally auto-book when availability is found

**Skip The Queue:**
- Automatically rebook cancelled reservations
- Stay in the queue for high-demand campsites
- Continuous monitoring until successful

**Booking Management:**
- View all your bookings in one place
- Import existing ParkStay bookings
- Sync with ParkStay automatically
- Track booking details and status

### Key Features

- **Local-First**: All data stored on your computer
- **Secure**: Your credentials are encrypted
- **Automated**: Runs in the background
- **Flexible**: Customizable polling intervals
- **Reliable**: Automatic retry on failures

---

## Dashboard Overview

The Dashboard is your command center, showing key information at a glance.

### Dashboard Sections

**1. Active Watches**
- Number of watches currently running
- Next scheduled check time
- Quick access to watch management

**2. Recent Activity**
- Latest watch executions
- Booking updates
- System notifications

**3. Upcoming Bookings**
- Next 5 bookings by date
- Quick view of arrival/departure
- Booking status

**4. Statistics**
- Total bookings managed
- Successful bookings
- Active watches
- Success rate

**5. Quick Actions**
- Create New Watch
- Import Booking
- View All Notifications
- Open Settings

### Status Indicators

**Watches:**
- Green: Active and running
- Yellow: Paused
- Red: Error or stopped
- Gray: Inactive

**Bookings:**
- Green: Confirmed
- Yellow: Pending
- Red: Cancelled
- Blue: Skip The Queue active

---

## Managing Bookings

The Bookings page shows all your ParkStay reservations.

### Viewing Bookings

**List View:**
- Shows all bookings in a table
- Sort by date, park, status
- Filter by status, date range, park
- Search by booking reference or park name

**Card View:**
- Visual cards for each booking
- Shows key details at a glance
- Color-coded by status

### Booking Details

Click any booking to see full details:

**Reservation Information:**
- Booking reference number
- Park and campground name
- Site number (if assigned)
- Arrival and departure dates
- Number of nights
- Number of guests

**Cost Information:**
- Nightly rate
- Total cost
- Payment status

**Status:**
- Confirmed: Booking is active
- Pending: Waiting for confirmation
- Cancelled: Booking was cancelled

**Actions:**
- View on ParkStay: Opens booking on ParkStay website
- Enable Skip The Queue: Set up automatic rebooking
- Export Details: Save booking information
- Delete: Remove from local database

### Importing Bookings

You can import existing ParkStay bookings into the app:

**Method 1: By Booking Reference**

1. Click "Import Booking" button
2. Enter your booking reference number (e.g., PS-12345)
3. Click "Import"
4. The app will fetch booking details from ParkStay
5. Review and confirm the import

**Method 2: Sync All Bookings**

1. Click "Sync with ParkStay" button
2. The app will fetch all bookings from your ParkStay account
3. New bookings will be added
4. Existing bookings will be updated
5. Review the sync results

### Syncing Bookings

Keep your bookings up to date:

- **Manual Sync**: Click "Sync Now" to update immediately
- **Automatic Sync**: Enable in Settings for daily updates
- **Sync on Startup**: Update bookings when app launches

---

## Creating Watches

Watches monitor ParkStay for campsite availability and notify you when sites become available.

### Creating a New Watch

1. **Navigate to Watches Page**
   - Click "Watches" in the sidebar
   - Click "Create New Watch" button

2. **Basic Information**
   - **Watch Name**: Give your watch a descriptive name (e.g., "Karijini Easter Weekend")
   - **Notes**: Optional notes for reference

3. **Select Location**
   - **Park**: Choose from list of WA parks (e.g., "Karijini National Park")
   - **Campground**: Select specific campground (e.g., "Dales Campground")

4. **Select Dates**
   - **Arrival Date**: When you want to arrive
   - **Departure Date**: When you want to leave
   - **Flexible Dates**: Option to include nearby dates

5. **Party Details**
   - **Number of Guests**: Total number of people
   - **Vehicle Type**: Car, motorhome, caravan, etc.

6. **Site Preferences**
   - **Preferred Sites**: Specific site numbers (optional)
   - **Site Type**: Powered, unpowered, walk-in, etc.
   - **Accessibility**: Any special requirements

7. **Watch Configuration**
   - **Check Interval**: How often to check (default: 5 minutes)
   - **Max Price**: Maximum price per night (optional)
   - **Notification Only**: Just notify, don't auto-book
   - **Auto-Book**: Automatically book when available

8. **Review and Create**
   - Review all settings
   - Click "Create Watch"
   - Watch will start immediately

### Watch Settings

**Check Interval:**
- Minimum: 2 minutes (to avoid rate limiting)
- Default: 5 minutes
- Maximum: 60 minutes
- Shorter intervals = faster notifications but more API calls

**Notification Options:**
- Desktop notification when availability found
- Sound alert
- Email notification (if configured)

**Auto-Booking:**
- Enable to automatically book when availability found
- Requires valid payment method on ParkStay
- Use with caution - you'll be charged immediately
- Recommended to start with "Notification Only"

### Managing Watches

**Active Watches:**
- Green indicator shows watch is active
- Shows last check time and next check time
- Shows number of check attempts

**Pausing a Watch:**
- Click "Pause" to temporarily stop checks
- Resume anytime by clicking "Resume"
- Useful when you're not ready to book

**Editing a Watch:**
- Click "Edit" to modify settings
- Cannot change park/dates for active watches
- Can adjust interval, notifications, auto-book

**Deleting a Watch:**
- Click "Delete" to remove completely
- Confirm deletion
- Historical data is preserved in logs

### Watch Results

When a watch finds availability:

**Notification:**
- Desktop notification appears
- Sound plays (if enabled)
- Watch status shows "Available"

**Available Sites:**
- List of available sites matching criteria
- Price per night for each site
- Total cost for your dates

**Actions:**
- **Book Now**: Opens ParkStay to complete booking
- **Auto-Book**: If enabled, books automatically
- **Pause Watch**: Stop checking temporarily
- **Delete Watch**: Remove if no longer needed

---

## Using Skip The Queue

Skip The Queue (STQ) helps you rebook cancelled reservations automatically.

### How Skip The Queue Works

ParkStay has a "Skip The Queue" feature that lets you try to rebook a cancelled reservation. This app automates the process by checking continuously until a spot becomes available.

### Setting Up Skip The Queue

**Method 1: From Existing Booking**

1. Go to Bookings page
2. Find a confirmed booking
3. Click "Enable Skip The Queue"
4. Configure STQ settings
5. Click "Activate"

**Method 2: From Skip The Queue Page**

1. Navigate to "Skip The Queue" page
2. Click "Create New STQ Entry"
3. Select or import a booking
4. Configure settings
5. Click "Activate"

### STQ Configuration

**Check Interval:**
- Default: 2 minutes
- Minimum: 1 minute (aggressive)
- Maximum: 10 minutes (conservative)
- Shorter intervals = higher chance of success

**Max Attempts:**
- Default: 1000 attempts
- Set limit to avoid infinite loops
- Can increase if needed

**Auto-Rebook:**
- Automatically book when successful
- Requires valid payment method
- You'll be charged immediately

### STQ Status

**Active:**
- STQ is actively checking
- Shows number of attempts
- Shows last check time

**Success:**
- Rebooking was successful
- New booking created
- Original booking retained for reference

**Failed:**
- Max attempts reached without success
- Manual intervention required
- Can reset and try again

**Paused:**
- Temporarily stopped
- Can resume anytime

### Best Practices for STQ

1. **Start Early**: Enable STQ as soon as booking is confirmed
2. **Short Intervals**: Use 2-minute interval for best results
3. **Monitor Progress**: Check periodically to see attempts
4. **Be Patient**: Can take hours or days depending on demand
5. **Backup Plan**: Always have an alternative plan

### When to Use STQ

**Good Use Cases:**
- High-demand campsites (Karijini, Cape Range)
- Peak season bookings (school holidays)
- Sold-out dates that show waitlists
- Popular sites with frequent cancellations

**Not Recommended:**
- Low-demand campsites (likely to have availability)
- Off-peak season (better to just book directly)
- When you're unsure about going (you'll be charged)

---

## Notifications

Stay informed with the application's notification system.

### Notification Types

**Watch Found:**
- Triggered when availability matches a watch
- Shows park, dates, and available sites
- Includes price information

**STQ Success:**
- Triggered when rebooking succeeds
- Shows new booking details
- Links to booking in ParkStay

**Booking Updates:**
- New booking created
- Booking status changed
- Booking cancelled

**Error Alerts:**
- Watch failed to execute
- Login failed
- Network errors

**System Messages:**
- App updates available
- Maintenance notifications
- General information

### Notification Channels

**In-App Notifications:**
- Bell icon in header shows unread count
- Click to view notification list
- Mark as read/unread
- Delete notifications

**Desktop Notifications:**
- Native OS notifications
- Appear even when app is minimized
- Click to open app and view details
- Can be disabled in Settings

**Sound Alerts:**
- Plays sound with important notifications
- Customizable sound
- Can be disabled in Settings

### Managing Notifications

**Viewing Notifications:**
1. Click bell icon in header
2. Notification panel slides in
3. Shows all recent notifications
4. Grouped by type

**Notification Actions:**
- Click to view details
- Mark as read/unread
- Delete individual notification
- Clear all notifications

**Notification Settings:**
- Enable/disable desktop notifications
- Enable/disable sounds
- Choose which types to receive
- Set quiet hours (coming soon)

---

## Settings

Customize the application to your preferences.

### Account Settings

**ParkStay Credentials:**
- Email address
- Password (encrypted)
- Update credentials
- Test connection

**Profile Information:**
- First and last name
- Phone number
- Emergency contact

### Notification Settings

**Desktop Notifications:**
- Enable/disable system notifications
- Notification position
- Duration

**Sound Alerts:**
- Enable/disable sounds
- Choose notification sound
- Volume control

**Notification Types:**
- Watch found notifications
- STQ success notifications
- Error notifications
- System notifications

### Watch Settings

**Default Settings:**
- Default check interval
- Default notification behavior
- Default auto-book setting

**Rate Limiting:**
- Maximum concurrent watches
- Minimum interval between checks
- Retry behavior

### Skip The Queue Settings

**Default Settings:**
- Default check interval
- Default max attempts
- Default auto-rebook setting

**Behavior:**
- Retry on errors
- Pause on repeated failures
- Notification preferences

### Application Settings

**General:**
- Start app on system startup
- Start app minimized
- Minimize to system tray
- Close to system tray

**Appearance:**
- Theme: Light/Dark/System
- Compact mode
- Font size

**Updates:**
- Check for updates automatically
- Download updates automatically
- Update channel: Stable/Beta

**Advanced:**
- Log level: Info/Debug
- Export logs
- Clear cache
- Reset to defaults

### Data Management

**Backup:**
- Export all data (bookings, watches, settings)
- Save as JSON file
- Schedule automatic backups

**Restore:**
- Import data from backup file
- Merge or replace existing data
- Verify before restore

**Database:**
- Database location
- Database size
- Vacuum database (optimize)
- Reset database (delete all data)

---

## Tips and Best Practices

### Getting the Most from Watches

1. **Use Descriptive Names**: Name watches clearly (e.g., "Karijini Dales Apr 2025")
2. **Set Reasonable Intervals**: 5 minutes is good for most cases
3. **Start with Notification Only**: Test before enabling auto-book
4. **Monitor Regularly**: Check watch status periodically
5. **Use Multiple Watches**: Create separate watches for different preferences

### Skip The Queue Tips

1. **Enable Immediately**: Set up STQ right after confirming booking
2. **Be Aggressive**: Use 2-minute interval for high-demand sites
3. **Set High Max Attempts**: 1000+ attempts is reasonable
4. **Check Progress**: Monitor attempt count regularly
5. **Have Patience**: Success can take time

### Booking Management

1. **Sync Regularly**: Keep bookings up to date with ParkStay
2. **Import All**: Import all bookings for complete view
3. **Use Filters**: Organize bookings by status and date
4. **Add Notes**: Document special requests or details

### Security

1. **Strong Password**: Use a strong ParkStay password
2. **Keep Updated**: Install app updates promptly
3. **Secure Computer**: Use password/biometric login on your computer
4. **Review Access**: Periodically verify ParkStay login sessions

### Performance

1. **Limit Watches**: Keep active watches under 10 for best performance
2. **Reasonable Intervals**: Don't set every watch to 2 minutes
3. **Close Unused**: Delete watches you no longer need
4. **Restart Periodically**: Restart app weekly to clear memory

---

## FAQ

### General Questions

**Q: Is this app official or affiliated with ParkStay?**
A: No, this is an independent tool. It uses ParkStay's public website like a regular user would.

**Q: Is it legal to use this app?**
A: Yes, the app simply automates what you could do manually by checking the website repeatedly.

**Q: Will I get banned from ParkStay?**
A: The app respects rate limits and mimics human behavior. Use reasonable check intervals (5+ minutes).

**Q: Does this app guarantee I'll get a booking?**
A: No, it increases your chances but doesn't guarantee availability. Popular sites sell out quickly.

**Q: Is my data safe?**
A: Yes, all data is stored locally on your computer. Your password is encrypted using industry-standard encryption.

### Watch Questions

**Q: How often should I check for availability?**
A: 5 minutes is a good balance. More frequent checking doesn't significantly improve chances.

**Q: Can I watch multiple parks at once?**
A: Yes, create separate watches for different parks. Limit to 10 active watches for best performance.

**Q: What happens if I miss a notification?**
A: Notifications stay in the app. The site might be taken by someone else, but you can keep watching.

**Q: Should I enable auto-booking?**
A: Only if you're certain you want to book. You'll be charged immediately. Start with notifications only.

**Q: My watch hasn't found anything. What should I do?**
A: Be patient. Some sites rarely have availability. Consider alternative dates or locations.

### Skip The Queue Questions

**Q: What is Skip The Queue?**
A: A ParkStay feature that lets you try to rebook if someone cancels your reservation.

**Q: When should I use Skip The Queue?**
A: When you have a confirmed booking you really want to keep, especially for high-demand sites.

**Q: How long does STQ take?**
A: Varies greatly. Could be hours, days, or never depending on cancellations.

**Q: Can I run multiple STQ entries?**
A: Yes, but each uses resources. Limit to bookings you really care about.

**Q: What if STQ never succeeds?**
A: You'll reach max attempts and it will stop. You can increase attempts or try different strategy.

### Technical Questions

**Q: Does the app need to stay open?**
A: Yes, watches and STQ only run while the app is open. It can run in the background/tray.

**Q: What happens if my computer sleeps?**
A: Watches and STQ pause during sleep and resume when computer wakes.

**Q: Can I run this on multiple computers?**
A: Yes, but be careful of rate limiting. Each instance checks independently.

**Q: How much bandwidth does it use?**
A: Minimal. Each check is a small HTTP request (few KB).

**Q: Does this work on VPN?**
A: Yes, as long as the VPN doesn't block ParkStay website.

### Troubleshooting

**Q: Getting "Invalid credentials" error?**
A: Update your credentials in Settings. Make sure you can log in to ParkStay website directly.

**Q: Watch shows "Error" status?**
A: Check logs for details. Usually network issues or ParkStay being down. Will retry automatically.

**Q: Notifications not working?**
A: Check notification settings. Ensure system notifications are enabled for the app.

**Q: App is slow or unresponsive?**
A: Restart the app. Reduce number of active watches. Clear cache in Settings.

**Q: Lost my data after update?**
A: Data should persist across updates. Check backup location or contact support.

---

## Getting Help

If you need additional assistance:

1. **Check Documentation**: Re-read relevant sections of this guide
2. **Search Issues**: Look through [GitHub Issues](https://github.com/your-username/parkstay-bookings/issues)
3. **Ask Question**: Create a new issue with the "question" label
4. **Report Bug**: Create an issue with detailed information
5. **Contact Support**: Email support@example.com (if applicable)

---

## What's Next?

Now that you're familiar with the application:

1. **Create Your First Watch**: Start monitoring availability
2. **Import Your Bookings**: Get all bookings in one place
3. **Customize Settings**: Tailor the app to your preferences
4. **Explore Features**: Try different notification options
5. **Share Feedback**: Let us know how we can improve!

Happy camping!

---

## Additional Resources

- [Installation Guide](./installation.md) - Installation and setup help
- [Development Guide](./development.md) - Contributing to the project
- [Architecture Documentation](./architecture/) - Technical details
- [GitHub Repository](https://github.com/your-username/parkstay-bookings) - Source code and issues
