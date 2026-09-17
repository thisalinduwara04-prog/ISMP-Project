import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import { getNotifications, readAllNotifications, readNotification } from '../api/notifications';

const Notifications = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try { setData(await getNotifications()); } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, []);

  if (!data && !error) return <Spinner label="Loading notifications" />;

  return (
    <div className="page">
      <header className="page__header section-heading">
        <div><h1>Notifications</h1><p>{data?.unread || 0} unread</p></div>
        {!!data?.unread && <button className="btn btn--ghost btn--sm" type="button" onClick={async () => { await readAllNotifications(); await load(); }}>Mark all read</button>}
      </header>
      {error && <Alert title="Notifications unavailable">{error}</Alert>}
      {!data?.items.length ? <section className="card"><p className="muted">You have no notifications.</p></section> : data.items.map((item) => (
        <article className={`card notification ${item.isRead ? '' : 'notification--unread'}`} key={item._id}>
          <div><h2>{item.title}</h2><p>{item.message}</p><small className="muted">{new Date(item.createdAt).toLocaleString()}</small></div>
          <div className="button-row">
            <Link className="btn btn--primary btn--sm" to={item.linkPath}>View task</Link>
            {!item.isRead && <button className="btn btn--ghost btn--sm" type="button" onClick={async () => { await readNotification(item._id); await load(); }}>Mark read</button>}
          </div>
        </article>
      ))}
    </div>
  );
};

export default Notifications;
