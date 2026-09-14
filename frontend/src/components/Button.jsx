// Wraps the .btn classes so a variant is chosen by name rather than by
// remembering a modifier string. `busyLabel` covers the pattern every form on
// the site already uses: swap the label for a gerund while submitting.
const Button = ({
  variant = 'primary',
  size,
  block = false,
  type = 'button',
  disabled = false,
  busy = false,
  busyLabel,
  onClick,
  children,
}) => {
  const className = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={className}
      disabled={disabled || busy}
      onClick={onClick}
      aria-busy={busy || undefined}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
};

export default Button;
