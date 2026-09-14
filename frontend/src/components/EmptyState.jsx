// Shown wherever a list legitimately has nothing in it. `action` takes a node
// so the caller decides whether the next step is a link, a button or nothing.
const EmptyState = ({ title, body, action }) => (
  <div className="empty-state">
    <strong className="empty-state__title">{title}</strong>
    {body && <p className="empty-state__body">{body}</p>}
    {action}
  </div>
);

export default EmptyState;
