import EmptyState from './EmptyState';

// The newest few audit entries. The audit endpoint already sorts newest-first,
// so this renders what it is given in the order it arrives.
//
// Actions are humanised the same way the audit browser does it: underscores to
// spaces, lower case.
const humanise = (action = '') => action.replaceAll('_', ' ').toLowerCase();

const ActivityList = ({ entries = [] }) => {
  if (entries.length === 0) {
    return <EmptyState title="No recent activity" body="Nothing has been recorded yet." />;
  }

  return (
    <div className="activity">
      {entries.map((entry) => (
        <div key={entry.id} className="activity__row">
          <span>
            {humanise(entry.action)}
            {entry.actor?.fullName ? ` · ${entry.actor.fullName}` : ''}
          </span>
          <span className="activity__when">{new Date(entry.timestamp).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default ActivityList;
