import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../components/Alert';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastProvider';
import { getNotifications, readAllNotifications, readNotification } from '../api/notifications';
import { formatDateTime } from '../utils/format';

const Notifications = () => {
  const { notify } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try { setData(await getNotifications()); } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);

  // A failure here is shown on the page, not as a toast: the item is still
  // unread and the user needs to know that rather than watch a message vanish.
  const act = async (key, request, success) => {
    setBusy(key);
    setError('');
    try {
      await request();
      await load();
      notify(success);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy('');
    }
  };

  if (!data && !error) return <Spinner label="Loading notifications" />;

  return (
    <div className="page">
      <header className="page__header section-heading">
        <div><h1>Notifications</h1><p>{data?.unread || 0} unread</p></div>
        {!!data?.unread && (
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            disabled={!!busy}
            onClick={() => act('all', readAllNotifications, { title: 'All notifications marked as read' })}
          >
            {busy === 'all' ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </header>
      {error && <Alert title="Notifications unavailable">{error}</Alert>}
      {!data?.items.length ? (
        <EmptyState title="You have no notifications" body="Reminders and updates about your policies and training appear here." />
      ) : data.items.map((item) => (
        <article className={`card notification ${item.isRead ? '' : 'notification--unread'}`} key={item._id}>
          <div>
            <h2>{item.isRead ? '' : <span className="sr-only">Unread: </span>}{item.title}</h2>
            <p>{item.message}</p>
            <small className="muted">{formatDateTime(item.createdAt)}</small>
          </div>
          <div className="button-row">
            <Link className="btn btn--primary btn--sm" to={item.linkPath}>View task</Link>
            {!item.isRead && (
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                disabled={!!busy}
                onClick={() => act(item._id, () => readNotification(item._id), { title: 'Marked as read', message: item.title })}
              >
                {busy === item._id ? 'Marking…' : 'Mark read'}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
};

export default Notifications;
