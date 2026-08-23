const Spinner = ({ label = 'Loading…' }) => (
  <div className="spinner" role="status" aria-live="polite">
    <div className="spinner__ring" aria-hidden="true" />
    <p className="spinner__label">{label}</p>
  </div>
);

export default Spinner;
