// One badge for both severity and status. The tone is passed in from the
// label maps in constants.js rather than derived here, so the component stays
// unaware of any particular vocabulary.
const Badge = ({ tone = 'neutral', children }) => (
  <span className={`badge badge--${tone}`}>{children}</span>
);

export default Badge;
