export default function Loader({ label = 'Loading…' }) {
  return (
    <div className="loader">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
