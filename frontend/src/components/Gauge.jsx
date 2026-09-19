// One percentage as a ring, with a legend of the figures behind it.
//
// Drawn with stroke-dasharray on two concentric circles - a track and an arc -
// the same technique SeverityPie uses, so there is still no charting library
// (CLAUDE.md rule 2).
//
// The ring is decoration: the percentage is printed inside it, and every row of
// the legend carries its own number as text. Read with colour and shape ignored
// entirely, nothing is lost (NFR-USE-03).

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = 132;
const CENTRE = SIZE / 2;

// The arc is drawn in graphite when there is nothing overdue and in the danger
// colour when there is, which matches the wording the caller puts in the legend
// rather than replacing it.
const Gauge = ({ percent = 0, label, rows = [], tone = 'default' }) => {
  const safe = Math.max(0, Math.min(100, percent));
  const arc = (safe / 100) * CIRCUMFERENCE;

  return (
    <div className="gauge">
      <svg
        className="gauge__ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${label}: ${safe}%`}
      >
        <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
          <circle
            className="gauge__track"
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            fill="none"
            strokeWidth="14"
          />
          {safe > 0 && (
            <circle
              className={tone === 'alert' ? 'gauge__arc gauge__arc--alert' : 'gauge__arc'}
              cx={CENTRE}
              cy={CENTRE}
              r={RADIUS}
              fill="none"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${arc} ${CIRCUMFERENCE - arc}`}
            />
          )}
        </g>
        <text
          className="gauge__value"
          x={CENTRE}
          y={CENTRE}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {safe}%
        </text>
      </svg>

      {/* A list rather than a description list: the meter has to sit alongside
          the label and value, and a <dl> only legally contains dt and dd. Same
          shape as the legend on SeverityPie. */}
      <ul className="gauge__legend">
        {rows.map((row) => (
          <li className="gauge__row" key={row.label}>
            <span className="gauge__row-head">
              <span>{row.label}</span>
              <span className="gauge__row-value">{row.value}</span>
            </span>
            {row.percent !== undefined && (
              <span className="meter" aria-hidden="true">
                <span
                  className={`meter__fill${row.tone === 'alert' ? ' meter__fill--overdue' : ''}`}
                  style={{ width: `${Math.max(0, Math.min(100, row.percent))}%` }}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Gauge;
