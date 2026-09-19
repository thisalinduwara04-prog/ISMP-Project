import { Link } from 'react-router-dom';

import AdminIcon from './AdminIcon';

// One dashboard figure, as a link into the module it summarises.
//
// A Link rather than a div with an onClick, so the card takes focus, activates
// on Enter and opens in a new tab - the same reasoning as the tiles it
// replaced.
//
// `tone="alert"` changes the colour AND adds the warning glyph, and callers
// always pass a `sub` line saying what is wrong in words. The state is never
// carried by colour alone (NFR-USE-03).
const StatCard = ({
  label,
  value,
  sub,
  to,
  tone = 'default',
  wide = false,
  loading = false,
  error = '',
}) => {
  const classes = ['stat-card'];
  if (wide) classes.push('stat-card--wide');
  if (tone === 'alert') classes.push('stat-card--alert');

  const shown = value === null || value === undefined ? '—' : value;

  return (
    <Link to={to} className={classes.join(' ')}>
      <span className="stat-card__label">{label}</span>

      <span className="stat-card__value">
        {loading ? '…' : null}
        {!loading && error ? <span className="stat-card__sub">{error}</span> : null}
        {!loading && !error ? shown : null}
      </span>

      {sub && !error ? (
        <span className="stat-card__sub">
          {tone === 'alert' ? <AdminIcon name="alert" /> : null}
          {sub}
        </span>
      ) : null}
    </Link>
  );
};

export default StatCard;
