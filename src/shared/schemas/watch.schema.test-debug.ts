import { watchSchema } from './watch.schema';

const validInput = {
  name: 'Summer Camping Watch',
  parkId: 'park123',
  parkName: 'Test Park',
  campgroundId: 'camp123',
  campgroundName: 'Test Campground',
  arrivalDate: new Date('2025-07-01'),
  departureDate: new Date('2025-07-05'),
  numGuests: 4,
  checkIntervalMinutes: 60,
};

const result = watchSchema.safeParse(validInput);
console.log('Validation result:', result);
if (!result.success) {
  console.log('Errors:', JSON.stringify(result.error.issues, null, 2));
}
