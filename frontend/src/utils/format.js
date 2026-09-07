// Dates are shown in the reader's own locale and timezone. An acknowledgement
// timestamp is evidence, so it is displayed in full - date AND time - rather
// than as "2 days ago", which cannot be quoted back to anyone.

export const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Plain language, because "due in 3 days" is understood immediately and
// "2026-09-09" has to be worked out.
export const dueDescription = (dueDate) => {
  if (!dueDate) return 'No due date';

  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / DAY_MS);

  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
};

// "1 minute 20 seconds" reads better than "80s" on a confirmation.
export const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes} minute${minutes === 1 ? '' : 's'}${rest ? ` ${rest} seconds` : ''}`;
};
