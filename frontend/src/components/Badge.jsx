// A status pill in one of the four tones the stylesheet defines.
//
// Colour is never the only signal: the caller always passes wording that stands
// on its own, so the badge still reads correctly in greyscale and to a screen
// reader (NFR-USE-03). `TaskBadge` is the policy-specific version of this and
// picks its own wording; use this one where the states are not policy states.
const Badge = ({ tone = 'neutral', children }) => (
  <span className={`badge badge--${tone}`}>{children}</span>
);

export default Badge;
