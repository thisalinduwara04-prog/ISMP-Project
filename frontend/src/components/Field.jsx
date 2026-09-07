// The <label class="field"> wrapper the auth pages hand-roll. Wrapping the
// control in the label is what gives every input an associated name without
// relying on each page remembering htmlFor (NFR-USE-03).
const Field = ({ label, htmlFor, hint, error, optional = false, children }) => (
  <label className="field" htmlFor={htmlFor}>
    <span className="field__label">
      {label}
      {optional && <span className="field__optional"> (optional)</span>}
    </span>
    {hint && <span className="field__hint">{hint}</span>}
    {children}
    {error && <span className="field__error">{error}</span>}
  </label>
);

export default Field;
