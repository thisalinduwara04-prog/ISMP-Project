// A counter appears once the value is within 200 characters of the limit -
// early enough to be useful, quiet enough not to nag from the first keystroke.
const Textarea = ({
  id,
  name,
  value,
  onChange,
  rows = 5,
  maxLength,
  placeholder,
  required = false,
  invalid = false,
}) => {
  const nearLimit = maxLength && value.length > maxLength - 200;

  return (
    <>
      <textarea
        id={id}
        name={name}
        className="field__input field__textarea"
        value={value}
        onChange={onChange}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        aria-invalid={invalid || undefined}
      />
      {nearLimit && (
        <span className="field__counter">
          {value.length} / {maxLength}
        </span>
      )}
    </>
  );
};

export default Textarea;
