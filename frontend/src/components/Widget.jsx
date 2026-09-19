import { Link } from 'react-router-dom';

import Spinner from './Spinner';

// One panel on a dashboard: a title, an optional subtitle, and content.
//
// `to` makes the whole panel a link into the module it summarises, the same
// reasoning as StatCard - the card takes focus, activates on Enter and opens in
// a new tab. Omit it for a panel that contains its own links, and the hover lift
// is dropped too so it does not claim to be clickable.
//
// `loading` and `error` are handled here because every widget needs the same
// three states and the alternative is the same ternary written at each call
// site. An error is stated in words in place of the content; the panel stays so
// the dashboard does not reflow into a hole.
const Widget = ({
  title,
  subtitle,
  to,
  span = 'half',
  tall = false,
  loading = false,
  error = '',
  loadingLabel = 'Loading…',
  action,
  footer,
  children,
}) => {
  const className = [
    'widget',
    span ? `widget-grid__${span}` : '',
    tall ? 'widget-grid__tall' : '',
  ].filter(Boolean).join(' ');

  // No title means the content carries its own heading (the call-to-action
  // panel does), so no empty <h2> is left for a screen reader to land on.
  const head = title && (
    <div className="widget__head">
      <div>
        <h2 className="widget__title">{title}</h2>
        {subtitle && <p className="widget__subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );

  const body = loading
    ? <Spinner label={loadingLabel} />
    : error
      ? <p className="muted">{error}</p>
      : children;

  if (to) {
    return (
      <Link to={to} className={className}>
        {head}
        {body}
      </Link>
    );
  }

  return (
    <section className={className}>
      {head}
      {body}
      {footer && <div className="widget__foot">{footer}</div>}
    </section>
  );
};

export default Widget;
