import EmptyState from './EmptyState';
import { SEVERITY_LABELS } from '../constants';

// Donut drawn with stroke-dasharray on concentric circles: each slice is one
// circle whose dash pattern exposes only its own arc, offset to start where the
// previous slice ended. No charting library (CLAUDE.md rule 2).
//
// The legend carries the label and count for every severity, so the chart reads
// correctly with colour ignored entirely (NFR-USE-03). The slices hold no text,
// so their fills are not a text-contrast concern.

const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const COLOURS = {
  CRITICAL: '#e0574f',
  HIGH: '#f0a23c',
  MEDIUM: '#3fb8b0',
  LOW: '#b9bec7',
};

// Every dash length below is a fraction of this circumference, which is what
// makes the arcs add up to exactly one turn.
const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SeverityPie = ({ counts = {} }) => {
  const slices = ORDER.map((severity) => ({ severity, count: counts[severity] || 0 }));
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  if (total === 0) {
    return (
      <EmptyState
        title="No incidents reported"
        body="Nothing has been reported yet, so there is nothing to chart."
      />
    );
  }

  const label = slices
    .map((slice) => `${SEVERITY_LABELS[slice.severity]} ${slice.count}`)
    .join(', ');

  // Running offset, in the same units as the dash array.
  let consumed = 0;

  return (
    <div className="pie">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img"
        aria-label={`Incidents by severity: ${label}`}
      >
        <g transform="rotate(-90 75 75)">
          {slices.map((slice) => {
            if (slice.count === 0) return null;
            const length = (slice.count / total) * CIRCUMFERENCE;
            const arc = (
              <circle
                key={slice.severity}
                cx="75"
                cy="75"
                r={RADIUS}
                fill="none"
                stroke={COLOURS[slice.severity]}
                strokeWidth="24"
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-consumed}
              />
            );
            consumed += length;
            return arc;
          })}
        </g>
        <text x="75" y="75" textAnchor="middle" dominantBaseline="central"
          fontSize="26" fontWeight="700" fill="#14161a"
        >
          {total}
        </text>
      </svg>

      <ul className="pie__legend">
        {slices.map((slice) => (
          <li key={slice.severity}>
            <span
              className="pie__swatch"
              style={{ background: COLOURS[slice.severity] }}
              aria-hidden="true"
            />
            {SEVERITY_LABELS[slice.severity]}
            <span className="pie__count">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SeverityPie;
