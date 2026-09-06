// The state of one assigned item, as a badge.
//
// Colour is never the only signal: each state has its own wording, so the
// badge still reads correctly in greyscale and to anyone who cannot
// distinguish the two tints (WCAG 2.1 AA, NFR-USE-03).
const LABELS = {
  OVERDUE: { text: 'Overdue', tone: 'danger' },
  PENDING: { text: 'To read', tone: 'warning' },
  ACKNOWLEDGED: { text: 'Acknowledged', tone: 'ok' },
  NOT_ASSIGNED: { text: 'Reference only', tone: 'neutral' },
};

const TaskBadge = ({ state }) => {
  const label = LABELS[state] || LABELS.NOT_ASSIGNED;

  return <span className={`badge badge--${label.tone}`}>{label.text}</span>;
};

export default TaskBadge;
