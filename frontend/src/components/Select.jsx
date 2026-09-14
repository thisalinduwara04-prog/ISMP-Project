// `options` is [{ value, label }]. A placeholder is rendered as a disabled
// empty option so an unanswered select cannot be submitted as a real choice.
const Select = ({ id, name, value, onChange, options = [], placeholder, required = false, disabled = false }) => (
  <select
    id={id}
    name={name}
    className="field__input field__select"
    value={value}
    onChange={onChange}
    required={required}
    disabled={disabled}
  >
    {placeholder && (
      <option value="" disabled>
        {placeholder}
      </option>
    )}
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

export default Select;
