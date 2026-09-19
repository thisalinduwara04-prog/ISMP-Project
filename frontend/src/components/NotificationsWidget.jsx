import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import EmptyState from './EmptyState';
import Widget from './Widget';
import { getNotifications } from '../api/notifications';
import { formatDateTime } from '../utils/format';

// The newest few notifications, on the employee and manager dashboards.
//
// Read-only here: marking something read happens on /notifications, where the
// whole feed is. Each row goes straight to the task the notification is about,
// because "you have a policy to read" is only useful one click from the policy.
// The feed endpoint already returns unread first, so the order is the server's.
const LIMIT = 4;

const NotificationsWidget = ({ span = 'half' }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getNotifications()
      .then((result) => active && setData(result))
      .catch((loadError) => active && setError(loadError.message));

    return () => {
      active = false;
    };
  }, []);

  const items = (data?.items || []).slice(0, LIMIT);

  return (
    <Widget
      title="Notifications"
      subtitle={data ? `${data.unread || 0} unread` : null}
      span={span}
      loading={!data && !error}
      loadingLabel="Loading notifications…"
      error={error}
      footer={(
        <Link to="/notifications" className="btn btn--ghost btn--sm">
          Open all notifications
        </Link>
      )}
    >
      {items.length === 0 ? (
        <EmptyState title="All quiet" body="Reminders and updates about your tasks appear here." />
      ) : (
        <ul className="feed">
          {items.map((item) => (
            <li key={item._id}>
              <Link
                to={item.linkPath || '/notifications'}
                className={`feed__item${item.isRead ? '' : ' feed__item--unread'}`}
              >
                <span className="feed__dot" aria-hidden="true" />
                <span className="feed__body">
                  <span className="feed__title">
                    {item.isRead ? '' : <span className="sr-only">Unread: </span>}
                    {item.title}
                  </span>
                  <span className="feed__when">{formatDateTime(item.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
};

export default NotificationsWidget;
