// `role="alert"` makes a screen reader announce the message as soon as it
// appears, which matters most for the login errors (NFR-USE-03).
const Alert = ({ tone = 'error', title, children }) => (
  <div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {title && <strong className="alert__title">{title}</strong>}
    <div className="alert__body">{children}</div>
  </div>
);

export default Alert;
