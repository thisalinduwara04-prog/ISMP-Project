import { Link } from 'react-router-dom';

import Icon from './Icon';

// One dashboard figure, as a link into the module it summarises.
//
// A Link rather than a div with an onClick, so the card takes focus, activates
// on Enter and opens in a new tab - the same reasoning as the tiles it
// replaced.
//
// `tone="alert"` changes the colour AND adds the warning glyph; `tone="ok"`
// changes the colour AND adds a tick. Callers always pass a `sub` line saying
// what the state is in words. The state is never carried by colour alone
// (NFR-USE-03). `icon` is decorative and sits beside the label.
//
// `accent` (red | green | amber | blue) tints the card and its icon so a row of
// figures can be told apart at a glance. It is decoration, like the icon: the
// label says what the figure is. `progress` (0-100) draws a thin bar under the
// value for a figure that is itself a percentage.
const TONE_GLYPH = { alert: 'alert', ok: 'check' };

const StatCard = ({
  label,
  value,
  sub,
  to,
  icon,
  tone = 'default',
  accent,
  progress,
  wide = false,
  loading = false,
  error = '',
}) => {
  const classes = ['stat-card'];
  if (wide) classes.push('stat-card--wide');
  if (tone === 'alert') classes.push('stat-card--alert');
  if (tone === 'ok') classes.push('stat-card--ok');
  if (accent) classes.push(`stat-card--${accent}`);

  const showProgress = typeof progress === 'number' && !loading && !error;

  const shown = value === null || value === undefined ? '—' : value;

  // Without `to` it is a figure, not a way in: a plain block that does not lift
  // on hover or take focus, so it does not claim to be clickable.
  const Tag = to ? Link : 'div';
  if (!to) classes.push('stat-card--static');

  return (
    <Tag to={to} className={classes.join(' ')}>
      {icon ? (
        <span className="stat-card__icon">
          <Icon name={icon} className="" />
        </span>
      ) : null}

      <span className="stat-card__body">
        <span className="stat-card__label">{label}</span>

        <span className="stat-card__value">
          {loading ? '…' : null}
          {!loading && error ? <span className="stat-card__sub">{error}</span> : null}
          {!loading && !error ? shown : null}
        </span>

        {showProgress ? (
          <span className="meter stat-card__meter" aria-hidden="true">
            <span
              className="meter__fill"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </span>
        ) : null}

        {sub && !error ? (
          <span className="stat-card__sub">
            {TONE_GLYPH[tone] ? <Icon name={TONE_GLYPH[tone]} className="" /> : null}
            {sub}
          </span>
        ) : null}
      </span>

      {to ? <Icon name="chevron" className="stat-card__chevron" /> : null}
    </Tag>
  );
};

export default StatCard;
