import EmptyState from './EmptyState';
import Table from './Table';

// The newest few audit entries. The audit endpoint already sorts newest-first,
// so this renders what it is given in the order it arrives.
//
// Actions are humanised the same way the audit browser does it: underscores to
// spaces, lower case.
const humanise = (action = '') => action.replaceAll('_', ' ').toLowerCase();

// The dot is coloured by outcome; the outcome is repeated as screen-reader text
// so the colour is never the only signal (NFR-USE-03).
const columns = [
  {
    key: 'event',
    header: 'Event',
    render: (entry) => (
      <span className="activity__event">
        <span
          className={`activity__dot activity__dot--${(entry.outcome || 'SUCCESS').toLowerCase()}`}
          aria-hidden="true"
        />
        {humanise(entry.action)}
        <span className="sr-only"> ({(entry.outcome || 'SUCCESS').toLowerCase()})</span>
      </span>
    ),
  },
  {
    key: 'user',
    header: 'User',
    hideOnMobile: true,
    render: (entry) => <span className="activity__muted">{entry.actor?.fullName || '—'}</span>,
  },
  {
    key: 'time',
    header: 'Time',
    render: (entry) => (
      <span className="activity__muted">{new Date(entry.timestamp).toLocaleString()}</span>
    ),
  },
];

const ActivityList = ({ entries = [] }) => {
  if (entries.length === 0) {
    return <EmptyState title="No recent activity" body="Nothing has been recorded yet." />;
  }

  return <Table columns={columns} rows={entries} />;
};

export default ActivityList;
