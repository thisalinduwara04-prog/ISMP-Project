const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const minutesFromNow = (minutes) => new Date(Date.now() + minutes * MINUTE_MS);
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

// Returns whole minutes remaining until `date`, rounded up and floored at 0.
// Used to tell a locked-out user how long they have left (UC-02, 4a).
const minutesUntil = (date) => {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / MINUTE_MS));
};

const isInPast = (date) => !!date && new Date(date).getTime() <= Date.now();

module.exports = { MINUTE_MS, HOUR_MS, DAY_MS, minutesFromNow, daysFromNow, minutesUntil, isInPast };
