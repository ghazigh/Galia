// The house: everything time- and sky-related (clock, sun, moon, prayer times, reminders) is fixed
// to it, whatever device or time zone the app is opened from. The coordinates are Saint-Philippe,
// QC (town level, which moves prayer times by a few seconds at most).

export const HOME = {
  timeZone: 'America/Montreal',
  lat: 45.36,
  lng: -73.48,
  label: 'Saint-Philippe, QC',
} as const;
